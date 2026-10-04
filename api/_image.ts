// 店の「画像はまだありません」の仮の画像を見分ける（2026-10-05 柴野「アニメイトの no image が登録される」）。
// アニメイトは、発売前でまだ画像を上げていない商品（本・カレンダーなど）に、画像の名前が空の URL
// （resize_image.php?image=&width=…）を出す。中身は共通の「NO IMAGE」の絵（6,147バイト）。
// これを画像として入れると、あとで本物の画像が出ても「画像あり」と見なされて差し替わらないので、画像なしとして扱う。
// api/ の関数の数に数えないよう `_` で始めている。

/** 仮の画像（NO IMAGE）か */
export function isPlaceholderImage(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (/techorus-cdn\.com$|animate-onlineshop\.jp$/.test(u.host) && u.pathname.includes('resize_image') && !u.searchParams.get('image')) return true;
    return /no[_-]?image|now[_-]?printing/i.test(u.pathname);
  } catch { return false; }
}

/** events.image_url の1枚目（1枚なら URL そのもの、複数なら JSON の配列で入っている） */
export function firstImage(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('[')) {
    try { const a = JSON.parse(imageUrl); return Array.isArray(a) && typeof a[0] === 'string' ? a[0] : null; } catch { return null; }
  }
  return imageUrl;
}
