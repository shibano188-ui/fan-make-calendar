import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { Search, X } from 'lucide-react';
import { prefersReducedMotion } from '../../lib/fluid';
import { haptic } from '../../lib/haptics';

// 虫眼鏡のボタンから広がる検索欄（探す・カレンダー・ホームの上部）。
// 欄は最初から横いっぱいの大きさで置いておき、見える範囲（clip-path）と虫眼鏡の位置（transform）だけを動かす。
// 前は欄の幅を毎コマ変えていて、ぼかしの入った見出しごと描き直すのでスマホで重かった（2026-10-02 本人指摘）。
// 開くとき: 見出しが消え、虫眼鏡が左へ滑りながら欄が右から左へ広がる → 入力欄が出て、キーボードが出る
// 閉じるとき: 逆向き。
// キーボードが出ている間は画面全体に透明な板を敷き、外を押したら閉じる。
// 板が指を受け止めるので、下の予定を押して詳細が開いてしまうことはない。

const D = 36; // 閉じているときの丸の直径
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
// iOS の WebView は、タップの処理の中で focus しないとキーボードが出ない。
// iOS だけは押した瞬間に focus し、他は広がりきってから focus する
const FOCUS_ON_TAP = Capacitor.getPlatform() === 'ios';

/** 検索欄の横のボタンの並び。入力しているあいだは畳んで、検索欄を横いっぱいにする（2026-10-02）。
 *  ExpandingSearch の sideRef に渡すと、開閉に合わせて ExpandingSearch が直接スタイルを変える
 *  （親の state にすると、探すの一覧（カード数百枚）まで描き直して虫眼鏡の動きが重くなるため） */
export const SearchSideButtons = forwardRef<HTMLDivElement, { gap: number; children: ReactNode }>(({ gap, children }, ref) => (
  <div ref={ref} data-gap={gap} className="flex items-center flex-shrink-0" style={{ gap }}>{children}</div>
));

export default function ExpandingSearch({ value, onChange, placeholder, title, onSubmit, sideRef }: {
  value: string; onChange: (v: string) => void; placeholder: string; title: ReactNode;
  /** Enter を押したとき（ホームは探すへ移る）。無ければキーボードを閉じるだけ */
  onSubmit?: (v: string) => void;
  /** 入力中（開いていて、キーボードが出ているか、まだ何も入れていない）に畳む横のボタン（SearchSideButtons） */
  sideRef?: RefObject<HTMLDivElement>;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const anims = useRef<Animation[]>([]);
  const firstRef = useRef(true);
  const [open, setOpen] = useState(!!value);
  const [focused, setFocused] = useState(false);
  const [shield, setShield] = useState(false);

  // 横のボタンは一瞬で畳む（幅を動かしながら欄を広げると、広がる先が動き続けて重く長く見える）。戻すときだけふわっと出す。
  // 下の開閉の動きより先に走らせる（畳んだあとの幅で動きを決めるため。同じ描画の中で上から順に走る）
  const active = open && (focused || !value.trim());
  useLayoutEffect(() => {
    const el = sideRef?.current;
    if (!el) return;
    const gap = Number(el.dataset.gap) || 0;
    Object.assign(el.style, active
      ? { maxWidth: '0px', marginLeft: `${-gap}px`, opacity: '0', overflow: 'hidden', pointerEvents: 'none', transition: 'none' }
      : { maxWidth: '', marginLeft: '', opacity: '1', overflow: '', pointerEvents: '', transition: 'opacity 0.2s ease-in' });
    el.setAttribute('aria-hidden', String(active));
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // 開閉の動き。止まっている形は下の JSX の style が決めていて、ここでは「前の形 → 今の形」を重ねて動かすだけ。
  // 動かすのは clip-path・transform・opacity だけ（幅は変えない）
  useLayoutEffect(() => {
    if (firstRef.current) { firstRef.current = false; return; } // 最初の描画は動かさない
    const area = areaRef.current, pill = pillRef.current, icon = iconRef.current, field = fieldRef.current, t = titleRef.current;
    if (!area || !pill || !icon || !field || !t) return;
    anims.current.forEach((a) => a.cancel());
    const W = area.clientWidth;
    const shut = `inset(0px 0px 0px ${W - D}px round ${D / 2}px)`;
    const full = `inset(0px 0px 0px 0px round ${D / 2}px)`;
    const reduce = prefersReducedMotion();
    const o = (ms: number, delay = 0): KeyframeAnimationOptions => ({ duration: reduce ? 0 : ms, delay: reduce ? 0 : delay, easing: EASE, fill: 'both' });
    if (open) {
      anims.current = [
        pill.animate([{ clipPath: shut }, { clipPath: full }], o(320)),
        icon.animate([{ transform: `translateX(${W - D}px)` }, { transform: 'none' }], o(320)),
        t.animate([{ opacity: 1 }, { opacity: 0 }], o(120)),
        field.animate([{ opacity: 0 }, { opacity: 1 }], o(160, 140)),
      ];
      if (!FOCUS_ON_TAP) anims.current[0].finished.then(() => inputRef.current?.focus({ preventScroll: true })).catch(() => {});
    } else {
      anims.current = [
        field.animate([{ opacity: 1 }, { opacity: 0 }], o(80)),
        pill.animate([{ clipPath: full }, { clipPath: shut }], o(280)),
        // 閉じた形では虫眼鏡は右端に置かれている（marginLeft）。左から戻ってくるように逆向きにずらす
        icon.animate([{ transform: `translateX(${-(W - D)}px)` }, { transform: 'none' }], o(280)),
        t.animate([{ opacity: 0 }, { opacity: 1 }], o(160, 120)),
      ];
    }
    const mine = anims.current;
    // 動き終わったら外して、止まっている形（style）に任せる
    Promise.all(mine.map((a) => a.finished)).then(() => mine.forEach((a) => a.cancel())).catch(() => {});
  }, [open]);

  useEffect(() => () => anims.current.forEach((a) => a.cancel()), []);

  const expand = () => {
    if (open) return;
    haptic.select();
    setOpen(true);
    if (FOCUS_ON_TAP) inputRef.current?.focus({ preventScroll: true });
  };

  const collapse = () => {
    setOpen(false);
    inputRef.current?.blur();
  };

  // 外から文字が入った（URL の ?q= など）ときは開いておく
  useEffect(() => {
    if (value && !open) setOpen(true);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // 外を押したとき: キーボードを閉じ、空なら縮める。板は指を離すまで残して、下の予定が押されないようにする
  const onShieldDown = (e: React.PointerEvent) => {
    e.preventDefault();
    inputRef.current?.blur();
    if (!value.trim()) collapse();
  };

  // iOS は入力欄に focus した瞬間、カーソルを見せようと中身を横にずらすことがある。ずれたら戻す
  const noScroll = (e: React.UIEvent<HTMLDivElement>) => { if (e.currentTarget.scrollLeft) e.currentTarget.scrollLeft = 0; };

  return (
    <div ref={areaRef} className="relative flex-1 min-w-0 h-9">
      <div ref={titleRef} className="absolute inset-y-0 left-0 right-11 flex items-center"
        style={{ opacity: open ? 0 : 1, pointerEvents: open ? 'none' : 'auto' }} aria-hidden={open}>
        {title}
      </div>
      {/* 欄は常に横いっぱい。閉じているときは右端の丸だけ見せる（見えない部分は押せない） */}
      <div ref={pillRef} onClick={expand} onScroll={noScroll}
        className={`absolute inset-0 h-9 rounded-full flex items-center overflow-hidden ${open ? '' : 'pressable cursor-pointer'}`}
        style={{ backgroundColor: 'var(--fill-tertiary)', clipPath: open ? 'none' : `inset(0px 0px 0px calc(100% - ${D}px) round ${D / 2}px)` }}
        role={open ? undefined : 'button'} aria-label={open ? undefined : '検索'}>
        <span ref={iconRef} className="flex-shrink-0 w-9 h-9 flex items-center justify-center"
          style={{ marginLeft: open ? 0 : `calc(100% - ${D}px)` }}>
          <Search size={17} className="text-label-secondary" />
        </span>
        <div ref={fieldRef} className="flex-1 min-w-0 flex items-center pr-2" style={{ opacity: open ? 1 : 0 }} onScroll={noScroll}>
          <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)}
            onFocus={() => { setFocused(true); setShield(true); }}
            onBlur={() => { setFocused(false); if (!value.trim() && open) collapse(); }}
            placeholder={placeholder} tabIndex={open ? 0 : -1} enterKeyHint="search"
            onKeyDown={(e) => { if (e.key !== 'Enter') return; if (onSubmit && value.trim()) onSubmit(value.trim()); else inputRef.current?.blur(); }}
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
