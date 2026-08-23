import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { checkRateLimitFor, getClientIp } from './_ratelimit.js';
import { getIdentity } from './_identity.js';
import { withAiUsage, noteAiUsage, saveAiUsage, type AiCall } from './_aiusage.js';

// ═══════════════════════════════════════════════════════════════════
// テーマ生成。**AIにCSSを書かせない。決まった表を埋めさせるだけ**。
//
// 設計の芯（→ [[2026-08-22-fanhive-theme-consolidation]]）:
//   1. 返させるのは**差分だけ**。全部返させると、関係ない項目が毎回揺れる
//   2. 会話履歴は送らない。**今の表が履歴の役目**を果たす
//   3. 検査・合成・明暗差の検算は**クライアント側**（src/design/themeCheck.ts）でやる。
//      ここは「身元・栓・台帳・Claude呼び出し」だけを持つ薄い口にする
//
// 版権の線引き（重要）:
//   作品名は**入力としてだけ**受け取る。出力の名前にしない。**ログにも残さない**。
//   返すのは数字と選択肢だけ。版権は使う人の側に置いたままにする。
// ═══════════════════════════════════════════════════════════════════

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 上位モデル。Haiku と違って**最小キャッシュ長が短いので最初からキャッシュが効く**
// （Sonnet 5 = 1,024トークン。下のシステムプロンプトはそれを超える）
// → [[anthropic-prompt-cache-min-tokens]]
const MODEL = 'claude-sonnet-5';

/**
 * 表の語彙。**src/design/themeSpec.ts と skins.css の実体に対応する**。
 * ここに無い値をAIが返しても、クライアント側の検査（themeCheck.ts の VOCAB）で
 * 捨てられて今の値が残るだけなので、ずれても壊れない。
 * 逆に skins.css に部品を足したときは、ここにも足さないとAIは使えない。
 */
const SYSTEM_PROMPT = `あなたはモバイルアプリの外観を決める設計者です。
利用者の言葉から、アプリ全体の見た目を決める「設定表」を埋めます。

## 絶対の制約
- CSSやコードは書かない。**下の表の項目を埋めた JSON だけ**を返す
- 変える項目だけを返す（差分）。触らない項目はキーごと省く
- name は雰囲気を表す短い日本語（8文字以内）。**作品名・キャラクター名・ブランド名は使わない**
- 色は必ず #rrggbb の6桁。明（light）と暗（dark）の2組を必ずそろえる
- 押す場所と情報の順番は変えられない。変えられるのは色・形・書体・質感だけ

## 返す JSON の形（変える項目だけ）
{
  "name": "夜の海",
  "accent": "#4fc3f7",
  "shape": "round" | "square" | "cut",
  "radius": 0〜24 の整数,
  "bars": "floating" | "plate" | "band",
  "shadow": "float" | "raise" | "hard" | "none",
  "texture": "none" | "dots" | "halftone",
  "press": "spring" | "mechanical" | "bounce" | "none",
  "ornament": "none" | "led" | "tilt",
  "type": "plain" | "mono" | "display",
  "fonts": { "body": …, "label": …, "meta": …, "num": …, "display": … },
  "dark":  { "bg": "#…", "surface": "#…", "surface2": "#…", "text": "#…", "line": "#…" },
  "light": { "bg": "#…", "surface": "#…", "surface2": "#…", "text": "#…", "line": "#…" },
  "note": "何をどう変えたかを1文で（日本語・30文字以内）"
}

## 項目の意味
- shape 面の形。round=丸／square=直角／cut=右下を切る。**「別のアプリに見える」を一番作る**
- radius 角丸(px)。アプリ中の角丸がこの1つに揃う。square なら0〜3、round なら10〜20が普通
- bars 上部バーと下タブ。floating=浮いた丸バー／plate=塗りの板／band=アクセント色の帯。**形の次に効く**
- shadow float=浮く／raise=隆起した押しボタン／hard=硬いオフセット影／none=無し
- texture 地の質感。none／dots=点の格子／halftone=細かい網点
- press 押した反応。spring=ばね／mechanical=沈む／bounce=弾く／none
- ornament 飾り。**1テーマに1つだけ**。none／led=状態が表示灯のように灯る／tilt=札やチップが少し傾く
- type 書体の性格。plain=素／mono=字間を開けた等幅の計器風／display=極太の見出し風

## 色の決め方
- bg=地、surface=カードやバーの面、surface2=一段沈んだ面（入力欄）、text=文字、line=罫線と薄い塗りのもと
- dark は暗い地に明るい文字、light は明るい地に暗い文字。**逆にしない**
- text と bg のコントラスト比は 4.5 以上にする（届かないと自動で寄せられて、狙った色でなくなる）
- accent は塗りボタン・選択中の印に使う。地から離れた、はっきり見える色にする
- surface は bg よりわずかに明るく（暗いテーマ）／わずかに暗く（明るいテーマ）する

## 書体（役ごとに選ぶ。id をそのまま書く）
本文・ラベルに使えるもの:
  system=端末標準 / bizudp=BIZ UDPゴシック（読みやすい） / bizud=BIZ UDゴシック（等幅寄り）
  zenkaku=Zen角ゴシック / zenmaru=Zen丸ゴシック（やわらかい） / mplusround=丸ゴシック（かわいい）
  shippori=しっぽり明朝（和・上品） / notoserifjp=明朝（硬派）
見出し・数字・短い英字ラベルだけに使えるもの:
  dela=極太ゴシック / kaisei=レトロ太丸 / rocknroll=ポップ / yusei=手書き風 / dotgothic=ドット
  martian=等幅（機械的） / jetbrains=等幅 / anybody=可変幅サンセリフ / bigshoulder=圧縮された太い数字
  spacegro=幾何学サンセリフ / archivo=極太英字
- fonts.body と fonts.label には**上の「本文に使えるもの」しか入れない**
- fonts.meta と fonts.num は日付・金額に出る。数字が読みやすいものを選ぶ
- 同時に使う書体は4種類まで

## 組み合わせの作法
- type=mono なら fonts.meta / fonts.num は等幅系（martian, jetbrains）が合う
- type=display なら fonts.display に極太（dela, archivo, kaisei）、fonts.num に bigshoulder が合う
- bars=band を選ぶと上部が accent 一色になる。accent は明るく強い色にする
- かわいい・やわらかい → round / floating / zenmaru か mplusround / radius 14〜20
- 硬い・機械的 → square / plate / raise / dots / mono / radius 0〜3
- 派手・勢い → cut / band / hard / display / tilt / radius 0

JSON以外は何も書かない。`;

type Body = { prompt?: string; current?: unknown };

/** 今の表を、AIに読ませる短い文にする。**会話履歴の代わり**がこれ */
function currentTable(current: unknown): string {
  if (!current || typeof current !== 'object') return '（まだ何も無い。新しく作る）';
  // 使う人の端末から来る値なので、長さを必ず切る
  const json = JSON.stringify(current).slice(0, 2000);
  return json;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  // ここは**新しい入口なので、最初からJWT必須にできる**。
  // parse-event と違って「トークンを送らない古いクライアント」が存在しない
  // （この機能を持つ版は必ず Authorization を送る）。
  const identity = await getIdentity(req);
  if (!identity) return res.status(401).json({ error: 'auth_required' });

  const rl = await checkRateLimitFor('theme', identity, getClientIp(req));
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    return res.status(429).json({ error: 'rate_limited', retryAfterSec: rl.retryAfterSec });
  }

  const { prompt, current } = (req.body ?? {}) as Body;
  const wish = typeof prompt === 'string' ? prompt.trim().slice(0, 200) : '';
  if (!wish) return res.status(400).json({ error: 'prompt is required' });

  const calls: AiCall[] = [];
  try {
    return await withAiUsage(calls, async () => {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1200,
        // 静的なところにだけキャッシュを付ける。動く部分（今の表・頼まれごと）は user 側
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: `## 今の表\n${currentTable(current)}\n\n## 頼まれたこと\n${wish}\n\n`
            + `変える項目だけの JSON を返してください。`,
        }],
      });
      noteAiUsage(MODEL, message.usage);

      const block = message.content[0];
      const raw = block && block.type === 'text' ? block.text : '';
      const patch = extractJson(raw);
      if (!patch) return res.status(422).json({ error: 'could_not_parse' });

      const note = typeof patch.note === 'string' ? patch.note.slice(0, 60) : '';
      delete patch.note;
      return res.status(200).json({ patch, note });
    });
  } catch (e) {
    console.error(`[generate-theme] ${e instanceof Error ? e.message : String(e)}`);
    return res.status(500).json({ error: 'generation_failed' });
  } finally {
    // **頼まれた文（作品名が入りうる）は記録しない。** 残すのは金額とトークン数だけ
    await saveAiUsage({ endpoint: 'generate-theme', userId: identity.userId, tier: identity.tier, calls });
  }
}

/** ```json … ``` に包まれていても取り出す */
function extractJson(text: string): Record<string, unknown> | null {
  const body = text.replace(/```json\s*|```/g, '').trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
