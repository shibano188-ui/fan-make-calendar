import type { VercelRequest, VercelResponse } from '@vercel/node';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
ポスト内容から以下の項目が含まれる場合のみ、各項目を「項目名: 内容」の形式で改行区切りで記述すること。
情報が見つからない項目は行ごと省略すること（「不明」「なし」「未定」「-」等の記載禁止）。全項目なければnull。推測・捏造厳禁。
- 参加方法: 抽選/先着/自由入場など
- 料金・コスト: 金額・購入条件
- 特典・限定: 特典内容
- 締切・重要日程: 申込締切など
- 注意点: 本人確認の有無など
- リンク: URL（アクセス先の簡単な説明）※ポストにURLや【ポスト内の外部リンク】があれば必ず記載`;

const EXTRACT_PROMPT_TWEET = `以下のXポストから、含まれるイベント・予定をすべて抽出してください。
1件のみの場合も必ず配列で返してください。
日本語で回答し、情報がない・不明な場合はnullを設定してください。
必ずJSON配列のみを返してください（余計な説明不要）。
${BASE_RULES}
${TWEET_MEMO_RULES}

${SCHEMA('上記ルールに従ったメモ文字列（改行は\\nで表現）or null')}`;

async function fetchTweetImage(url: string): Promise<string | null> {
  const m = url.match(/\/status\/(\d+)/);
  if (!m) return null;
  try {
    const res = await fetch(
      `https://cdn.syndication.twimg.com/tweet-result?id=${m[1]}&lang=ja`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    const photos = data.photos as Array<{ url: string }> | undefined;
    if (photos && photos.length > 0) return photos[0].url;
  } catch {}
  return null;
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const isTwitter = /twitter\.com|x\.com/.test(url);
    if (isTwitter) {
      const oembed = await fetch(
        `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`,
      );
      if (oembed.ok) {
        const data = await oembed.json() as { html?: string; author_name?: string };
        const html = data.html ?? '';
        // Extract external link (href + link text) before stripping HTML tags
        const linkRe = /<a\s[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]*)<\/a>/gi;
        const externalLinks: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = linkRe.exec(html)) !== null) {
          const [, href, text] = m;
          if (!href.includes('twitter.com') && !href.includes('x.com')) {
            const t = text.trim();
            externalLinks.push(t && t !== href ? `${t}（${href}）` : href);
          }
        }
        const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        let result = `投稿者: ${data.author_name ?? ''}\n内容: ${textContent}`;
        if (externalLinks.length > 0) {
          result += `\n【ポスト内の外部リンク】${externalLinks.join(' / ')}`;
        }
        return result;
      }
    }
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FanMakeCalendar/1.0)' },
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
    let rawText: string;

    if (imageBase64) {
      const completion = await groq.chat.completions.create({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType ?? 'image/jpeg'};base64,${imageBase64}` },
            },
            { type: 'text', text: `この画像のイベント情報を抽出してください。\n\n${EXTRACT_PROMPT}` },
          ],
        }],
      });
      rawText = completion.choices[0]?.message?.content ?? '';
    } else {
      const isTweet = /twitter\.com|x\.com/.test(url!);
      const [pageText, tweetImageUrl] = await Promise.all([
        fetchPageText(url!),
        isTweet ? fetchTweetImage(url!) : Promise.resolve(null),
      ]);
      const prompt = isTweet ? EXTRACT_PROMPT_TWEET : EXTRACT_PROMPT;
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 768,
        messages: [{
          role: 'user',
          content: `${pageText}\n\n---\n${prompt}`,
        }],
      });
      rawText = completion.choices[0]?.message?.content ?? '';

      const arrayMatch = rawText.match(/\[[\s\S]*\]/);
      const objectMatch = rawText.match(/\{[\s\S]*\}/);
      if (!arrayMatch && !objectMatch) return res.status(422).json({ error: 'Could not parse response' });

      let parsed: unknown[];
      if (arrayMatch) {
        const arr = JSON.parse(arrayMatch[0]);
        parsed = Array.isArray(arr) ? arr : [arr];
      } else {
        parsed = [JSON.parse(objectMatch![0])];
      }
      if (tweetImageUrl) {
        parsed.forEach(e => { (e as Record<string, unknown>).imageUrl = tweetImageUrl; });
      }
      return res.status(200).json(parsed);
    }

    const arrayMatch = rawText.match(/\[[\s\S]*\]/);
    const objectMatch = rawText.match(/\{[\s\S]*\}/);
    if (!arrayMatch && !objectMatch) return res.status(422).json({ error: 'Could not parse response' });

    let parsed: unknown[];
    if (arrayMatch) {
      const arr = JSON.parse(arrayMatch[0]);
      parsed = Array.isArray(arr) ? arr : [arr];
    } else {
      parsed = [JSON.parse(objectMatch![0])];
    }
    return res.status(200).json(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(err);
    return res.status(500).json({ error: 'Internal server error', detail: msg });
  }
}
