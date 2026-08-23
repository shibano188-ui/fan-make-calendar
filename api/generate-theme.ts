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
//   参考画像も同じ。**保存しない・ログに残さない・出力に残さない**。
//   AIに渡して捨てるだけ（著作権法30条の4が想定する「解析のための利用」に収める）。
//   端末側で長辺768pxに縮めてから送る（原本をそのまま渡さない）。
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
- CSSやコードは書かない。**道具 set_theme の引数を埋めるだけ**
- 変える項目だけ渡す（差分）。触らない項目はキーごと省く
- name は雰囲気を表す短い日本語（8文字以内）。**作品名・キャラクター名・ブランド名は使わない**
- 色は必ず #rrggbb の6桁。明（light）と暗（dark）の2組を必ずそろえる
- 押す場所と情報の順番は変えられない。変えられるのは色・形・書体・質感だけ

## 項目の意味（set_theme の引数として渡す。変える項目だけ入れる）
- shape 面の形。round=丸／square=直角／cut=右下を切る。**「別のアプリに見える」を一番作る**
- radius 角丸(px)。アプリ中の角丸がこの1つに揃う。square なら0〜3、round なら10〜20が普通
- bars 上部バーと下タブ。floating=浮いた丸バー／plate=塗りの板／band=アクセント色の帯。**形の次に効く**
- shadow float=浮く／raise=隆起した押しボタン／hard=硬いオフセット影／none=無し
- texture 地の質感。none／dots=点の格子／halftone=細かい網点
- press 押した反応。spring=ばね／mechanical=沈む／bounce=弾く／none
- ornament 飾り。**1テーマに1つだけ**。none／led=状態が表示灯のように灯る／tilt=札やチップが少し傾く
- type 書体の性格。plain=素／mono=字間を開けた等幅の計器風／display=極太の見出し風

## 参考画像が付いているとき
- 画像は**見た目の手がかり**として読む。色の並び・明暗・粗さ・角の丸さ・書体の太さの印象を拾う
- **描かれているもの（キャラクター・ロゴ・作品）には触れない。** name にも note にも出さない
- 画像が複数あるときは、共通して流れている雰囲気を1つにまとめる
- 言葉も一緒に来ていたら**言葉を優先**する（画像は補足）

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
- 新しく作るときは全部の項目を埋める。手直しのときは**変える項目だけ**入れる

## 組み合わせの作法
- type=mono なら fonts.meta / fonts.num は等幅系（martian, jetbrains）が合う
- type=display なら fonts.display に極太（dela, archivo, kaisei）、fonts.num に bigshoulder が合う
- bars=band を選ぶと上部が accent 一色になる。accent は明るく強い色にする
- かわいい・やわらかい → round / floating / zenmaru か mplusround / radius 14〜20
- 硬い・機械的 → square / plate / raise / dots / mono / radius 0〜3
- 派手・勢い → cut / band / hard / display / tilt / radius 0

必ず set_theme を1回だけ呼ぶ。それ以外の文章は書かない。`;

// 表の形そのもの。**モデル側で値を縛れる**ので、テキストのJSONを拾うより崩れない
const COLORS_SCHEMA = {
  type: 'object' as const,
  properties: {
    bg: { type: 'string', description: '地の色 #rrggbb' },
    surface: { type: 'string', description: 'カードやバーの面 #rrggbb' },
    surface2: { type: 'string', description: '一段沈んだ面 #rrggbb' },
    text: { type: 'string', description: '文字 #rrggbb' },
    line: { type: 'string', description: '罫線と薄い塗りのもと #rrggbb' },
  },
};

const FONT_IDS = [
  'system', 'bizudp', 'bizud', 'zenkaku', 'zenmaru', 'mplusround', 'shippori', 'notoserifjp',
  'dela', 'kaisei', 'rocknroll', 'yusei', 'dotgothic', 'martian', 'jetbrains', 'anybody',
  'bigshoulder', 'spacegro', 'archivo',
];
const BODY_FONT_IDS = ['system', 'bizudp', 'bizud', 'zenkaku', 'zenmaru', 'mplusround', 'shippori', 'notoserifjp'];

const THEME_TOOL = {
  name: 'set_theme',
  description: 'アプリの見た目を決める設定表を埋める。変える項目だけ渡す。',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: '雰囲気を表す短い日本語（8文字以内）。作品名・キャラ名は使わない' },
      accent: { type: 'string', description: 'アクセント色 #rrggbb' },
      shape: { type: 'string', enum: ['round', 'square', 'cut'] },
      radius: { type: 'integer', minimum: 0, maximum: 24 },
      bars: { type: 'string', enum: ['floating', 'plate', 'band'] },
      shadow: { type: 'string', enum: ['float', 'raise', 'hard', 'none'] },
      texture: { type: 'string', enum: ['none', 'dots', 'halftone'] },
      press: { type: 'string', enum: ['spring', 'mechanical', 'bounce', 'none'] },
      ornament: { type: 'string', enum: ['none', 'led', 'tilt'] },
      type: { type: 'string', enum: ['plain', 'mono', 'display'] },
      fonts: {
        type: 'object',
        properties: {
          body: { type: 'string', enum: BODY_FONT_IDS },
          label: { type: 'string', enum: BODY_FONT_IDS },
          meta: { type: 'string', enum: FONT_IDS },
          num: { type: 'string', enum: FONT_IDS },
          display: { type: 'string', enum: FONT_IDS },
        },
      },
      dark: COLORS_SCHEMA,
      light: COLORS_SCHEMA,
      note: { type: 'string', description: '何をどう変えたかを1文で（日本語・30文字以内）' },
    },
  },
};

type Body = { prompt?: string; current?: unknown; images?: unknown };

// 参考画像。多いほど費用が増えるので枚数と大きさを切る
// （端末側で長辺768px・JPEG品質80に縮めてから送っている ＝ 1枚あたり約100KB）
const MAX_IMAGES = 3;
const MAX_IMAGE_BASE64 = 600_000;   // 約450KB。縮小をすり抜けた原寸を弾く

function pickImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_IMAGE_BASE64)
    .slice(0, MAX_IMAGES);
}

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

  const { prompt, current, images } = (req.body ?? {}) as Body;
  // 入力欄は複数行で長く書ける。表を埋めるのに必要な長さとして 600 文字まで受ける
  const wish = typeof prompt === 'string' ? prompt.trim().slice(0, 600) : '';
  const refs = pickImages(images);
  if (!wish && refs.length === 0) return res.status(400).json({ error: 'prompt or images required' });

  const calls: AiCall[] = [];
  try {
    return await withAiUsage(calls, async () => {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1500,
        // 静的なところ（道具の形とルール）までをキャッシュする。
        // 動く部分（今の表・頼まれごと）は user 側に置く
        tools: [THEME_TOOL],
        tool_choice: { type: 'tool', name: 'set_theme' },
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: [
            ...refs.map(data => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data },
            })),
            {
              type: 'text' as const,
              text: `## 今の表\n${currentTable(current)}\n\n## 頼まれたこと\n`
                + (wish || '（言葉の指定なし。参考画像の雰囲気だけで作る）')
                + (refs.length ? `\n\n参考画像を${refs.length}枚付けています。` : ''),
            },
          ],
        }],
      });
      noteAiUsage(MODEL, message.usage);

      const use = message.content.find(b => b.type === 'tool_use');
      if (!use || use.type !== 'tool_use' || !use.input || typeof use.input !== 'object') {
        console.warn(`[generate-theme] no tool_use stop=${message.stop_reason}`);
        return res.status(422).json({ error: 'could_not_parse' });
      }
      const patch = { ...(use.input as Record<string, unknown>) };
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
