import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { Search, X } from 'lucide-react';
import { spring, prefersReducedMotion, type SpringHandle } from '../../lib/fluid';
import { haptic } from '../../lib/haptics';

// 虫眼鏡のボタンから広がる検索欄（探す・カレンダーの上部）。
// 開くときは1つずつ順に動かす:
//   ① 見出しが退きながら、虫眼鏡が左端へ滑る
//   ② 着いたところで虫眼鏡がぷるっと揺れる
//   ③ 丸から横長に伸びる（伸びきりで少し行き過ぎて戻る）
//   ④ 入力欄になり、キーボードが出る
// 閉じるときは逆順（③→①）で、揺れは無し。
// キーボードが出ている間は画面全体に透明な板を敷き、外を押したら閉じる。
// 板が指を受け止めるので、下の予定を押して詳細が開いてしまうことはない。

const D = 36; // 閉じているときの丸の直径
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// iOS の WebView は、タップの処理の中で focus しないとキーボードが出ない。
// iOS だけは最初に focus し（キーボードは①と同時に上がる）、他は④で focus する
const FOCUS_ON_TAP = Capacitor.getPlatform() === 'ios';

export default function ExpandingSearch({ value, onChange, placeholder, title }: {
  value: string; onChange: (v: string) => void; placeholder: string; title: ReactNode;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const moveRef = useRef<SpringHandle | null>(null);
  const growRef = useRef<SpringHandle | null>(null);
  const timers = useRef<number[]>([]);
  const m = useRef(value ? 1 : 0); // ① の進み具合
  const g = useRef(value ? 1 : 0); // ③ の進み具合
  const [open, setOpen] = useState(!!value);
  const [focused, setFocused] = useState(false);
  const [shield, setShield] = useState(false);

  const paint = () => {
    const W = areaRef.current?.clientWidth ?? 0;
    const pill = pillRef.current;
    if (pill) {
      pill.style.transform = `translateX(${(W - D) * (1 - clamp01(m.current))}px)`;
      pill.style.width = `${D + (W - D) * Math.max(0, g.current)}px`;
    }
    const t = titleRef.current;
    if (t) {
      const k = clamp01(m.current * 1.4);
      t.style.opacity = String(1 - k);
      t.style.transform = `translateX(${-12 * k}px) scale(${1 - 0.05 * k})`;
    }
  };

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const stopAll = () => { moveRef.current?.stop(); growRef.current?.stop(); clearTimers(); };

  const showField = (on: boolean) => {
    const f = fieldRef.current;
    if (!f) return;
    f.style.transition = on ? 'opacity 0.22s ease-out' : 'opacity 0.1s ease-in';
    f.style.opacity = on ? '1' : '0';
  };

  const wiggle = () => {
    iconRef.current?.animate(
      [{ transform: 'rotate(0)' }, { transform: 'rotate(-16deg) scale(1.08)' }, { transform: 'rotate(11deg) scale(1.04)' },
       { transform: 'rotate(-6deg)' }, { transform: 'rotate(2deg)' }, { transform: 'rotate(0)' }],
      { duration: 380, easing: 'ease-out' },
    );
  };

  const expand = () => {
    if (open) return;
    haptic.select();
    setOpen(true);
    stopAll();
    if (FOCUS_ON_TAP) inputRef.current?.focus({ preventScroll: true });
    if (prefersReducedMotion()) {
      m.current = 1; g.current = 1; paint(); showField(true);
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    // ① 左端へ
    let arrived = false;
    moveRef.current = spring({
      from: m.current, to: 1, damping: 0.88, response: 0.42,
      onUpdate: (v) => {
        m.current = v; paint();
        if (!arrived && v > 0.97) {
          arrived = true;
          // ② 揺れる → ③ 伸びる
          wiggle();
          haptic.light();
          later(() => {
            let grown = false;
            growRef.current = spring({
              from: g.current, to: 1, damping: 0.68, response: 0.46,
              onUpdate: (w) => {
                g.current = w; paint();
                // ④ ほぼ伸びたら入力欄にしてキーボードを出す
                if (!grown && w > 0.9) {
                  grown = true;
                  showField(true);
                  if (!FOCUS_ON_TAP) inputRef.current?.focus({ preventScroll: true });
                }
              },
            });
          }, 300);
        }
      },
    });
  };

  const collapse = () => {
    setOpen(false);
    stopAll();
    showField(false);
    inputRef.current?.blur();
    if (prefersReducedMotion()) { m.current = 0; g.current = 0; paint(); return; }
    let shrunk = false;
    growRef.current = spring({
      from: g.current, to: 0, damping: 1, response: 0.3,
      onUpdate: (w) => {
        g.current = w; paint();
        if (!shrunk && w < 0.08) {
          shrunk = true;
          moveRef.current = spring({ from: m.current, to: 0, damping: 0.92, response: 0.36, onUpdate: (v) => { m.current = v; paint(); } });
        }
      },
    });
  };

  // 最初の位置合わせと、幅が変わったとき（画面の回転など）の描き直し
  useLayoutEffect(() => {
    paint();
    if (value) showField(true);
    const ro = new ResizeObserver(() => paint());
    if (areaRef.current) ro.observe(areaRef.current);
    return () => { ro.disconnect(); stopAll(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 外から文字が入った（URL の ?q= など）ときは開いておく
  useEffect(() => {
    if (value && !open) { setOpen(true); m.current = 1; g.current = 1; paint(); showField(true); }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // 外を押したとき: キーボードを閉じ、空なら縮める。板は指を離すまで残して、下の予定が押されないようにする
  const onShieldDown = (e: React.PointerEvent) => {
    e.preventDefault();
    inputRef.current?.blur();
    if (!value.trim()) collapse();
  };

  return (
    <div ref={areaRef} className="relative flex-1 min-w-0 h-9">
      <div ref={titleRef} className="absolute inset-y-0 left-0 right-11 flex items-center origin-left"
        style={{ pointerEvents: open ? 'none' : 'auto' }} aria-hidden={open}>
        {title}
      </div>
      <div ref={pillRef} onClick={expand}
        className={`absolute top-0 left-0 h-9 rounded-full flex items-center overflow-hidden ${open ? '' : 'pressable cursor-pointer'}`}
        style={{ width: D, backgroundColor: 'var(--fill-tertiary)', willChange: 'transform, width' }}
        role={open ? undefined : 'button'} aria-label={open ? undefined : '検索'}>
        <span ref={iconRef} className="flex-shrink-0 w-9 h-9 flex items-center justify-center">
          <Search size={17} className="text-label-secondary" />
        </span>
        <div ref={fieldRef} className="flex-1 min-w-0 flex items-center pr-2" style={{ opacity: 0 }}>
          <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)}
            onFocus={() => { setFocused(true); setShield(true); }}
            onBlur={() => { setFocused(false); if (!value.trim() && open) collapse(); }}
            placeholder={placeholder} tabIndex={open ? 0 : -1} enterKeyHint="search"
            onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.blur(); }}
            className="flex-1 min-w-0 bg-transparent text-[14px] outline-none"
            style={{ color: 'var(--input-text)' }} />
          {value && (
            <button onPointerDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); haptic.select(); onChange(''); collapse(); }}
              aria-label="検索をやめる" className="pressable flex-shrink-0 w-6 h-6 flex items-center justify-center text-label-tertiary">
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      {/* キーボードが出ている間の透明な板。上部バー（z-20）より下、中身より上 */}
      {shield && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 15, touchAction: 'none' }}
          onPointerDown={onShieldDown}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!focused) setShield(false); }}
          onPointerUp={() => { window.setTimeout(() => { if (document.activeElement !== inputRef.current) setShield(false); }, 350); }} />,
        document.body,
      )}
    </div>
  );
}
