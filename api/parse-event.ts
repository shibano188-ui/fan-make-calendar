import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { checkParseRateLimit, getClientIp } from './_ratelimit.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 静的なシステムプロンプト（ルール・スキーマ）をキャッシュし、動的なコンテンツのみ毎回送る
async function claudeComplete(systemPrompt: string, userContent: string, maxTokens: number): Promise<string> {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: maxTokens,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent }],
  });
  const block = res.content[0];
  return block.type === 'text' ? block.text : '';
}

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

const CURRENT_YEAR = new Date().getFullYear();

const BASE_RULES = `
【現在の年】今年は${CURRENT_YEAR}年です。年が明示されていない場合は${CURRENT_YEAR}年として扱う。過去の年（例: 2023年、2024年）は絶対に使わない。
【終了日・終了時刻の抽出ルール】
- 「〜」「-」「まで」などで期間が示されている場合は必ずendDateを設定する
- 例: 「7/15〜7/20」→ date: "${CURRENT_YEAR}-07-15", endDate: "${CURRENT_YEAR}-07-20"
- 例: 「14:00〜17:00」→ time: "14:00", endTime: "17:00"
- 例: 「〜8月31日」→ endDate: "${CURRENT_YEAR}-08-31"
- 開始日のみ明記で終了日が不明な場合はendDate: null
【曖昧な日付の扱い（dateLabel）】
- 「8月上旬」→ date: "${CURRENT_YEAR}-08-05", dateLabel: "上旬"
- 「8月中旬」→ date: "${CURRENT_YEAR}-08-15", dateLabel: "中旬"
- 「8月下旬」→ date: "${CURRENT_YEAR}-08-25", dateLabel: "下旬"
- 「8月1週目」→ date: "${CURRENT_YEAR}-08-05", dateLabel: "上旬"
- 「8月2週目」→ date: "${CURRENT_YEAR}-08-15", dateLabel: "中旬"
- 「8月3週目」「8月4週目」「8月5週目」→ date: "${CURRENT_YEAR}-08-25", dateLabel: "下旬"
- 「8月発売」「8月予定」など月だけ → date: "${CURRENT_YEAR}-08-31", dateLabel: "中"（月の末日を使う。例: 8月→31日, 9月→30日, 2月→28日）
- 「春」「春頃」「春発売」など → date: "${CURRENT_YEAR}-04-15", dateLabel: "春頃"
- 「夏」「夏頃」「夏発売」など → date: "${CURRENT_YEAR}-08-15", dateLabel: "夏頃"
- 「秋」「秋頃」「秋発売」など → date: "${CURRENT_YEAR}-11-15", dateLabel: "秋頃"
- 「冬」「冬頃」「冬発売」など → date: "${CURRENT_YEAR}-02-15", dateLabel: "冬頃"
- 具体的な日付（「8月15日」など）→ dateLabel: null
- 日付の情報が全くない → date: null, dateLabel: null
【「本日」「今日」の扱い】
テキストに「ツイート投稿日: 〇年〇月〇日」が含まれる場合、「本日」「今日」はその日付として解釈する。
【受注生産・予約フラグのルール】
- テキストに「受注」という文字が含まれる場合は必ず isOrderMade: true
- isOrderMade=true の場合: preorderStart = 受付開始日, preorderEnd = 受付終了日
- date には「お渡し予定」「発送予定」「発売予定」などの実際のイベント日（受付期間とは別）を入れる
- 受付開始日・終了日が不明な場合は preorderStart/preorderEnd を null にする
- isOrderMade=false の通常イベントでは preorderStart/preorderEnd は null`;

const SCHEMA = (memoDesc: string) => `[
  {
    "title": "イベントのタイトル（必須、簡潔に）",
    "date": "実際のイベント日・発売日・お渡し日をYYYY-MM-DD形式で or null（予約受付期間とは別）",
    "dateLabel": "'上旬'|'中旬'|'下旬'|'中'|'春頃'|'夏頃'|'秋頃'|'冬頃'（曖昧な日付の場合）or null",
    "time": "開始時刻をHH:mm形式で or null",
    "endDate": "通常イベントの終了日をYYYY-MM-DD形式で（期間表記があれば設定）or null",
    "endTime": "終了時刻をHH:mm形式で（時間範囲があれば設定）or null",
    "category": "書籍|グッズ|イベント|誕生日|アニメ・映画|グルメ|キャンペーン のいずれか or null（書籍＝単行本・小説・画集等、キャンペーン＝購入特典・フェア・コラボ等）",
    "prefecture": "都道府県名（「都」「府」「県」を除いた形。例: 東京・大阪・神奈川・北海道）or null",
    "locationDetail": "詳細な会場名・住所 or null",
    "link": ["公式URLや関連リンクをすべて配列で。1件でも配列にする。リンクがなければnull"],
    "isOrderMade": "「受注」という言葉が含まれる場合はtrue（受注生産・受注販売・受注商品・原作受注など）、それ以外はfalse",
    "preorderStart": "isOrderMade=trueの場合のみ: 予約・受付開始日をYYYY-MM-DD形式で or null",
    "preorderEnd": "isOrderMade=trueの場合のみ: 予約・受付終了日をYYYY-MM-DD形式で or null",
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
ポスト内容に明記されている場合のみ、以下の情報を記述する。
絶対に守ること:
- ポストに書かれていない情報は一切書かない（推測・捏造禁止）
- 「不明」「なし」「-」「未定」「null」等の文字列を書かない
- 情報がない場合はその内容を省略する
- 全項目が該当しない場合は文字列ではなくJSONのnullを返す
- titleフィールドに書いた内容と同じことをmemoに書かない（冗長になるため）
- 会場名・場所・期間はlocationDetail/prefecture/date/endDateフィールドに書くのでmemoには不要
- 「参加方法:」「料金:」のような見出し・ラベルは書かない。情報の内容だけを書く
記述できる情報（明記されている場合のみ）:
- 参加方法（抽選/先着/自由入場など）
- 料金・金額
- 付属品・同梱物
- 特典・限定内容
- 商品バリエーション（全X種、具体的な種類名や対象キャラ名など）
- 申込締切・重要な日程
- 注意事項
【受注生産のmemo】
isOrderMade=trueの場合、「お渡し予定」「発送予定」「発売予定」などの情報があればmemoに記載する（例: "お渡し予定: 2026年12月上旬"）。

【出力例】
ポストに「抽選、価格3,800円、7/20締切、全8種（ハチワレ・うさぎ・モモンガなど）」がある場合:
"抽選\n3,800円\n7月20日締切\n全8種（ハチワレ・うさぎ・モモンガ 他）"

ポストに「全8種」とだけある場合:
"全8種"

ポストに「ハチワレ・うさぎ・モモンガ」の種類名だけある場合:
"ハチワレ・うさぎ・モモンガ"

これらの情報がポストに一切ない場合: null（文字列ではなくJSONのnull）`;

const EXTRACT_PROMPT_TWEET = `以下のXポストから、含まれるイベント・予定をすべて抽出してください。
1件のみの場合も必ず配列で返してください。
日本語で回答し、情報がない・不明な場合はnullを設定してください。
必ずJSON配列のみを返してください（余計な説明不要）。
${BASE_RULES}
${TWEET_MEMO_RULES}

${SCHEMA('上記ルールに従ったメモ文字列（改行は\\nで表現）or null')}`;

// 受注・予約ありで締切不明のとき、画像から締切日だけを取得（低コスト）
async function fetchReservationEndFromImage(imageUrlOrJson: string): Promise<string | null> {
  try {
    let urls: string[];
    try {
      const parsed = JSON.parse(imageUrlOrJson);
      urls = Array.isArray(parsed) ? parsed : [imageUrlOrJson];
    } catch {
      urls = [imageUrlOrJson];
    }
    const content: Anthropic.Messages.MessageParam['content'] = [
      ...urls.slice(0, 4).map(u => ({
        type: 'image' as const,
        source: { type: 'url' as const, url: u },
      })),
      {
        type: 'text' as const,
        text: 'この画像から予約締切日・受注受付終了日・注文締切日を探してください。見つかった場合はYYYY-MM-DD形式のみで返してください（例: 2026-07-31）。見つからない場合は "null" とだけ返してください。',
      },
    ];
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 50,
      messages: [{ role: 'user', content }],
    });
    const block = res.content[0];
    const text = block.type === 'text' ? block.text.trim() : '';
    const match = text.match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  } catch { return null; }
}

type TweetContent = { text: string; imageUrl: string | null };

// ツイートのテキスト・外部リンク・画像をまとめて取得
async function fetchTweetContent(tweetUrl: string): Promise<TweetContent> {
  const tweetId = tweetUrl.match(/\/status\/(\d+)/)?.[1];
  if (!tweetId) return { text: `URL: ${tweetUrl}`, imageUrl: null };

  type FxData = {
    tweet?: {
      text?: string;
      author?: { name?: string };
      media?: { photos?: Array<{ url: string }> };
      links?: Array<{ url?: string; short_url?: string }>;
      created_at?: number; // Unix timestamp (seconds)
    };
  };
  type SynData = Record<string, unknown>;
  type OeData = { html?: string; author_name?: string };

  const fetchOe = (u: string) =>
    fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(u)}&omit_script=true`, {
      signal: AbortSignal.timeout(5000),
    }).then(r => r.ok ? (r.json() as Promise<OeData>) : null).catch(() => null);

  // oEmbed は元のURLと twitter.com/i/web/status/ 形式の両方を試す
  // （x.com/username/status/ は元URLで通り、x.com/i/status/ は twitter.com 形式で通る）
  const [fxResult, synResult, oe1Result, oe2Result] = await Promise.allSettled([
    fetch(`https://api.fxtwitter.com/status/${tweetId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    }).then(r => r.ok ? (r.json() as Promise<FxData>) : null).catch(() => null),

    fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=ja`, {
      signal: AbortSignal.timeout(4000),
    }).then(r => r.ok ? (r.json() as Promise<SynData>) : null).catch(() => null),

    fetchOe(tweetUrl),
    fetchOe(`https://twitter.com/i/web/status/${tweetId}`),
  ]);

  const fx  = fxResult.status  === 'fulfilled' ? fxResult.value  : null;
  const syn = synResult.status  === 'fulfilled' ? synResult.value  : null;
  const oe1 = oe1Result.status === 'fulfilled' ? oe1Result.value : null;
  const oe2 = oe2Result.status === 'fulfilled' ? oe2Result.value : null;
  const oe  = (oe1?.html ? oe1 : null) ?? (oe2?.html ? oe2 : null);


  // ── 画像（fxtwitter → syndication の順）
  let imageUrl: string | null = null;
  if (fx?.tweet?.media?.photos?.length) {
    const urls = fx.tweet.media.photos.map(p => p.url);
    imageUrl = urls.length === 1 ? urls[0] : JSON.stringify(urls);
  } else if (syn) {
    const photos = syn.photos as Array<{ url: string }> | undefined;
    const mediaDetails = syn.mediaDetails as Array<{ media_url_https: string; type?: string }> | undefined;
    let imgUrls: string[] = [];
    if (photos?.length) imgUrls = photos.map(p => p.url);
    else if (mediaDetails?.length) imgUrls = mediaDetails.filter(m => !m.type || m.type === 'photo').map(m => m.media_url_https);
    if (imgUrls.length === 1) imageUrl = imgUrls[0];
    else if (imgUrls.length > 1) imageUrl = JSON.stringify(imgUrls);
  }

  // ── ツイート投稿日の取得（「本日」解決用）
  const parseTweetDate = (ts: number | string | undefined): string | null => {
    if (!ts) return null;
    const d = new Date(typeof ts === 'number' ? ts * 1000 : ts);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };
  const tweetDate =
    parseTweetDate(fx?.tweet?.created_at) ??
    parseTweetDate((syn as { created_at?: string })?.created_at) ??
    null;

  // ── テキスト優先順: fxtwitter → syndication → oEmbed
  if (fx?.tweet?.text) {
    const extLinks = (fx.tweet.links ?? [])
      .map(l => l.url || l.short_url)
      .filter((u): u is string => !!u && !/twitter\.com|x\.com|t\.co/.test(u));
    let text = `投稿者: ${fx.tweet.author?.name ?? ''}`;
    if (tweetDate) text += `\nツイート投稿日: ${tweetDate}`;
    text += `\n内容: ${fx.tweet.text}`;
    if (extLinks.length > 0) text += `\n【ポスト内の外部リンク】${extLinks.join(' / ')}`;
    return { text, imageUrl };
  }

  if (syn) {
    const tweetText = (syn.text ?? syn.full_text ?? '') as string;
    const authorName = (syn as { user?: { name?: string } }).user?.name ?? '';
    const urlEntities = ((syn as { entities?: { urls?: Array<{ expanded_url?: string; display_url?: string }> } }).entities?.urls ?? []);
    const extLinks = urlEntities
      .map(u => u.expanded_url)
      .filter((u): u is string => !!u && !/twitter\.com|x\.com|t\.co/.test(u));
    let text = `投稿者: ${authorName}`;
    if (tweetDate) text += `\nツイート投稿日: ${tweetDate}`;
    text += `\n内容: ${tweetText}`;
    if (extLinks.length > 0) text += `\n【ポスト内の外部リンク】${extLinks.join(' / ')}`;
    return { text, imageUrl };
  }

  if (oe?.html) {
    const html = oe.html;
    const linkRe = /<a\s[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]*)<\/a>/gi;
    const rawLinks: { href: string; text: string }[] = [];
    let lm: RegExpExecArray | null;
    while ((lm = linkRe.exec(html)) !== null) {
      const [, href, linkText] = lm;
      if (!href.includes('twitter.com') && !href.includes('x.com')) rawLinks.push({ href, text: linkText.trim() });
    }
    const resolved = await Promise.all(rawLinks.map(async ({ href, text }) => ({ text, final: await resolveUrl(href) })));
    const externalLinks: string[] = [];
    for (const { text, final } of resolved) {
      if (/pbs\.twimg\.com|twimg\.com/.test(final)) continue;
      if (!final || /twitter\.com|x\.com/.test(final)) continue;
      const visibleClean = (text && !text.includes('t.co')) ? text.replace(/….*$/, '') : '';
      const resolvedFinal = final.includes('t.co/')
        ? visibleClean ? `https://${visibleClean.replace(/^https?:\/\//, '')}` : ''
        : final;
      if (!resolvedFinal || externalLinks.some(l => l.includes(resolvedFinal.split('?')[0]))) continue;
      externalLinks.push(visibleClean && visibleClean !== resolvedFinal ? `${visibleClean}（${resolvedFinal}）` : resolvedFinal);
    }
    const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    let text = `投稿者: ${oe.author_name ?? ''}\n内容: ${textContent}`;
    if (externalLinks.length > 0) text += `\n【ポスト内の外部リンク】${externalLinks.join(' / ')}`;
    return { text, imageUrl };
  }

  return { text: `URL: ${tweetUrl}`, imageUrl };
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

// 小モデルが「null」「不明」等の文字列をmemoに書いてしまう問題を後処理で除去
function cleanMemo(memo: unknown): string | null {
  if (memo === null || memo === undefined) return null;
  const s = String(memo).trim();
  if (!s || /^(null|なし|不明|未定|[-—ー]+)$/i.test(s)) return null;
  // 各行から「値が null/不明/なし/未定」の行を除去
  const cleaned = s.split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false;
      const val = line.includes(':') ? line.split(':').slice(1).join(':').trim() : line;
      return !/^(null|なし|不明|未定|[-—ー]+)$/i.test(val);
    })
    .join('\n');
  return cleaned || null;
}

function parseRawText(rawText: string): unknown[] {
  const arrayMatch = rawText.match(/\[[\s\S]*\]/);
  const objectMatch = rawText.match(/\{[\s\S]*\}/);
  let arr: unknown[];
  if (arrayMatch) {
    const parsed = JSON.parse(arrayMatch[0]);
    arr = Array.isArray(parsed) ? parsed : [parsed];
  } else if (objectMatch) {
    arr = [JSON.parse(objectMatch[0])];
  } else {
    throw new Error('Could not parse AI response');
  }
  const currentYear = new Date().getFullYear();
  // 年が明らかに過去（2年以上前）の場合は現在年に補正
  const fixYear = (dateStr: unknown): unknown => {
    if (typeof dateStr !== 'string') return dateStr;
    const m = dateStr.match(/^(\d{4})-(\d{2}-\d{2})$/);
    if (!m) return dateStr;
    const year = parseInt(m[1], 10);
    if (year < currentYear - 1) return `${currentYear}-${m[2]}`;
    return dateStr;
  };

  return arr.map(item => {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      // link が配列で返ってきた場合: 1件→文字列、複数→JSON文字列、空→null
      const rawLink = obj.link;
      const normalizedLink = Array.isArray(rawLink)
        ? rawLink.filter((u): u is string => typeof u === 'string' && !!u).length === 0 ? null
          : rawLink.filter((u): u is string => typeof u === 'string' && !!u).length === 1
            ? rawLink.filter((u): u is string => typeof u === 'string' && !!u)[0]
            : JSON.stringify(rawLink.filter((u): u is string => typeof u === 'string' && !!u))
        : rawLink;
      const rawDateLabel = obj.dateLabel as string | null | undefined;
      const validLabels = ['上旬', '中旬', '下旬', '中', '春頃', '夏頃', '秋頃', '冬頃'];
      const dateLabel = rawDateLabel && validLabels.includes(rawDateLabel) ? rawDateLabel : null;
      const rawIsOrderMade = obj.isOrderMade;
      const isOrderMade = rawIsOrderMade === true || rawIsOrderMade === 'true';
      return {
        ...obj,
        link: normalizedLink,
        date: fixYear(obj.date),
        dateLabel,
        endDate: fixYear(obj.endDate),
        memo: cleanMemo(obj.memo),
        isOrderMade,
        preorderStart: fixYear(obj.preorderStart),
        preorderEnd: fixYear(obj.preorderEnd),
      };
    }
    return item;
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  const rl = await checkParseRateLimit(getClientIp(req));
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    return res.status(429).json({ error: 'rate_limited' });
  }

  const { url, imageBase64, mimeType, sharedText } = req.body as {
    url?: string;
    imageBase64?: string;
    mimeType?: string;
    sharedText?: string;
  };

  if (!url && !imageBase64) {
    return res.status(400).json({ error: 'url or imageBase64 is required' });
  }

  try {
    if (imageBase64) {
      const res2 = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: (mimeType ?? 'image/jpeg') as 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: `この画像のイベント情報を抽出してください。\n\n${EXTRACT_PROMPT}` },
          ],
        }],
      });
      const block = res2.content[0];
      const rawText = block.type === 'text' ? block.text : '';
      try {
        return res.status(200).json(parseRawText(rawText));
      } catch {
        return res.status(422).json({ error: 'Could not parse response' });
      }
    }

    // ── URL前処理 ──────────────────────────────────────────────
    // 1. mixed content（"ツイート本文 https://t.co/xxx"）からURLだけ取り出す
    let processUrl = url!.trim();
    if (!/^https?:\/\//.test(processUrl)) {
      processUrl = processUrl.match(/https?:\/\/\S+/)?.[0] ?? processUrl;
    }
    // 2. t.co 短縮URLをリダイレクト先へ解決（X アプリが t.co を送ってくる場合）
    if (/^https?:\/\/t\.co\//.test(processUrl)) {
      try {
        const r = await fetch(processUrl, {
          method: 'GET', redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(4000),
        });
        if (r.url && r.url !== processUrl) processUrl = r.url;
      } catch {}
    }
    // ────────────────────────────────────────────────────────────

    const isTweet = /twitter\.com|x\.com/.test(processUrl);

    if (isTweet) {
      const { text: pageText, imageUrl: tweetImageUrl } = await fetchTweetContent(processUrl);
      // sharedText（X アプリが Web Share で送ってきたツイート本文）があれば先頭に追加
      const tweetContext = sharedText
        ? `ポスト本文（X アプリより直接）: ${sharedText}\n\n${pageText}`
        : pageText;
      const rawText = await claudeComplete(EXTRACT_PROMPT_TWEET, tweetContext, 800);
      let parsed: unknown[];
      try {
        parsed = parseRawText(rawText);
      } catch {
        return res.status(422).json({ error: 'Could not parse response' });
      }
      // テキストに「受注」があれば全イベントをisOrderMade=trueに強制設定
      if (/受注/.test(tweetContext)) {
        parsed.forEach(e => { (e as Record<string, unknown>).isOrderMade = true; });
      }
      if (tweetImageUrl) {
        parsed.forEach(e => { (e as Record<string, unknown>).imageUrl = tweetImageUrl; });
        // 受注生産で受付終了日不明なら画像から取得
        const needsFallback = parsed.some(e => {
          const ev = e as Record<string, unknown>;
          return ev.isOrderMade === true && !ev.endDate;
        });
        if (needsFallback) {
          const endDate = await fetchReservationEndFromImage(tweetImageUrl);
          if (endDate) {
            parsed.forEach(e => {
              const ev = e as Record<string, unknown>;
              if (ev.isOrderMade === true && !ev.endDate) {
                ev.endDate = endDate;
              }
            });
          }
        }
      }
      return res.status(200).json(parsed);
    }

    // 通常URL
    const pageText = await fetchPageText(processUrl);
    const rawText2 = await claudeComplete(EXTRACT_PROMPT, pageText, 768);
    try {
      const parsed = parseRawText(rawText2);
      return res.status(200).json(parsed);
    } catch {
      return res.status(422).json({ error: 'Could not parse response' });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(err);
    return res.status(500).json({ error: 'Internal server error', detail: msg });
  }
}
