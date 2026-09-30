import Anthropic from '@anthropic-ai/sdk';
import { noteAiUsage } from './_aiusage.js';
import { isXPostUrl, fetchTweetContent } from './parse-event.js';
import { botMayFetch } from './_pace.js';

// 人が直した・足した情報を、リンクの中身と照らし合わせる（2026-09-29 投稿の方法の作り直し）。
// 使うところ:
//   parse-event の verify … Xから追加で、AIが読んだ日付・タイトルを書き換えて投稿するとき
//   _submissions.ts       … ＋αの提案（日付・発売状況・値段・購入リンク）と「情報を送る」
// Google マップの「情報の修正を提案」と同じ考え方で、Web上の情報で裏付けが取れたものだけ通す。
//
// ⚠ 読みに行く先は **Xのポストと、決まった店だけ**。人が貼った任意のURLへサーバーから接続すると、
// 内部のアドレスや関係ないサイトを叩かされる（SSRF）。それ以外のURLは読まずに「確かめられない」にする。

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** 中身を読みに行ってよい店。ボットの巡回先と、購入リンクでよく使う店 */
const READABLE_HOSTS = [
  /(^|\.)animate-onlineshop\.jp$/, /(^|\.)movic\.jp$/, /^store\.kadokawa\.co\.jp$/, /(^|\.)jumpshop-benelic\.com$/,
  /(^|\.)kotobukiya\.co\.jp$/, /(^|\.)chiikawamarket\.jp$/, /^item\.rakuten\.co\.jp$/, /^store\.shopping\.yahoo\.co\.jp$/,
  /^p-bandai\.jp$/, /(^|\.)goodsmile\.info$/,
];

export function isReadableStore(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && READABLE_HOSTS.some((re) => re.test(u.host.toLowerCase()));
  } catch { return false; }
}

/** 裏付けに使える文章。読めない・読んではいけないURLは null */
export async function readEvidence(url: string): Promise<string | null> {
  if (isXPostUrl(url)) {
    const { text } = await fetchTweetContent(url).catch(() => ({ text: '' }));
    return text && !text.startsWith('URL: ') ? `【Xのポスト ${url}】\n${text}` : null;
  }
  if (!isReadableStore(url)) return null;
  // 店への機械的なアクセスの間隔を守る（アニメイトは約20分に1回。ボットの中だけ効く。_pace.ts）
  if (!botMayFetch(new URL(url).host.toLowerCase())) return null;
  try {
    // 転送先は追わない（決まった店の外へ連れ出されないように）
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FanHive/1.0)' }, redirect: 'manual', signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const text = (await r.text())
      .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000);
    return text ? `【${new URL(url).host} のページ ${url}】\n${text}` : null;
  } catch { return null; }
}

export type Verdict = 'supported' | 'contradicted' | 'unknown';

const JUDGE_PROMPT = `あなたはアニメ・キャラクターグッズの予定情報の事実確認係です。
「確かめたいこと」が「資料」の内容で裏付けられるかを判定してください。
- supported: 資料にはっきり書かれている（日付は年が省略されていても月日が合えばよい）
- contradicted: 資料に別の値がはっきり書かれている
- unknown: 資料からは分からない
購入リンクの追加を確かめるときは、そのページが予定と同じ商品（または同じシリーズ）の販売ページかを見ること。
reason は投稿した人にそのまま見せる。30字以内で、「資料」とは書かずに何が違うか・分からないかだけを書く（例: "ポストでは発売日が11月20日"、"値段が書かれていない"）。
出力はJSONだけ: {"verdict":"supported|contradicted|unknown","reason":"30字以内の日本語"}`;

/** 画面に出す理由。長いときは文の切れ目で切り、途中で切ったら「…」を付ける（60字でぶつ切りにすると文が途中で終わっていた） */
function shortReason(r: string): string {
  const t = r.trim().replace(/[。．]+$/, '');
  if (t.length <= 40) return t;
  const cut = t.slice(0, 40);
  const at = Math.max(cut.lastIndexOf('、'), cut.lastIndexOf('。'));
  return (at >= 20 ? cut.slice(0, at) : cut) + '…';
}

/** 確かめたいこと（1行ずつ）を、資料と照らし合わせる */
export async function judgeClaim(opts: { eventTitle: string; claims: string[]; evidence: string[] }): Promise<{ verdict: Verdict; reason: string }> {
  if (!opts.evidence.length) return { verdict: 'unknown', reason: '確かめられるリンクがありません' };
  const content = `予定: ${opts.eventTitle}\n\n確かめたいこと:\n${opts.claims.map((c) => `- ${c}`).join('\n')}\n\n資料:\n${opts.evidence.join('\n\n').slice(0, 12000)}`;
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system: [{ type: 'text', text: JUDGE_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    });
    noteAiUsage('claude-haiku-4-5', res.usage);
    const block = res.content[0];
    const raw = block.type === 'text' ? block.text : '';
    const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as { verdict?: string; reason?: string };
    const verdict: Verdict = json.verdict === 'supported' || json.verdict === 'contradicted' ? json.verdict : 'unknown';
    return { verdict, reason: shortReason(String(json.reason ?? '')) };
  } catch {
    return { verdict: 'unknown', reason: '確かめられませんでした' };
  }
}
