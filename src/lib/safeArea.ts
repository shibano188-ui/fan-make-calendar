/**
 * CSS env(safe-area-inset-top) の実測値(px)を返す。
 * ネイティブ広告バナーをステータスバー直下に出すための margin 計算に使う。
 * edge-to-edge が効いていればステータスバー高さ、overlay:false が効いて
 * WebView が下げられていれば 0 になる（どちらでも整合する）。
 */
export function getSafeTop(): number {
  if (typeof document === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none;';
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return Math.round(h);
}
