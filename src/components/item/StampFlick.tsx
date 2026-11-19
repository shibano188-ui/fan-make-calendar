import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { REACTIONS } from '../../lib/reactions';
import { haptic } from '../../lib/haptics';

// スタンプを押したまま払って、離すと押せる（2026-11-19 柴野。beta の人だけ）。
// 上 欲しい・下 買った・左 行きたい・右 行った。押したまま止めると円が出て、指を動かして選べる。
// すぐ離した（押しただけ）ときは、今までどおりパネルを開く。
// 手本: Pinterest の長押し→払って選ぶ扇のメニュー。Android の決まりは長押しを文脈メニューに使わないので、押すだけの道は残す。

type Dir = 'up' | 'down' | 'left' | 'right';
const DIRS: Record<Dir, string> = { up: 'want', down: 'bought', left: 'want_go', right: 'went' };
const R = 92;
const HOLD_MS = 180;
const MOVE_PX = 16;

const img = (type: string) => REACTIONS.find((r) => r.type === type)!;

/** 押す所に付ける。onTap＝押しただけ、onPick＝払って選んだ */
export function useStampFlick({ enabled, onTap, onPick }: { enabled: boolean; onTap: () => void; onPick: (type: string) => void }) {
  const st = useRef<{ x: number; y: number; dir: Dir | null; shown: boolean; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const [wheel, setWheel] = useState<{ cx: number; cy: number; dir: Dir | null; tap: boolean } | null>(null);
  const [press, setPress] = useState<{ type: string; key: number } | null>(null);

  const center = (el: HTMLElement) => {
    const b = el.getBoundingClientRect(), m = R + 46;
    return { cx: Math.min(window.innerWidth - m, Math.max(m, b.left + b.width / 2)), cy: Math.min(window.innerHeight - m, Math.max(m, b.top + b.height / 2)) };
  };
  const fire = (dir: Dir) => {
    const type = DIRS[dir];
    haptic.light();
    setPress({ type, key: Date.now() });
    setTimeout(() => setPress(null), 560);
    onPick(type);
  };

  const handlers = enabled ? {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const s = { x: e.clientX, y: e.clientY, dir: null as Dir | null, shown: false, timer: null as ReturnType<typeof setTimeout> | null };
      s.timer = setTimeout(() => { if (st.current === s) { s.shown = true; haptic.select(); setWheel({ ...center(el), dir: s.dir, tap: false }); } }, HOLD_MS);
      st.current = s;
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const s = st.current; if (!s) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      const dir: Dir | null = Math.hypot(dx, dy) > MOVE_PX ? (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')) : null;
      if (dir !== s.dir && dir) haptic.select();
      s.dir = dir;
      if (dir && !s.shown) { s.shown = true; setWheel({ ...center(e.currentTarget), dir, tap: false }); }
      else if (s.shown) setWheel((w) => (w ? { ...w, dir } : w));
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      e.stopPropagation();
      const s = st.current; st.current = null; if (!s) return;
      if (s.timer) clearTimeout(s.timer);
      if (s.dir) { setWheel(null); fire(s.dir); return; }
      if (s.shown) { setWheel((w) => (w ? { ...w, tap: true } : w)); return; } // 止めて離した: 円を残して押して選ぶ
      onTap();
    },
    onPointerCancel: () => { const s = st.current; st.current = null; if (s?.timer) clearTimeout(s.timer); setWheel(null); },
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); if (e.detail === 0) onTap(); }, // キーボードで押したとき
    style: { touchAction: 'none' as const },
  } : null;

  const overlay = (wheel || press) ? createPortal(
    <div className="fixed inset-0 max-w-app mx-auto" style={{ zIndex: 420, pointerEvents: wheel?.tap ? 'auto' : 'none' }}
      onClick={() => setWheel(null)}>
      {wheel && (
        <div className="absolute inset-0" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-primary) 82%, transparent)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', animation: 'fadeIn .12s ease both' }}>
          <div className="absolute" style={{ left: wheel.cx, top: wheel.cy }}>
            <div className="absolute rounded-full border border-dashed" style={{ left: -R, top: -R, width: R * 2, height: R * 2, borderColor: 'var(--separator)' }} />
            {(Object.keys(DIRS) as Dir[]).map((d) => {
              const r = img(DIRS[d]), on = wheel.dir === d;
              const off = d === 'up' ? [0, -R] : d === 'down' ? [0, R] : d === 'left' ? [-R, 0] : [R, 0];
              return (
                <button key={d} aria-label={r.label} onClick={(e) => { e.stopPropagation(); setWheel(null); fire(d); }}
                  className="absolute rounded-full flex items-center justify-center"
                  style={{
                    width: 68, height: 68, left: off[0] - 34, top: off[1] - 34,
                    backgroundColor: on ? 'var(--accent-color)' : 'var(--bg-primary)', border: '1px solid var(--separator)',
                    transform: on ? 'scale(1.28)' : 'scale(1)', transition: 'transform .12s ease, background-color .12s ease',
                  }}>
                  <img src={r.image} alt="" className="stamp w-11 h-11 pointer-events-none" />
                </button>
              );
            })}
            <div className="absolute text-center" style={{ left: -60, top: -14, width: 120 }}>
              <div className="text-[13px] font-extrabold">{wheel.dir ? img(DIRS[wheel.dir]).label : wheel.tap ? '選ぶ' : '払って選ぶ'}</div>
            </div>
          </div>
        </div>
      )}
      {press && (
        <img key={press.key} src={img(press.type).image} alt="" className="stamp absolute left-1/2 top-[44%] w-[110px] h-[110px] -ml-[55px] -mt-[55px]"
          style={{ animation: 'stampPress .55s cubic-bezier(.2,1.4,.4,1) forwards' }} />
      )}
    </div>,
    document.body,
  ) : null;

  return { handlers, overlay };
}
