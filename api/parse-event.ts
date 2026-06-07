import type { VercelRequest, VercelResponse } from '@vercel/node';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// t.co を実URLに解決（GET + redirect follow で確実に取得）
async function resolveUrl(url: string): Promise<string> {
  if (!url.includes('t.co/')) return url;
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FanHive/1.0)' },
      signal: AbortSignal.timeout(4000),
    });
    const final = res.url;
    if (/twitter\.com|x\.com|t\.co\//.test(final)) return '';
    return final;
  } catch { return url; }
}

const BASE_RULES = `
【終了日・終了時刻の抽出ルール】
- 「〜」「-」「まで」などで期間が示されている場合は必ずendDateを設定する
- 例: 「7/15〜7/20」→ date: "2025-07-15", endDate: "2025-07-20"
- 例: 「14:00〜17:00」→ time: "14:00", endTime: "17:00"
- 例: 「〜8月31日」→ endDate: "2025-08-31"
- 開始日のみ明記で終了日が不明な場合はendDate: null`;

const SCHEMA = (memoDesc: string) => `[
  {
    "title": "イベントのタイトル（必須、簡潔に）",
    "date": "開始日をYYYY-MM-DD形式で or null",
    "time": "開始時刻をHH:mm形式で or null",
    "endDate": "終了日をYYYY-MM-DD形式で（期間表記があれば必ず設定）or null",
    "endTime": "終了時刻をHH:mm形式で（時間範囲があれば必ず設定）or null",
    "category": "単行本|グッズ|イベント|誕生日|映画|アニメ|グルメ|コラボ のいずれか or null",
    "prefecture": "都道府県名（「都」「府」「県」を除いた形。例: 東京・大阪・神奈川・北海道）or null",
    "locationDetail": "詳細な会場名・住所 or null",
    "link": "公式URL or null",
    "memo": "${memoDesc}"
  }
]`;

const EXTRACT_PROMPT = `以下の情報から、含まれるイベント・予定をすべて抽出してください。
1件のみの場合も必ず配列で返してください。
日本語で回答し、情報がない・不明な場合はnullを設定してください。
必ずJSON配列のみを返してください（余計な説明不要）。
${BASE_RULES}

${SCHEMA('補足情報・注意事項 or null')}`;

const TWEET_MEMO_RULES = `
【memoフィールドのルール（Xポスト解析時）】
ポスト内容から以下の項目が含まれる場合のみ記述する。
ポストに記載がない項目はその行を一切出力しない（「不明」「なし」「-」「未定」等の記載禁止）。
全項目なければnull。推測・捏造厳禁。
各項目を「項目名: 内容」の形式で改行区切りで記述する。
- 参加方法: 抽選/先着/自由入場など
- 料金・コスト: 金額・購入条件
- 付属品: 付属・同梱されるもの
- 特典・限定: 特典内容
- 締切・重要日程: 申込締切など
- 注意点: 本人確認の有無など
- リンク: URL（アクセス先の説明）※【ポスト内の外部リンク】があれば必ず記載

【出力例】
ポストに「抽選、価格3,800円、7/20締切、申込: https://example.com」がある場合:
"参加方法: 抽選\n料金・コスト: 3,800円\n締切・重要日程: 7月20日\nリンク: https://example.com（申込フォーム）"

ポストにこれらの情報が一切ない場合: null`;

const EXTRACT_PROMPT_TWEET = `以下のXポストから、含まれるイベント・予定をすべて抽出してください。
1件のみの場合も必ず配列で返してください。
日本語で回答し、情報がない・不明な場合はnullを設定してください。
必ずJSON配列のみを返してください（余計な説明不要）。
${BASE_RULES}
${TWEET_MEMO_RULES}

${SCHEMA('上記ルールに従ったメモ文字列（改行は\\nで表現）or null')}`;

type TweetContent = { text: string; imageUrl: string | null };

// ツイートのテキスト・外部リンク・画像をまとめて取得
async function fetchTweetContent(tweetUrl: string): Promise<TweetContent> {
  const tweetId = tweetUrl.match(/\/status\/(\d+)/)?.[1];

  // oEmbed と syndication API を並行取得
  const [oembedRes, syndicationData] = await Promise.all([
    fetch(
      `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}&omit_script=true`,
    ).catch(() => null),
    tweetId
      ? fetch(
          `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=ja`,
          { signal: AbortSignal.timeout(4000) },
        )
          .then(r => (r.ok ? (r.json() as Promise<Record<string, unknown>>) : null))
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  // syndication API から画像URLを取得
  let imageUrl: string | null = null;
  console.log('[img] syndication:', syndicationData ? 'ok' : 'null');
  if (syndicationData) {
    const photos = syndicationData.photos as Array<{ url: string }> | undefined;
    console.log('[img] photos:', photos?.length ?? 0);
    if (photos?.length) {
      const urls = photos.map(p => p.url);
      imageUrl = urls.length === 1 ? urls[0] : JSON.stringify(urls);
    }
  }

  if (!oembedRes?.ok) return { text: `URL: ${tweetUrl}`, imageUrl };

  const data = await oembedRes.json() as { html?: string; author_name?: string };
  const html = data.html ?? '';

  // oEmbed HTML から href + visible text を抽出
  const linkRe = /<a\s[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]*)<\/a>/gi;
  const rawLinks: { href: string; text: string }[] = [];
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(html)) !== null) {
    const [, href, linkText] = lm;
    if (!href.includes('twitter.com') && !href.includes('x.com')) {
      rawLinks.push({ href, text: linkText.trim() });
    }
  }

  // t.co を並行解決
  const resolved = await Promise.all(
    rawLinks.map(async ({ href, text }) => ({
      href,
      text,
      final: await resolveUrl(href),
    })),
  );

  const externalLinks: string[] = [];
  const imgFromLinks: string[] = [];

  for (const { href, text, final } of resolved) {
    // pbs.twimg.com = 画像
    if (/pbs\.twimg\.com|twimg\.com/.test(final)) {
      imgFromLinks.push(final);
      continue;
    }
    // twitter/x 系は除外
    if (!final || /twitter\.com|x\.com/.test(final)) continue;

    // visible text（例: "heart-ltd.jp/product/110688/"）を利用
    const isVisibleUrl = text && !text.includes('t.co') && text !== href;
    const visibleClean = isVisibleUrl ? text.replace(/….*$/, '') : '';

    // t.co 解決失敗時は visible text から https:// で補完
    const resolvedFinal = final.includes('t.co/')
      ? visibleClean
        ? `https://${visibleClean.replace(/^https?:\/\//, '')}`
        : ''
      : final;

    if (!resolvedFinal) continue;
    // 重複除外
    if (externalLinks.some(l => l.includes(resolvedFinal.split('?')[0]))) continue;

    externalLinks.push(
      visibleClean && visibleClean !== resolvedFinal
        ? `${visibleClean}（${resolvedFinal}）`
        : resolvedFinal,
    );
  }

  // フォールバック①: link 解決で pbs.twimg.com が得られた場合
  if (!imageUrl && imgFromLinks.length > 0) {
    imageUrl = imgFromLinks.length === 1 ? imgFromLinks[0] : JSON.stringify(imgFromLinks);
  }

  // フォールバック②: ツイートページの og:image（Twitterbot UA で取得）
  if (!imageUrl) {
    try {
      const pageRes = await fetch(tweetUrl, {
        headers: { 'User-Agent': 'Twitterbot/1.0' },
        signal: AbortSignal.timeout(4000),
      });
      console.log('[img] og:image fetch status:', pageRes.status);
      if (pageRes.ok) {
        const pageHtml = await pageRes.text();
        const ogMatch =
          pageHtml.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ??
          pageHtml.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
        const ogUrl = ogMatch?.[1];
        console.log('[img] og:image url:', ogUrl ?? 'none');
        if (ogUrl && !ogUrl.includes('abs.twimg.com') && !ogUrl.includes('twitter.com/images')) {
          imageUrl = ogUrl;
        }
      }
    } catch (e) {
      console.log('[img] og:image error:', e);
    }
  }
  console.log('[img] final imageUrl:', imageUrl ?? 'null');

  const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  let text = `投稿者: ${data.author_name ?? ''}\n内容: ${textContent}`;
  if (externalLinks.length > 0) {
    text += `\n【ポスト内の外部リンク】${externalLinks.join(' / ')}`;
  }
  return { text, imageUrl };
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FanHive/1.0)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return `URL: ${url}`;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
    return `URL: ${url}\n\n${text}`;
  } catch {
    return `URL: ${url}`;
  }
}

function parseRawText(rawText: string): unknown[] {
  const arrayMatch = rawText.match(/\[[\s\S]*\]/);
  const objectMatch = rawText.match(/\{[\s\S]*\}/);
  if (arrayMatch) {
    const arr = JSON.parse(arrayMatch[0]);
    return Array.isArray(arr) ? arr : [arr];
  }
  if (objectMatch) return [JSON.parse(objectMatch[0])];
  throw new Error('Could not parse AI response');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { url, imageBase64, mimeType } = req.body as {
    url?: string;
    imageBase64?: string;
    mimeType?: string;
  };

  if (!url && !imageBase64) {
    return res.status(400).json({ error: 'url or imageBase64 is required' });
  }

  try {
    if (imageBase64) {
      const completion = await groq.chat.completions.create({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType ?? 'image/jpeg'};base64,${imageBase64}` } },
            { type: 'text', text: `この画像のイベント情報を抽出してください。\n\n${EXTRACT_PROMPT}` },
          ],
        }],
      });
      const rawText = completion.choices[0]?.message?.content ?? '';
      try {
        return res.status(200).json(parseRawText(rawText));
      } catch {
        return res.status(422).json({ error: 'Could not parse response' });
      }
    }

    const isTweet = /twitter\.com|x\.com/.test(url!);

    if (isTweet) {
      const { text: pageText, imageUrl: tweetImageUrl } = await fetchTweetContent(url!);
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 800,
        messages: [{ role: 'user', content: `${pageText}\n\n---\n${EXTRACT_PROMPT_TWEET}` }],
      });
      const rawText = completion.choices[0]?.message?.content ?? '';
      let parsed: unknown[];
      try {
        parsed = parseRawText(rawText);
      } catch {
        return res.status(422).json({ error: 'Could not parse response' });
      }
      if (tweetImageUrl) {
        parsed.forEach(e => { (e as Record<string, unknown>).imageUrl = tweetImageUrl; });
      }
      return res.status(200).json(parsed);
    }

    // 通常URL
    const pageText = await fetchPageText(url!);
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 768,
      messages: [{ role: 'user', content: `${pageText}\n\n---\n${EXTRACT_PROMPT}` }],
    });
    const rawText = completion.choices[0]?.message?.content ?? '';
    try {
      return res.status(200).json(parseRawText(rawText));
    } catch {
      return res.status(422).json({ error: 'Could not parse response' });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(err);
    return res.status(500).json({ error: 'Internal server error', detail: msg });
  }
}
