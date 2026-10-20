// 外部サイトの原寸画像を Vercel Image Optimization(/_vercel/image)経由で
// リサイズ・WebP変換・CDNキャッシュして配信する。転送量を大幅に減らし表示を速くする。
// 幅は vercel.json の images.sizes と一致させること。
export const OPT_WIDTHS = [192, 384, 640, 828] as const;
export type OptWidth = (typeof OPT_WIDTHS)[number];

export function optimizedImage(url: string, w: OptWidth): string {
  // 開発環境(vite dev)には /_vercel/image が無い。http画像は remotePatterns 対象外。
  if (import.meta.env.DEV || !url.startsWith('https://')) return url;
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${w}&q=75`;
}

// アニメイトの画像の square=1（正方形に引き伸ばす指定）を外す。A8 の規約で縦横比を変えられないため（2026-10-20）。
// 保存済みの image_url（1枚なら文字列、複数なら JSON 配列の文字列）にそのまま掛けられる。
export function unstretchImage<T extends string | null | undefined>(v: T): T {
  return (v ? v.replace(/&square=1(?=&|"|$)/g, '') : v) as T;
}
