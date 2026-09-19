import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { spring, prefersReducedMotion, type SpringHandle } from '../../lib/fluid';
import { haptic } from '../../lib/haptics';

// 虫眼鏡のボタンから広がる検索欄（探すの上部）。
// 押すと ①見出しが退きながら虫眼鏡が左端へ滑る ②そこから右へ伸びて入力欄になる、の2段。
// 2つの動きは1本のばね（0→1）から切り出していて、①の終わりぎわに②が始まるよう重ねてある。
// 伸びきるところで少しだけ行き過ぎて戻る（ばねの減衰を弱めにしている）。
// 何も入れずに外へ出たら逆の順で縮む。文字が入っている間は広がったまま。

const D = 36; // 閉じているときの丸の直径

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export default function ExpandingSearch({ value, onChange, placeholder, title }: {
  value: string; onChange: (v: string) => void; placeholder: string; title: ReactNode;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const springRef = useRef<SpringHandle | null>(null);
  const pRef = useRef(value ? 1 : 0);
  const [open, setOpen] = useState(!!value);

  const paint = (p: number) => {
    pRef.current = p;
    const W = areaRef.current?.clientWidth ?? 0;
    const move = clamp01(p / 0.55);             // ① 右端 → 左端
    const grow = Math.min((p - 0.3) / 0.7, 1.04); // ② 丸 → 横長（伸びきりで少し行き過ぎる）
    const pill = pillRef.current;
    if (pill) {
      pill.style.transform = `translateX(${(W - D) * (1 - move)}px)`;
      pill.style.width = `${D + (W - D) * Math.max(0, grow)}px`;
    }
    const t = titleRef.current;
    if (t) {
      const k = clamp01(p / 0.35);
      t.style.opacity = String(1 - k);
      t.style.transform = `translateX(${-10 * k}px) scale(${1 - 0.04 * k})`;
    }
    if (fieldRef.current) fieldRef.current.style.opacity = String(clamp01((p - 0.55) / 0.35));
  };

  const animate = (to: number, soft: boolean) => {
    springRef.current?.stop();
    if (prefersReducedMotion()) { paint(to); return; }
    springRef.current = spring({
      from: pRef.current, to,
      damping: soft ? 0.74 : 0.95, response: soft ? 0.5 : 0.38,
      onUpdate: paint,
    });
  };

  // 最初の位置合わせと、幅が変わったとき（画面の回転など）の描き直し
  useLayoutEffect(() => {
    paint(pRef.current);
    const ro = new ResizeObserver(() => paint(pRef.current));
    if (areaRef.current) ro.observe(areaRef.current);
    return () => { ro.disconnect(); springRef.current?.stop(); };
  }, []);

  // 外から文字が入った（URL の ?q= など）ときは開いておく
  useEffect(() => { if (value && !open) { setOpen(true); animate(1, true); } }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const expand = () => {
    if (open) return;
    haptic.select();
    setOpen(true);
    // iOS はタップの処理の中で focus しないとキーボードが出ない
    inputRef.current?.focus({ preventScroll: true });
    animate(1, true);
  };

  const collapse = () => {
    setOpen(false);
    inputRef.current?.blur();
    animate(0, false);
  };

  return (
    <div ref={areaRef} className="relative flex-1 min-w-0 h-9">
      <div ref={titleRef} className="absolute inset-y-0 left-0 flex items-center origin-left pointer-events-none"
        aria-hidden={open}>
        {title}
      </div>
      <div ref={pillRef} onClick={expand}
        className={`absolute top-0 left-0 h-9 rounded-full flex items-center overflow-hidden ${open ? '' : 'pressable cursor-pointer'}`}
        style={{ width: D, backgroundColor: 'var(--fill-tertiary)', willChange: 'transform, width' }}
        role={open ? undefined : 'button'} aria-label={open ? undefined : '検索'}>
        <span className="flex-shrink-0 w-9 h-9 flex items-center justify-center">
          <Search size={17} className="text-label-secondary" />
        </span>
        <div ref={fieldRef} className="flex-1 min-w-0 flex items-center pr-2" style={{ opacity: 0 }}>
          <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)}
            onBlur={() => { if (!value.trim()) collapse(); }}
            placeholder={placeholder} tabIndex={open ? 0 : -1}
            className="flex-1 min-w-0 bg-transparent text-[14px] outline-none"
            style={{ color: 'var(--input-text)' }} />
          {value && (
            <button onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); haptic.select(); onChange(''); collapse(); }}
              aria-label="検索をやめる" className="pressable flex-shrink-0 w-6 h-6 flex items-center justify-center text-label-tertiary">
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
