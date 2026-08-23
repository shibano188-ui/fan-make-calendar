import type { ThemeSpec } from '../../design/themeSpec';

// テーマの見本。
//
// 部品のCSSは html[data-shape=…] のように**根**に紐づくので、選んでいないテーマを
// 「そのCSSで」描くことはできない。ここは設定表の値から直接組み立てて、
// 違いが出る4か所（上部の帯・面の形・地の質感・下タブ）だけを写す。

export default function SpecPreview({ spec, dark, height = 62 }: { spec: ThemeSpec; dark: boolean; height?: number }) {
  const c = dark ? spec.dark : spec.light;
  const accent = spec.accent;
  const r = spec.radius ?? 8;
  const headerBg = spec.bars === 'band' ? accent : c.surface;
  // 帯の中の面（検索欄のつもり）。アクセントの帯の上では墨、それ以外は薄い塗り
  const headerFill = spec.bars === 'band'
    ? '#17171a'
    : dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)';
  const dim = dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)';
  const cardShape: React.CSSProperties = spec.shape === 'cut'
    ? { clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 6px) 100%, 0 100%)' }
    : { borderRadius: r };
  const texture = spec.texture === 'none' ? null : {
    backgroundImage: 'radial-gradient(rgba(128,128,132,0.45) 0.5px, transparent 0.5px)',
    backgroundSize: spec.texture === 'dots' ? '5px 5px' : '3px 3px',
  };

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height, backgroundColor: c.bg, ...(texture ?? null) }}
    >
      <div className="flex items-center px-1.5" style={{ height: 20, backgroundColor: headerBg }}>
        <div style={{ height: 7, width: '100%', backgroundColor: headerFill, borderRadius: r ? 3 : 0 }} />
      </div>
      <div className="flex gap-1 px-1.5 pt-1.5">
        <div style={{ flex: 1, height: 18, backgroundColor: c.surface, ...cardShape }} />
        <div style={{ flex: 1, height: 18, backgroundColor: c.surface, ...cardShape }} />
      </div>
      <div
        className="absolute flex items-center justify-center gap-1"
        style={{
          left: spec.bars === 'band' ? 0 : 6,
          right: spec.bars === 'band' ? 0 : 6,
          bottom: spec.bars === 'band' ? 0 : 4,
          height: 10,
          backgroundColor: spec.bars === 'band' ? c.text : c.surface,
          borderRadius: spec.bars === 'floating' ? 999 : 0,
          borderTop: spec.bars === 'band' ? `1.5px solid ${accent}` : undefined,
        }}
      >
        <i style={{ width: 4, height: 4, backgroundColor: accent, borderRadius: spec.shape === 'round' ? 999 : 0 }} />
        <i style={{ width: 4, height: 4, backgroundColor: dim, borderRadius: spec.shape === 'round' ? 999 : 0 }} />
        <i style={{ width: 4, height: 4, backgroundColor: dim, borderRadius: spec.shape === 'round' ? 999 : 0 }} />
      </div>
    </div>
  );
}
