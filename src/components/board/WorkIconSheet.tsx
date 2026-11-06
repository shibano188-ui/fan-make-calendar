import { useEffect, useState } from 'react';
import Sheet from '../ui/Sheet';
import { haptic } from '../../lib/haptics';
import { useWorkImagePicker } from '../story/useWorkImagePicker';
import { loadIconStyles, onIconStylesChange, iconStyleOf, setIconStyle, ICON_GRIDS, type IconMode } from '../../lib/pixelIcon';
import { WorkDot, type WorkIcons } from './WorkDot';
import { setCalDotImage } from '../../lib/calDotImages';

// ボード表示の「アイコンを変える」。カレンダーの点を、作品ごとに決める（ドット絵にして使う）。
//   作品のアイコンと同じ … ホーム・カスタマイズの作品アイコン（workImages.ts）をそのまま使う（ここで写真を選ぶと作品のアイコンも変わる）
//   別の写真           … 点だけ別の写真（calDotImages.ts）
//   色の点             … 作品の色の丸

export type BoardWork = { id: string; name: string };

const MODES: { mode: IconMode; label: string }[] = [
  { mode: 'round', label: '丸いドット絵' },
  { mode: 'sprite', label: '背景を抜く' },
  { mode: 'photo', label: '写真のまま' },
];

type Source = 'same' | 'own' | 'color';

export default function WorkIconSheet({ works, colors, icons, workImages, own, onClose }: {
  works: BoardWork[]; colors: Map<string, string>; icons: WorkIcons;
  /** 作品のアイコン */ workImages: Record<string, string>;
  /** 点だけの設定（calDotImages.ts） */ own: Record<string, string>;
  onClose: () => void;
}) {
  const workPicker = useWorkImagePicker();
  const dotPicker = useWorkImagePicker(setCalDotImage);
  const [styles, setStyles] = useState(loadIconStyles);
  useEffect(() => onIconStylesChange(() => setStyles(loadIconStyles())), []);

  return (
    <Sheet onClose={onClose} title={<b className="text-[16px]">カレンダーのアイコン</b>}>
      <div className="pb-8">
        {works.map((w) => {
          const src: Source = !(w.id in own) ? 'same' : own[w.id] ? 'own' : 'color';
          const has = !!icons[w.id];
          const st = iconStyleOf(styles, w.id);
          const pick = () => { haptic.select(); void (src === 'own' ? dotPicker : workPicker).pick(w.id); };
          return (
            <div key={w.id} className="px-4 py-3 flex flex-col gap-2.5" style={{ borderTop: '0.5px solid var(--separator)' }}>
              <div className="flex items-center gap-3">
                <span className="w-14 h-14 rounded-[14px] flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                  <WorkDot workId={w.id} size={has ? 44 : 20} color={colors.get(w.id)} icons={icons} />
                </span>
                <b className="flex-1 min-w-0 truncate text-[14px]">{w.name}</b>
                {src !== 'color' && (
                  <button className="pressable h-8 px-3 rounded-full text-[12px] font-semibold flex-shrink-0" style={{ boxShadow: 'inset 0 0 0 0.5px var(--separator)' }} onClick={pick}>
                    {(src === 'own' ? own[w.id] : workImages[w.id]) ? '写真を変える' : '写真を選ぶ'}
                  </button>
                )}
              </div>
              <div className="grid items-center gap-x-3 gap-y-2 text-[12px] text-label-secondary" style={{ gridTemplateColumns: 'auto 1fr' }}>
                <span>使う画像</span>
                <Seg options={[
                  { key: 'same', label: '作品のアイコンと同じ', on: src === 'same' },
                  { key: 'own', label: '別の写真', on: src === 'own' },
                  { key: 'color', label: '色の点', on: src === 'color' },
                ]} onPick={(k) => {
                  if (k === 'same') setCalDotImage(w.id, null);
                  else if (k === 'color') setCalDotImage(w.id, '');
                  else if (own[w.id]) return;
                  else void dotPicker.pick(w.id);
                }} />
                {has && (
                  <>
                    <span>見た目</span>
                    <Seg options={MODES.map((m) => ({ key: m.mode, label: m.label, on: st.mode === m.mode }))}
                      onPick={(k) => setIconStyle(w.id, { ...st, mode: k as IconMode })} />
                    {st.mode !== 'photo' && (
                      <>
                        <span>細かさ</span>
                        <Seg options={ICON_GRIDS.map((g) => ({ key: String(g.grid), label: g.label, on: st.grid === g.grid }))}
                          onPick={(k) => setIconStyle(w.id, { ...st, grid: Number(k) })} />
                      </>
                    )}
                    <span>カレンダー</span>
                    <span className="flex items-center gap-2">
                      <span className="flex flex-col items-center gap-[3px] px-2 py-1 rounded-[10px]" style={{ boxShadow: 'inset 0 0 0 0.5px var(--separator)' }}>
                        <b className="text-[13px] text-label-primary">14</b>
                        <WorkDot workId={w.id} size={18} color={colors.get(w.id)} icons={icons} />
                      </span>
                      この大きさで出ます
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {workPicker.input}
      {dotPicker.input}
    </Sheet>
  );
}

function Seg({ options, onPick }: { options: { key: string; label: string; on: boolean }[]; onPick: (key: string) => void }) {
  return (
    <span className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button key={o.key} aria-pressed={o.on} onClick={() => { haptic.select(); onPick(o.key); }}
          className="pressable h-[30px] px-3 rounded-full text-[12px] font-semibold"
          style={o.on ? { backgroundColor: 'var(--label-primary)', color: 'var(--bg-primary)' } : { boxShadow: 'inset 0 0 0 0.5px var(--separator)', color: 'var(--label-primary)' }}>
          {o.label}
        </button>
      ))}
    </span>
  );
}
