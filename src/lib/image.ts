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
