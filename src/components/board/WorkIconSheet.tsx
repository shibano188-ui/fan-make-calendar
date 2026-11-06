import { useEffect, useState } from 'react';
import Sheet from '../ui/Sheet';
import { haptic } from '../../lib/haptics';
import { useWorkImagePicker } from '../story/useWorkImagePicker';
import { loadIconStyles, onIconStylesChange, iconStyleOf, setIconStyle, ICON_GRIDS, type IconMode } from '../../lib/pixelIcon';
import { WorkDot, type WorkIcons } from './WorkDot';

// ボード表示の「アイコンを変える」。作品ごとに好きなキャラの写真を選ぶと、ドット絵にしてカレンダーの点に使う。
// 写真の保存先はホーム・カスタマイズの作品アイコンと同じ（workImages.ts）なので、ここで選んでも同じ画像が出る。

export type BoardWork = { id: string; name: string };

const MODES: { mode: IconMode; label: string }[] = [
  { mode: 'round', label: '丸いドット絵' },
  { mode: 'sprite', label: '背景を抜く' },
  { mode: 'photo', label: '写真のまま' },
];

export default function WorkIconSheet({ works, colors, icons, onClose }: {
  works: BoardWork[]; colors: Map<string, string>; icons: WorkIcons; onClose: () => void;
}) {
  const picker = useWorkImagePicker();
  const [styles, setStyles] = useState(loadIconStyles);
  useEffect(() => onIconStylesChange(() => setStyles(loadIconStyles())), []);

  return (
    <Sheet onClose={onClose} title={<b className="text-[16px]">作品のアイコン</b>}>
      <div className="pb-8">
        <p className="px-4 pt-1 pb-2 text-[12px] text-label-secondary leading-relaxed">
          好きなキャラの写真を選ぶと、ドット絵にしてカレンダーの点に使います。選ばない作品は色の点のままです。白い背景や単色の背景の画像だと、きれいにできます。
        </p>
        {works.map((w) => {
          const has = !!icons[w.id];
          const st = iconStyleOf(styles, w.id);
          return (
            <div key={w.id} className="px-4 py-3 flex flex-col gap-2.5" style={{ borderTop: '0.5px solid var(--separator)' }}>
              <div className="flex items-center gap-3">
                <span className="w-14 h-14 rounded-[14px] flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                  <WorkDot workId={w.id} size={has ? 44 : 20} color={colors.get(w.id)} icons={icons} />
                </span>
                <b className="flex-1 min-w-0 truncate text-[14px]">{w.name}</b>
                <button className="pressable h-8 px-3 rounded-full text-[12px] font-semibold flex-shrink-0" style={{ boxShadow: 'inset 0 0 0 0.5px var(--separator)' }}
                  onClick={() => { haptic.select(); void picker.pick(w.id); }}>
                  {has ? '写真を変える' : '写真を選ぶ'}
                </button>
                {has && (
                  <button className="pressable h-8 px-3 rounded-full text-[12px] font-semibold flex-shrink-0" style={{ boxShadow: 'inset 0 0 0 0.5px var(--separator)' }}
                    onClick={() => { haptic.select(); picker.remove(w.id); }}>
                    外す
                  </button>
                )}
              </div>
              {has && (
                <div className="grid items-center gap-x-3 gap-y-2 text-[12px] text-label-secondary" style={{ gridTemplateColumns: 'auto 1fr' }}>
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
                </div>
              )}
            </div>
          );
        })}
      </div>
      {picker.input}
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
