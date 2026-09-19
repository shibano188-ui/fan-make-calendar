// カレンダーの帯に出すタイトルから、先頭の作品名を省く。
// 帯は作品の色で見分けられるので、先頭の「呪術廻戦」「アニメ『呪術廻戦』」は文字数を食うだけになる。
// 先頭で作品名がまるごと一致したときだけ削る（途中の作品名や、別の語の一部は触らない）。

const PREFIX = /^(?:TVアニメ|テレビアニメ|アニメ|劇場版)\s*/;
const OPEN = '『「【';
const CLOSE: Record<string, string> = { '『': '』', '「': '」', '【': '】' };
// 作品名の直後にこれが来たら区切りとみなす
const SEP = /^[\s×✕・:：\-–—/|｜☆★♪]+/;

const norm = (s: string) => s.normalize('NFKC').toLowerCase();
const isSpace = (c: string) => /\s/.test(c);

/** title の i 文字目から name が（空白の違いを無視して）一致すれば、一致の終わりの位置を返す */
function matchAt(title: string, i: number, name: string): number | null {
  const n = [...norm(name)].filter((c) => !isSpace(c));
  if (n.length === 0) return null;
  let k = 0;
  let j = i;
  while (j < title.length && k < n.length) {
    const c = norm(title[j]);
    if (isSpace(c)) { j++; continue; }
    if (c !== n[k]) return null;
    j++; k++;
  }
  return k === n.length ? j : null;
}

export function stripWorkName(title: string, workName?: string | null): string {
  if (!workName) return title;
  const t = title.trim();
  let i = t.match(PREFIX)?.[0].length ?? 0;
  const open = OPEN.includes(t[i]) ? t[i] : null;
  if (open) i++;
  const end = matchAt(t, i, workName);
  if (end == null) return title;
  let rest = t.slice(end);
  if (open) {
    if (rest[0] !== CLOSE[open]) return title;
    rest = rest.slice(1);
  } else if (/^[ぁ-ヿ㐀-鿿々]/.test(rest)) {
    // 区切りなしで かな・漢字 が続くのは作品名と一体の名前（「ハイキュー!!展」「進撃の巨人の日」「呪術廻戦カフェ」）。
    // 削ると「展 大阪会場」のように何の予定か分からなくなる
    return title;
  }
  rest = rest.replace(SEP, '').trim();
  // 残りの最初の語が1文字（『ハイキュー!!』展 in 東京 → 「展」）だと何の予定か分からなくなるので、そのまま出す
  const head = rest.split(/\s/)[0];
  return [...head].length >= 2 ? rest : title;
}
