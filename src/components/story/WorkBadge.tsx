// 作品の丸（ホームの作品カードとストーリーの見出し）。
// 作品アイコン（カレンダーで設定するものと同じ）があればそれ、無ければ作品カラーの地に作品名の1文字目。
// ring: 未読の新着があるときは作品カラーの輪、見終えたら灰色の細い輪（Instagram と同じ考え方）
// 缶バッジの見た目（光沢・縁の厚み）を重ねている（2026-10-05）

/** 作品色の上に乗せる文字の色（SavedCalendar の textOn と同じ決め方） */
function textOn(bg: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(bg)) return 'var(--accent-on)';
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(bg.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.42 ? '#141414' : '#ffffff';
}

export default function WorkBadge({ title, color, image, size, ring, label, badge = true }: {
  title: string; color: string; image?: string; size: number;
  /** 缶バッジの光沢を付ける（既定で付ける） */
  badge?: boolean;
  /** 'unseen'＝作品カラーの輪・'seen'＝灰色の細い輪・省略＝輪なし */
  ring?: 'unseen' | 'seen';
  /** 1文字目の代わりに出す文字（今週のまとめの「今週」など） */
  label?: string;
}) {
  const ringW = ring === 'unseen' ? Math.max(2, Math.round(size / 22)) : ring === 'seen' ? 1 : 0;
  const gap = ring ? Math.max(2, Math.round(size / 26)) : 0;
  const inner = size - (ringW + gap) * 2;
  const text = label ?? Array.from(title)[0] ?? '';
  return (
    <span className="flex-shrink-0 rounded-full flex items-center justify-center"
      style={{
        width: size, height: size,
        border: ringW ? `${ringW}px solid ${ring === 'unseen' ? color : 'var(--label-quaternary, rgba(120,120,128,0.36))'}` : undefined,
        backgroundColor: 'var(--bg-primary)',
      }}>
      <span className="relative rounded-full overflow-hidden flex items-center justify-center font-bold"
        style={{
          width: inner, height: inner, backgroundColor: color, color: textOn(color), fontSize: Math.round(inner * (label ? 0.28 : 0.42)),
          // 缶バッジの縁の厚み（下に落ちる小さな影）
          boxShadow: badge ? '0 1px 2px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.12)' : undefined,
        }}>
        {image ? <img src={image} alt="" className="w-full h-full object-cover" /> : text}
        {/* 缶バッジの光沢（2026-10-05 柴野「ファンが親しみやすいように」）。左上のハイライト・縁の丸み・下側の陰を重ねる。
            色は白と黒の透明度だけなので、作品カラーやテーマの色を選ばない */}
        {badge && (
          <span aria-hidden className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle at 32% 24%, rgba(255,255,255,0.62) 0, rgba(255,255,255,0.18) 26%, rgba(255,255,255,0) 46%), radial-gradient(circle at 60% 110%, rgba(0,0,0,0.22), rgba(0,0,0,0) 58%)',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.45), inset 0 -2px 3px rgba(0,0,0,0.18), inset 0 2px 2px rgba(255,255,255,0.25)',
            }} />
        )}
      </span>
    </span>
  );
}
