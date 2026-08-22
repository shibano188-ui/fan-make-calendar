import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { checkRateLimitFor, getClientIp } from './_ratelimit.js';
import { getIdentity } from './_identity.js';
import { withAiUsage, noteAiUsage, saveAiUsage, type AiCall } from './_aiusage.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 静的なシステムプロンプト（ルール・スキーマ）をキャッシュし、動的なコンテンツのみ毎回送る
async function claudeComplete(systemPrompt: string, userContent: string, maxTokens: number): Promise<string> {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: maxTokens,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent }],
  });
  noteAiUsage('claude-haiku-4-5', res.usage);
  const block = res.content[0];
  return block.type === 'text' ? block.text : '';
}

// 短縮URLのホスト。展開しないと販路名が「x.gd」になり、どの店か分からないまま保存される
// （2026-07-26 実測3件）。アフィ判定・価格取得もホストで決まるので、保存前に必ず実URLへ戻す。
const SHORTENER_HOSTS = /^(t\.co|x\.gd|bit\.ly|bitly\.com|tinyurl\.com|is\.gd|v\.gd|ow\.ly|buff\.ly|cutt\.ly|rebrand\.ly|shorturl\.at|s\.id|onl\.(bz|sc)|urx\d?\.(blue|nu)|ur0\.(link|work)|amzn\.(to|asia)|a\.r10\.to)$/i;
function isShortUrl(url: string): boolean {
  try { return SHORTENER_HOSTS.test(new URL(url).host.replace(/^www\./, '')); } catch { return false; }
}

// 解析にかけてよいURLは **Xのポスト** だけ（2026-08-10 本人確定）。理由は2つ:
//  ・まとめ記事やニュースを解析させられると、予定にならないゴミが生まれる
//  ・任意のホストへサーバーが接続する口になっていた（内部アドレスも弾いていなかった）
// 販売先のURLは解析対象ではない。投稿画面の購入リンク欄に入れてもらう。
function isXPostUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.host.replace(/^www\./, '').toLowerCase();
    if (host !== 'x.com' && host !== 'twitter.com' && host !== 'mobile.twitter.com') return false;
    return /\/status\/\d+/.test(u.pathname);  // プロフィールや検索結果は本文が無いので通さない
  } catch { return false; }
}

// リダイレクト先の Location にパスの日本語が生バイトで入っていると、fetch の res.url が
// それを latin-1 として読み直して二重エンコードされる（%E3%83%8B → %C3%A3%C2%83%C2%8B）。
// そのまま保存すると 404 になるURLが販路として残るので、latin-1→UTF-8 で読み直して戻す。
function deMojibake(url: string): string {
  try {
    const u = new URL(url);
    const dec = decodeURIComponent(u.pathname);
    if (!/[\u0080-\u00ff]/.test(dec)) return url;
    const fixed = Buffer.from(dec, 'latin1').toString('utf8');
    if (fixed.includes('\uFFFD')) return url; // UTF-8として読めない＝元から latin-1 のパス
    u.pathname = fixed;
    return u.toString();
  } catch { return url; }
}

// 短縮URLを実URLに解決（GET + redirect follow で確実に取得）
async function resolveUrl(url: string): Promise<string> {
  if (!isShortUrl(url)) return url;
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FanHive/1.0)' },
      signal: AbortSignal.timeout(4000),
    });
    const final = res.url;
    if (/twitter\.com|x\.com|t\.co\//.test(final)) return '';
    return deMojibake(final);
  } catch { return url; }
}

// まとめ記事・ニュース記事・SNSは購入導線ではないので link 候補から外す。
// Xのまとめアカウントの投稿は本文のリンクが大体これで、そのまま販路として保存するとノイズになる。
// src/lib/affiliate.ts の NOISE_LINK_PATTERNS と同期を保つこと。
const NOISE_LINK_HOSTS: RegExp[] = [
  /(^|\.)togetter\.com$/, /(^|\.)matomedane\.jp$/, /(^|\.)matomame\.jp$/, /(^|\.)curazy\.com$/,
  /(^|\.)blog\.jp$/, /(^|\.)livedoor\.(jp|biz)$/, /(^|\.)blog\.fc2\.com$/, /(^|\.)seesaa\.net$/,
  /(^|\.)(alfalfalfa|hamusoku|jin115|yaraon-blog|esuteru|otakomu|anihatsu|animanch|nijimen)\.(com|jp|net)$/,
  /(^|\.)(open2ch|5ch)\.net$/,
  /(^|\.)natalie\.mu$/, /(^|\.)prtimes\.jp$/, /(^|\.)animeanime\.jp$/, /(^|\.)moca-news\.net$/,
  /(^|\.)akiba-souken\.com$/, /(^|\.)itmedia\.co\.jp$/, /(^|\.)famitsu\.com$/, /(^|\.)4gamer\.net$/,
  /(^|\.)dengekionline\.com$/, /(^|\.)impress\.co\.jp$/, /(^|\.)news\.yahoo\.co\.jp$/,
  /(^|\.)(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|facebook\.com|threads\.net)$/,
  /(^|\.)(lit\.link|linktr\.ee|lnky\.jp|potofu\.me)$/,
];
function isNoiseLink(url: string): boolean {
  try {
    const h = new URL(url).host.toLowerCase();
    return NOISE_LINK_HOSTS.some((re) => re.test(h));
  } catch { return false; }
}

// ポスト本文に残った短縮URL（t.co・x.gd など）を実URLへ展開する。
// 短縮のままではリンク先がまとめ記事かショップか判別できず isNoiseLink が効かないため、
// 展開してから判定する。展開できない/ノイズなら本文から取り除き、AIが購入リンクとして拾えないようにする。
// 正規の外部リンクは【ポスト内の外部リンク】として別に渡しているので、消しても情報は落ちない。
async function expandShortLinks(text: string): Promise<string> {
  const shorts = [...new Set(text.match(/https?:\/\/[^\s<>"']+/g) ?? [])].filter(isShortUrl);
  if (!shorts.length) return text;
  const pairs = await Promise.all(shorts.map(async (s) => [s, await resolveUrl(s)] as const));
  let out = text;
  for (const [short, final] of pairs) {
    const usable = final && !isShortUrl(final) && !isNoiseLink(final);
    out = out.split(short).join(usable ? final : '');
  }
  return out.replace(/[ \t]+/g, ' ').trim();
}

/** AIが link として返したURLを実URLへ展開する（保存されるのはこの値なので最後の砦）。
 *  link は文字列 or 複数件のJSON配列文字列。展開後にノイズ判定をやり直し、全滅したら null。 */
async function expandEventLinks(events: unknown[]): Promise<void> {
  await Promise.all(events.map(async (e) => {
    const ev = e as Record<string, unknown>;
    const raw = ev.link;
    if (typeof raw !== 'string' || !raw) return;
    let links: string[];
    try { const p = JSON.parse(raw); links = Array.isArray(p) ? p.filter((u): u is string => typeof u === 'string') : [raw]; }
    catch { links = [raw]; }
    if (!links.some(isShortUrl)) return;
    // 解決に失敗したときは resolveUrl が元のURLを返す。購入リンクが1本しかない投稿で
    // 一時的なタイムアウトによりリンクを丸ごと失うほうが損なので、短縮のままでも残す。
    const expanded = (await Promise.all(links.map(async (u) => (isShortUrl(u) ? await resolveUrl(u) : u))))
      .filter((u) => !!u && !isNoiseLink(u));
    ev.link = expanded.length === 0 ? null : expanded.length === 1 ? expanded[0] : JSON.stringify(expanded);
  }));
}

const CURRENT_YEAR = new Date().getFullYear();

const BASE_RULES = `
【現在の年】今年は${CURRENT_YEAR}年です。年が明示されていない場合は${CURRENT_YEAR}年として扱う。過去の年（例: 2023年、2024年）は絶対に使わない。
【終了日・終了時刻の抽出ルール】
- 「〜」「-」「まで」などで期間が示されている場合は、date（開始日）と endDate（終了日）の両方を必ず設定する（開始日を空＝nullにしない）
- 例: 「7/15〜7/20」→ date: "${CURRENT_YEAR}-07-15", endDate: "${CURRENT_YEAR}-07-20"
- 例: 「14:00〜17:00」→ time: "14:00", endTime: "17:00"
- 例: 「〜8月31日」→ endDate: "${CURRENT_YEAR}-08-31"
- 開始日のみ明記で終了日が不明な場合はendDate: null
- 【前後関係・絶対厳守】endDate は date より前の日付にしてはいけない（終了日は必ず開始日以降）。年が省略された終了日は date と同じ年として扱い、終了月が開始月より小さいときだけ翌年にする。開始日と違う年の終了日を勝手に作らない。同様に preorderEnd は preorderStart 以降にする
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
【受注・予約・受付期間のルール（検出を強化すること）】
- 次のいずれかの表現があれば必ず isOrderMade: true にする（「受注」に限らない）:
  受注 / 受注生産 / 受注販売 / 原作受注 / 受付期間 / 受付開始 / 予約受付 / 予約期間 / 予約販売 / 事前予約 / 事前受注 / 抽選販売 / 抽選受付 / 抽選予約 / 事後通販 / お申し込み期間 / 申込期間
- isOrderMade=true の場合: preorderStart = 受付（予約・抽選・申込）開始日, preorderEnd = 受付（予約・抽選・申込）終了日
- date には「お渡し予定」「発送予定」「発売予定」など実際の商品受け取り日（受付期間とは別）を入れる。お渡し日が不明なら date は null でよい（受付期間だけでも可）
- 受付開始日・終了日が不明な場合は preorderStart/preorderEnd を null にする
- 【絶対厳守・推測禁止】preorderStart / preorderEnd は「受付期間・予約期間・申込期間」として日付が文中に明記されている時だけ設定する。発売日・お渡し日・発送日・イベント開催日・その他の日付を予約期間に流用・推測してはいけない。受付期間の記載が無ければ必ず両方 null（勝手に日付を作らない）
- 「ご予約受付中」「予約はこちら」など申込制を示す表現があれば、具体的な期間が無くても isOrderMade: true（期間不明なら preorderStart/End は null）
- isOrderMade=false の通常イベントでは preorderStart/preorderEnd は null
【抽出例（必ず参考にする）】
(1) 期間イベント — 入力:「『POP UP STORE』長野で開催決定！ 会場: ながの東急百貨店 開催期間: ${CURRENT_YEAR}年7月10日(金)〜${CURRENT_YEAR}年7月20日(月)」
→ 出力(抜粋): [{"title":"POP UP STORE 長野","date":"${CURRENT_YEAR}-07-10","endDate":"${CURRENT_YEAR}-07-20","prefecture":"長野","categories":["イベント"]}]
※ 開催期間があるので date(開始日) と endDate(終了日) を必ず両方入れる。date を null にしない。
(2) 受注/予約 — 入力:「受注販売！ 受付期間: ${CURRENT_YEAR}年6月17日〜6月22日 / ${CURRENT_YEAR}年10月発売予定」
→ 出力(抜粋): [{"title":"...","isOrderMade":true,"preorderStart":"${CURRENT_YEAR}-06-17","preorderEnd":"${CURRENT_YEAR}-06-22","date":"${CURRENT_YEAR}-10-31","dateLabel":"中","endDate":null}]
※ 受付期間は preorderStart/preorderEnd。発売(お渡し)日は date。endDate は date より前にしない（不明なら null）。`;

const SCHEMA = (memoDesc: string) => `[
  {
    "title": "イベントのタイトル（必須、簡潔に）",
    "work": "作品名・シリーズ名（例: ちいかわ, ハイキュー!!, ブルーロック, 呪術廻戦）。略称は正式名称に直す。不明ならnull",
    "price": "税込価格を数値のみで（円。例: 1320）。複数価格や不明はnull",
    "date": "実際のイベント日・発売日・お渡し日をYYYY-MM-DD形式で or null（予約受付期間とは別）",
    "dateLabel": "'上旬'|'中旬'|'下旬'|'中'|'春頃'|'夏頃'|'秋頃'|'冬頃'（曖昧な日付の場合）or null",
    "time": "開始時刻をHH:mm形式で or null",
    "endDate": "通常イベントの終了日をYYYY-MM-DD形式で（期間表記があれば設定）or null",
    "endTime": "終了時刻をHH:mm形式で（時間範囲があれば設定）or null",
    "categories": ["該当するカテゴリを配列で（複数可）。候補: 書籍|グッズ|イベント|誕生日|アニメ・映画|グルメ|キャンペーン（書籍＝単行本・小説・画集等、キャンペーン＝購入特典・フェア・コラボ等）。グッズの場合は種別も追加可: くじ|ガチャ|プライズ|食玩|ぬい|アクスタ|缶バッジ|キーホルダー|フィギュア|ステッカー|アパレル|コスメ|ガジェット|雑貨（コスメ＝化粧品・香水・ネイル等、ガジェット＝イヤホン・充電器・スマホ関連等、雑貨＝クリアファイル・タオル・文具など他に当てはまらないグッズ）。種別を入れる時は必ず\"グッズ\"も一緒に入れる。該当なしは空配列[]"],
    "prefecture": "都道府県名（「都」「府」「県」を除いた形。例: 東京・大阪・神奈川・北海道）or null",
    "locationDetail": "詳細な会場名・住所 or null",
    "link": ["公式URLや関連リンクをすべて配列で。1件でも配列にする。リンクがなければnull"],
    "isOrderMade": "「受注」という言葉が含まれる場合はtrue（受注生産・受注販売・受注商品・原作受注など）、それ以外はfalse",
    "preorderStart": "isOrderMade=trueの場合のみ: 予約・受付開始日をYYYY-MM-DD形式で or null",
    "preorderEnd": "isOrderMade=trueの場合のみ: 予約・受付終了日をYYYY-MM-DD形式で or null",
    "sellsGoods": "イベント・展示・コラボ・カフェ・POP UP等で、会場や関連でグッズ・物販が販売されることが読み取れる場合はtrue（『物販』『グッズ販売』『限定グッズ』『会場限定』『グッズ受注』等）。商品そのものの投稿（categoriesがグッズ）や物販の言及が無い場合はfalse",
    "memo": "${memoDesc}"
  }
]`;

const EXTRACT_PROMPT = `以下の情報から、含まれるイベント・予定をすべて抽出してください。
1件のみの場合も必ず配列で返してください。
日本語で回答し、情報がない・不明な場合はnullを設定してください。
必ずJSON配列のみを返してください（余計な説明不要）。
${BASE_RULES}

${SCHEMA('補足情報・注意事項 or null。店舗の宣伝文句・お得情報（「早い者勝ち」「〇%オフ」「ポイント〇倍」「送料無料」等）は書かない')}`;

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
- 店舗・ECサイトの宣伝文句やお得情報は書かない（「早い者勝ち」「今だけ」「お急ぎください」「〇%オフでお得」「ポイント〇倍」「送料無料」「セール中」等の煽り・販促文言）。商品・イベントそのものの事実情報だけを書く
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
    noteAiUsage('claude-haiku-4-5', res.usage);
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
      .filter((u): u is string => !!u && !/twitter\.com|x\.com|t\.co/.test(u) && !isNoiseLink(u));
    let text = `投稿者: ${fx.tweet.author?.name ?? ''}`;
    if (tweetDate) text += `\nツイート投稿日: ${tweetDate}`;
    text += `\n内容: ${await expandShortLinks(fx.tweet.text)}`;
    if (extLinks.length > 0) text += `\n【ポスト内の外部リンク】${extLinks.join(' / ')}`;
    return { text, imageUrl };
  }

  if (syn) {
    const tweetText = (syn.text ?? syn.full_text ?? '') as string;
    const authorName = (syn as { user?: { name?: string } }).user?.name ?? '';
    const urlEntities = ((syn as { entities?: { urls?: Array<{ expanded_url?: string; display_url?: string }> } }).entities?.urls ?? []);
    const extLinks = urlEntities
      .map(u => u.expanded_url)
      .filter((u): u is string => !!u && !/twitter\.com|x\.com|t\.co/.test(u) && !isNoiseLink(u));
    let text = `投稿者: ${authorName}`;
    if (tweetDate) text += `\nツイート投稿日: ${tweetDate}`;
    text += `\n内容: ${await expandShortLinks(tweetText)}`;
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
      if (!resolvedFinal || isNoiseLink(resolvedFinal)) continue;
      if (externalLinks.some(l => l.includes(resolvedFinal.split('?')[0]))) continue;
      externalLinks.push(visibleClean && visibleClean !== resolvedFinal ? `${visibleClean}（${resolvedFinal}）` : resolvedFinal);
    }
    const textContent = await expandShortLinks(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    let text = `投稿者: ${oe.author_name ?? ''}\n内容: ${textContent}`;
    if (externalLinks.length > 0) text += `\n【ポスト内の外部リンク】${externalLinks.join(' / ')}`;
    return { text, imageUrl };
  }

  return { text: `URL: ${tweetUrl}`, imageUrl };
}

// ⚠ 2026-08-10 から**呼ばれていない**。Xのポスト以外のURLを解析しない方針にしたため
// （isXPostUrl 参照）。任意ホストへの接続口でもあったので復活させるときは、
// https限定・内部アドレス拒否・リダイレクト先の再検証を足してからにすること。
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
  // 終了日が開始日より前（＝AIが誤った年を入れた）場合に年だけ補正して end >= start を保証する
  const fixEndAfterStart = (start: unknown, end: unknown): unknown => {
    if (typeof start !== 'string' || typeof end !== 'string') return end;
    const ms = start.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const me = end.match(/^(\d{4})-\d{2}-\d{2}$/);
    if (!ms || !me || end >= start) return end;
    const startYear = parseInt(ms[1], 10);
    const tail = end.slice(4); // "-MM-DD"
    // まず開始日と同じ年に合わせ、それでも前なら翌年（期間が年をまたぐケース）
    const sameYear = `${startYear}${tail}`;
    return sameYear >= start ? sameYear : `${startYear + 1}${tail}`;
  };

  return arr.map(item => {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      // link が配列で返ってきた場合: 1件→文字列、複数→JSON文字列、空→null
      // まとめ記事・ニュース・SNSのURLは購入リンクではないのでここで落とす
      const rawLink = obj.link;
      const links = (Array.isArray(rawLink) ? rawLink : [rawLink])
        .filter((u): u is string => typeof u === 'string' && !!u && !isNoiseLink(u));
      const normalizedLink = links.length === 0 ? null : links.length === 1 ? links[0] : JSON.stringify(links);
      const rawDateLabel = obj.dateLabel as string | null | undefined;
      const validLabels = ['上旬', '中旬', '下旬', '中', '春頃', '夏頃', '秋頃', '冬頃'];
      const dateLabel = rawDateLabel && validLabels.includes(rawDateLabel) ? rawDateLabel : null;
      const rawIsOrderMade = obj.isOrderMade;
      const isOrderMade = rawIsOrderMade === true || rawIsOrderMade === 'true';
      const date = fixYear(obj.date);
      const preorderStart = fixYear(obj.preorderStart);
      return {
        ...obj,
        link: normalizedLink,
        date,
        dateLabel,
        // 終了日が開始日より前にならないよう年を補正
        endDate: fixEndAfterStart(date, fixYear(obj.endDate)),
        memo: cleanMemo(obj.memo),
        isOrderMade,
        preorderStart,
        preorderEnd: fixEndAfterStart(preorderStart, fixYear(obj.preorderEnd)),
      };
    }
    return item;
  });
}

// 全イベントが日付情報を一切持たない（＝抽出に失敗した可能性が高い）か
function allDatesEmpty(events: unknown[]): boolean {
  if (events.length === 0) return true;
  return events.every(e => {
    const o = e as Record<string, unknown>;
    return !o.date && !o.endDate && !o.dateLabel && !o.preorderStart && !o.preorderEnd;
  });
}

// claudeComplete + parseRawText。日付が全く取れなければ1回だけ再試行（Haikuのばらつき対策）
async function extractWithRetry(systemPrompt: string, content: string, maxTokens: number): Promise<unknown[]> {
  const first = parseRawText(await claudeComplete(systemPrompt, content, maxTokens));
  if (!allDatesEmpty(first)) return first;
  try {
    const second = parseRawText(await claudeComplete(systemPrompt, content, maxTokens));
    return allDatesEmpty(second) ? first : second;
  } catch {
    return first; // 再試行のパース失敗時は初回結果を使う
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  // Authorization を許可しないと、iOS（オリジンが capacitor://localhost）のプリフライトで落ちる
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  // 上限は user_id で数える。トークンが無ければ従来通りIPで数える（移行期の二段構え）。
  // ⚠️ 「JWT無しの呼び出しがゼロ」をログで確認してから必須に切り替えること。
  //    いきなり必須にすると、トークンを送れていない経路の解析が丸ごと死ぬ。
  const identity = await getIdentity(req);
  if (!identity) {
    console.warn(`[parse-event][no-jwt] ip=${getClientIp(req)} ua=${String(req.headers['user-agent'] ?? '').slice(0, 60)}`);
  }
  const rl = await checkRateLimitFor('parse', identity, getClientIp(req));
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

  // このリクエストで走ったClaude呼び出しを集めて、最後に台帳へ1行書く。
  // 画像・再試行を含めて**実際にかかった額**が残る（回数では見えない）。
  const calls: AiCall[] = [];
  try {
    return await withAiUsage(calls, async () => {
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
        noteAiUsage('claude-haiku-4-5', res2.usage);
        const block = res2.content[0];
        const rawText = block.type === 'text' ? block.text : '';
        try {
          const parsed = parseRawText(rawText);
          await expandEventLinks(parsed);
          return res.status(200).json(parsed);
        } catch {
          return res.status(422).json({ error: 'Could not parse response' });
        }
      }

      // ── URL前処理 ──────────────────────────────────────────────
      const rawInput = url!.trim();
      // 1. mixed content（"ツイート本文 https://t.co/xxx"）からURLだけ取り出す。
      //    URLが1つも無ければ空になる＝テキスト入力として扱う（下の分岐へ）
      let processUrl = rawInput.match(/https?:\/\/\S+/)?.[0] ?? '';
      // 2. 短縮URLをリダイレクト先へ解決（X アプリが t.co を送る／本文の x.gd を直接共有する場合）
      if (processUrl && isShortUrl(processUrl)) {
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

      if (isXPostUrl(processUrl)) {
        const { text: pageText, imageUrl: tweetImageUrl } = await fetchTweetContent(processUrl);
        // sharedText（X アプリが Web Share で送ってきたツイート本文）があれば先頭に追加
        const tweetContext = sharedText
          ? `ポスト本文（X アプリより直接）: ${await expandShortLinks(sharedText)}\n\n${pageText}`
          : pageText;
        let parsed: unknown[];
        try {
          parsed = await extractWithRetry(EXTRACT_PROMPT_TWEET, tweetContext, 800);
        } catch {
          return res.status(422).json({ error: 'Could not parse response' });
        }
        // 受注・予約・受付期間を示す表現があれば全イベントをisOrderMade=trueに強制設定
        if (/受注|受付期間|受付開始|予約受付|予約期間|予約販売|事前予約|事前受注|抽選販売|抽選受付|抽選予約|事後通販|申込期間|お申し込み期間/.test(tweetContext)) {
          parsed.forEach(e => { (e as Record<string, unknown>).isOrderMade = true; });
        }
        // 会場物販を示す強い表現があれば sellsGoods=true に補完（イベント側のみ。クライアントで種別判定）
        if (/物販|グッズ販売|販売グッズ|限定グッズ|会場限定グッズ|グッズ受注/.test(tweetContext)) {
          parsed.forEach(e => { if ((e as Record<string, unknown>).sellsGoods == null) (e as Record<string, unknown>).sellsGoods = true; });
        }
        if (tweetImageUrl) {
          parsed.forEach(e => { (e as Record<string, unknown>).imageUrl = tweetImageUrl; });
          // 受注・予約で「受付終了日(preorderEnd)」がテキストから取れないときだけ画像の締切日を補完。
          // 画像から取るのは受付締切＝preorderEnd であり、endDate（イベント終了日）ではない点に注意。
          const needsFallback = parsed.some(e => {
            const ev = e as Record<string, unknown>;
            return ev.isOrderMade === true && !ev.preorderEnd;
          });
          if (needsFallback) {
            const deadline = await fetchReservationEndFromImage(tweetImageUrl);
            if (deadline) {
              parsed.forEach(e => {
                const ev = e as Record<string, unknown>;
                if (ev.isOrderMade === true && !ev.preorderEnd) {
                  // 締切は受付開始日以降のときだけ採用（誤検出した過去日は捨てる）
                  const ps = ev.preorderStart as string | null;
                  if (!ps || deadline >= ps) ev.preorderEnd = deadline;
                }
              });
            }
          }
        }
        await expandEventLinks(parsed);
        return res.status(200).json(parsed);
      }

      // ここから先はXのポスト以外。**URLは取りに行かない**。
      // ただし本文が一緒に入っているなら、URLを除いた文章をそのまま読む
      // （「告知の本文＋販売先のURL」を丸ごと貼る使い方を殺さないため）。
      const textOnly = rawInput.replace(/https?:\/\/\S+/g, '').trim();
      if (!textOnly) {
        // 中身がURLだけ＝読むものが無い。クライアントで案内に差し替える
        return res.status(400).json({ error: 'unsupported_url' });
      }
      const textContext = sharedText
        ? `${await expandShortLinks(sharedText)}\n\n${textOnly}`
        : textOnly;
      try {
        const parsed = await extractWithRetry(EXTRACT_PROMPT, textContext, 768);
        await expandEventLinks(parsed);
        return res.status(200).json(parsed);
      } catch {
        return res.status(422).json({ error: 'Could not parse response' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(err);
      return res.status(500).json({ error: 'Internal server error', detail: msg });
    }
    });
  } finally {
    await saveAiUsage({
      endpoint: 'parse-event',
      userId: identity ? identity.userId : null,
      tier: identity ? identity.tier : null,
      calls,
    });
  }
}
