// 在庫の報告の簡易チェック。報告はその場で全員に見えるので、喧嘩・悪口・荒らしを入り口で止める。
// ここはアプリ側だけの判定（古いアプリや直接の書き込みは通ってしまう）。
// 本格的な判定（AI・DB側）は「情報を追加」の仕組みを作るときに足す。

const MAX_LEN = 60;

// 人や作品を貶す言葉・脅し・荒らし。在庫の報告に出てくることがまず無いものだけにする。
// 「転売」「売り切れ」など在庫の話で普通に使う言葉は入れない。
// ひらがなは他の言葉の一部になりやすい（「入荷したばかり」「くずもち」）ので、紛れやすいものは入れないか、続く文字で除外する
const NG: RegExp[] = [
  /死ね|氏ね|殺す|ころす|消えろ|きえろ/,
  /きもい|キモ[いイ]|きしょ|キショ|うざい|ウザ[いイ]/,
  /ブス|デブ|でぶ|カス(?![タテト])|クズ|ゴミ(?![箱袋捨出])|ボケ|アホ/,
  /バカ(?!ンス)|馬鹿|ガイジ|がいじ|池沼/,
  /晒し|通報しろ|民度/,
];

export type StockCheck = { ok: true } | { ok: false; reason: string };

export function checkStockNote(raw: string): StockCheck {
  const t = raw.normalize('NFKC').trim();
  if (!t) return { ok: false, reason: '内容を入れてください' };
  if ([...t].length > MAX_LEN) return { ok: false, reason: `${MAX_LEN}文字以内で書いてください` };
  if (/https?:\/\/|www\.|\.(com|jp|net|co)\b/i.test(t)) return { ok: false, reason: 'リンクは「リンク」タブから追加してください' };
  if (/@[\w_]{2,}/.test(t)) return { ok: false, reason: '人あての書き込みはできません' };
  if (/\d{2,4}-?\d{2,4}-?\d{4}/.test(t)) return { ok: false, reason: '電話番号などは書けません' };
  if (/(.)\1{5,}/.test(t)) return { ok: false, reason: '同じ文字の繰り返しは書けません' };
  if (NG.some((re) => re.test(t))) return { ok: false, reason: '在庫の状況だけを書いてください' };
  return { ok: true };
}
