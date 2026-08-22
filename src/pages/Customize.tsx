import { useRef, useState, useEffect } from 'react';
import { Upload, ChevronDown } from 'lucide-react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import { useTheme, COMMUNITY_THEMES, type UserSettings } from '../contexts/ThemeContext';
import { listRecentWorks, type Work } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { WORK_COLORS } from './Calendar';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { pushAppState } from '../lib/appState';
import { hasNativePhotoPicker, pickPhoto } from '../lib/pickPhoto';
import { SKINS, SKIN_IDS } from '../design/skins';

const CAL_COLOR_FIELDS: { key: keyof UserSettings; label: string; cssVar: string }[] = [
  { key: 'calWeekday',    label: '平日',        cssVar: '--cal-weekday-color' },
  { key: 'calSaturday',   label: '土曜日',      cssVar: '--cal-saturday-color' },
  { key: 'calSunday',     label: '日曜日',      cssVar: '--cal-sunday-color' },
  { key: 'calOtherMonth', label: '前後月の日付', cssVar: '--cal-other-month-color' },
  { key: 'calGridColor',  label: 'グリッド線',   cssVar: '--cal-grid-color' },
];

// 10列 × 7行（列 = 色相ファミリー、行 = 明 → 暗）
const PALETTE_COLS = 10;
const PALETTE_COLORS: string[][] = [
  ['#ffffff','#f0f0f0','#d9d9d9','#bfbfbf','#808080','#595959','#1a1a1a'],
  ['#f8f9fa','#dee2e6','#ced4da','#adb5bd','#6c757d','#495057','#212529'],
  ['#ffebee','#ffcdd2','#ef9a9a','#f44336','#e53935','#c62828','#7f0000'],
  ['#fff3e0','#ffe0b2','#ffcc80','#ffa726','#f57c00','#e65100','#bf360c'],
  ['#fffde7','#fff9c4','#fff176','#ffee58','#fdd835','#f9a825','#f57f17'],
  ['#e8f5e9','#c8e6c9','#a5d6a7','#66bb6a','#43a047','#2e7d32','#1b5e20'],
  ['#e0f2f1','#b2dfdb','#80cbc4','#26a69a','#00897b','#00695c','#004d40'],
  ['#e3f2fd','#bbdefb','#90caf9','#42a5f5','#1e88e5','#1565c0','#0d47a1'],
  ['#ede7f6','#d1c4e9','#b39ddb','#9575cd','#7e57c2','#5e35b1','#311b92'],
  ['#fce4ec','#f8bbd0','#f48fb1','#ec407a','#d81b60','#ad1457','#880e4f'],
];
const PALETTE_FLAT = Array.from(
  { length: PALETTE_COLS * 7 },
  (_, i) => PALETTE_COLORS[i % PALETTE_COLS][Math.floor(i / PALETTE_COLS)],
);

// ─── 背景画像クロップモーダル ────────────────────────────────────────

const DAY_LABELS_CROP = ['日', '月', '火', '水', '木', '金', '土'];

function BgImageCropModal({
  imageUrl,
  initialOffsetX,
  initialOffsetY,
  onConfirm,
  onCancel,
}: {
  imageUrl: string;
  initialOffsetX: number;
  initialOffsetY: number;
  onConfirm: (offsetX: number, offsetY: number) => void;
  onCancel: () => void;
}) {
  const [offsetX, setOffsetX] = useState(initialOffsetX);
  const [offsetY, setOffsetY] = useState(initialOffsetY);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startRef = useRef({ x: 0, y: 0, ox: initialOffsetX, oy: initialOffsetY });

  const handlePointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    startRef.current = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    // ドラッグ右 → 背景が右へ移動 → 左側が見える (offsetX 減少)
    const newX = Math.max(0, Math.min(100, startRef.current.ox - (dx / rect.width) * 100));
    const newY = Math.max(0, Math.min(100, startRef.current.oy - (dy / rect.height) * 100));
    setOffsetX(newX);
    setOffsetY(newY);
  };

  const handlePointerUp = () => { dragging.current = false; };

  return (
    <div className="fixed inset-0 z-[400] flex flex-col items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.88)' }}>
      <div className="flex flex-col items-center gap-5 px-5 w-full max-w-sm">
        <div className="text-center">
          <p className="text-white text-sm font-semibold">カレンダー背景の範囲を設定</p>
          <p className="text-white/50 text-xs mt-1">ドラッグして位置を調整してください</p>
        </div>

        {/* カレンダープレビュー */}
        <div
          ref={containerRef}
          className="rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing select-none"
          style={{
            width: 300,
            height: 256,
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: `${offsetX}% ${offsetY}%`,
            touchAction: 'none',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* カレンダーシルエットオーバーレイ */}
          <div className="w-full h-full p-3" style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}>
            <div className="grid grid-cols-7 mb-1.5">
              {DAY_LABELS_CROP.map((d, i) => (
                <div key={d} className="text-center text-[10px] font-medium py-0.5"
                  style={{ color: i === 0 ? 'rgba(248,113,113,0.9)' : i === 6 ? 'rgba(96,165,250,0.9)' : 'rgba(255,255,255,0.7)' }}>
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {Array.from({ length: 35 }, (_, i) => (
                <div key={i} className="flex items-center justify-center">
                  <div className="w-7 h-7 rounded-full bg-white/15" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 w-full">
          <button onClick={onCancel}
            className="flex-1 py-3 rounded-xl text-sm border"
            style={{ color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.2)' }}>
            キャンセル
          </button>
          <button onClick={() => onConfirm(offsetX, offsetY)}
            className="flex-1 py-3 rounded-xl text-sm font-semibold bg-white text-black">
            この範囲で設定
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── メイン画面 ────────────────────────────────────────────────────

export default function Customize() {
  const { settings, updateSettings, currentWorkId, skin, setSkin } = useTheme();
  const { user } = useAuth();
  const confirmDialog = useConfirm();
  const currentWorkName = localStorage.getItem('last_calendar_work_name') ?? '';
  const rootRef          = useRef<HTMLDivElement>(null);
  const bgInputRef       = useRef<HTMLInputElement>(null);
  const calColorWrapperRef  = useRef<HTMLDivElement>(null);
  const calBtnRefs       = useRef<(HTMLButtonElement | null)[]>([null, null, null, null, null]);
  const calCustomInputRef = useRef<HTMLInputElement>(null);

  // 開いたら最上部から（前ページ＝マイページのスクロール位置を引き継がない）
  useEffect(() => {
    let el = rootRef.current?.parentElement as HTMLElement | null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') el.scrollTop = 0;
      el = el.parentElement;
    }
    window.scrollTo(0, 0);
  }, []);

  const [calColorOpen, setCalColorOpen]   = useState(false);
  const [openCalKey, setOpenCalKey]       = useState<string | null>(null);
  const [paletteTop, setPaletteTop]       = useState(0);
  const [showCropModal, setShowCropModal] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState('');

  const [participatedWorks, setParticipatedWorks] = useState<Work[]>([]);
  const [workColors, setWorkColors] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('fan_work_colors') ?? '{}'); } catch { return {}; }
  });
  const [workColorOpen, setWorkColorOpen] = useState(false);
  const [openWorkColorKey, setOpenWorkColorKey] = useState<string | null>(null);
  const [workColorPaletteTop, setWorkColorPaletteTop] = useState(0);
  const workColorWrapperRef = useRef<HTMLDivElement>(null);
  const workBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const workCustomInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    listRecentWorks(user.id).then(setParticipatedWorks).catch(console.error);
  }, [user?.id]);

  // パレット外クリックで閉じる
  useEffect(() => {
    if (!openCalKey) return;
    const handler = (e: MouseEvent) => {
      if (!calColorWrapperRef.current?.contains(e.target as Node)) setOpenCalKey(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openCalKey]);

  useEffect(() => {
    if (!openWorkColorKey) return;
    const handler = (e: MouseEvent) => {
      if (!workColorWrapperRef.current?.contains(e.target as Node)) setOpenWorkColorKey(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openWorkColorKey]);

  const handleCalToggle = (key: string, i: number) => {
    if (openCalKey === key) { setOpenCalKey(null); return; }
    const btn = calBtnRefs.current[i];
    const wrapper = calColorWrapperRef.current;
    if (btn && wrapper) {
      const btnRect     = btn.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      setPaletteTop(btnRect.bottom - wrapperRect.top + 6);
    }
    setOpenCalKey(key);
  };

  const handleWorkColorToggle = (workId: string, i: number) => {
    if (openWorkColorKey === workId) { setOpenWorkColorKey(null); return; }
    const btn = workBtnRefs.current[i];
    const wrapper = workColorWrapperRef.current;
    if (btn && wrapper) {
      const btnRect = btn.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      setWorkColorPaletteTop(btnRect.bottom - wrapperRect.top + 6);
    }
    setOpenWorkColorKey(workId);
  };

  const updateWorkColor = (workId: string, color: string | null) => {
    const updated = { ...workColors };
    if (color === null) { delete updated[workId]; } else { updated[workId] = color; }
    setWorkColors(updated);
    localStorage.setItem('fan_work_colors', JSON.stringify(updated));
    pushAppState('work_colors', updated);
    setOpenWorkColorKey(null);
  };

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setPendingImageUrl(ev.target?.result as string);
      setShowCropModal(true);
    };
    reader.readAsDataURL(file);
    // input をリセットして同じファイルを再選択できるようにする
    e.target.value = '';
  };

  // 背景画像を選ぶ。ネイティブは写真ライブラリを直接開く（iOSのファイル入力は
  // 「Take Photo」を必ず出してしまい、カメラを使わないアプリでは落ちる。src/lib/pickPhoto.ts 参照）
  const openBgPicker = async () => {
    if (!hasNativePhotoPicker()) { bgInputRef.current?.click(); return; }
    const res = await pickPhoto();
    if (res.status === 'denied') {
      // 黙って戻ると「ボタンが効かない」に見える
      await confirmDialog({
        title: '写真へのアクセスが必要です',
        message: '設定アプリ ＞ FanHive ＞ 写真 で許可すると、背景画像を選べます。',
        hideCancel: true,
      });
      return;
    }
    if (res.status !== 'picked') return;
    setPendingImageUrl(res.dataUrl);
    setShowCropModal(true);
  };

  const isCommunityActive = !!settings.communityThemeId;
  const themeButtonClass = (active: boolean) =>
    `rounded-xl overflow-hidden border-2 transition-colors ${active ? 'border-selected' : 'border-subtle'}`;

  const calColorPreviewDots = CAL_COLOR_FIELDS.map(f => settings[f.key] as string).filter(Boolean);

  return (
    <Layout hideBottomTab>
      <Header
        title="カスタマイズ"
        subtitle={currentWorkId && currentWorkName ? `「${currentWorkName}」の設定` : undefined}
      />

      <div ref={rootRef} className="px-4 pt-4 pb-8 flex flex-col gap-6">

        {/* テーマ（外皮）＝ 形・書体・質感・色をひとまとめにした層。アプリ全体に効く。
            AIで作ったテーマも、いずれこの一覧に並ぶ。 */}
        <section>
          <p className="text-label-tertiary text-xs mb-3">テーマ</p>
          <div className="grid grid-cols-3 gap-2">
            {SKIN_IDS.map(id => {
              const def = SKINS[id];
              const on = skin === id;
              return (
                <button key={id} onClick={() => setSkin(id)} aria-pressed={on} className={themeButtonClass(on)}>
                  <div className="h-12 relative" style={{ backgroundColor: def.swatch[0] }}>
                    <div className="w-full h-1/2" style={{ backgroundColor: def.swatch[1] }} />
                    <div className="absolute bottom-1.5 right-1.5 w-3 h-3 rounded-full" style={{ backgroundColor: def.swatch[2] }} />
                  </div>
                  <div className="bg-bg-secondary py-1.5">
                    <p className="text-xs text-label-primary text-center truncate px-1">{def.name}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-label-tertiary text-xs mt-1.5 px-1 leading-relaxed">{SKINS[skin].tagline}</p>
          {/* 以前の「みんなのテーマ」を選んだままの人への逃げ道。選択中は色がそちら優先のままなので、
              下の明るさを押せば解除される（communityThemeId を空にする）ことを明示する */}
          {isCommunityActive && (
            <p className="text-label-tertiary text-xs mt-1.5 px-1 leading-relaxed">
              以前の配色「{COMMUNITY_THEMES.find(t => t.id === settings.communityThemeId)?.name}」を使用中です。
              下の明るさを選ぶと解除され、テーマの配色に戻ります。
            </p>
          )}
        </section>

        {/* 明るさ。テーマは明暗2組の色を持つので、この選択とは独立して効く */}
        <section>
          <p className="text-label-tertiary text-xs mb-3">明るさ</p>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => updateSettings({ theme: 'system', communityThemeId: '' })} className={themeButtonClass(settings.theme === 'system' && !isCommunityActive)}>
              <div className="h-12 flex">
                <div className="flex-1 bg-[#f5f5f5]" />
                <div className="flex-1 bg-[#1a1a1a]" />
              </div>
              <div className="bg-bg-secondary py-1.5"><p className="text-xs text-label-primary text-center">システム</p></div>
            </button>
            <button onClick={() => updateSettings({ theme: 'simple', communityThemeId: '' })} className={themeButtonClass(settings.theme === 'simple' && !isCommunityActive)}>
              <div className="h-12 bg-[#f5f5f5]" />
              <div className="bg-bg-secondary py-1.5"><p className="text-xs text-label-primary text-center">ライト</p></div>
            </button>
            <button onClick={() => updateSettings({ theme: 'dark', communityThemeId: '' })} className={themeButtonClass(settings.theme === 'dark' && !isCommunityActive)}>
              <div className="h-12 bg-[#1a1a1a]" />
              <div className="bg-bg-secondary py-1.5"><p className="text-xs text-label-primary text-center">ダーク</p></div>
            </button>
          </div>
        </section>

        {/* カレンダー文字色（折りたたみ） */}
        <section>
          <button
            onClick={() => { setCalColorOpen(v => !v); setOpenCalKey(null); }}
            className="w-full flex items-center justify-between mb-2"
          >
            <p className="text-label-tertiary text-xs">カレンダー文字色</p>
            <div className="flex items-center gap-2">
              {calColorPreviewDots.length > 0 && (
                <div className="flex gap-1">
                  {calColorPreviewDots.map((c, i) => (
                    <div key={i} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                  ))}
                </div>
              )}
              <ChevronDown size={13} className="text-label-tertiary transition-transform"
                style={{ transform: calColorOpen ? 'rotate(180deg)' : undefined }} />
            </div>
          </button>

          {calColorOpen && (
            // このdivがposition:relativeの基準点。ドロップダウンはここを基準に中央配置する
            <div className="relative" ref={calColorWrapperRef}>
              <div className="flex flex-col gap-3">
                {CAL_COLOR_FIELDS.map(({ key, label, cssVar }, i) => (
                  <div key={key as string} className="flex items-center justify-between">
                    <span className="text-label-secondary text-sm">{label}</span>
                    {/* トリガーボタン */}
                    <button
                      ref={el => { calBtnRefs.current[i] = el; }}
                      onClick={() => handleCalToggle(key as string, i)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border active:opacity-70"
                      style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-primary)' }}
                    >
                      <div className="flex flex-col items-center gap-[3px]">
                        {key === 'calGridColor' ? (
                          <div className="w-5 h-5 rounded-[2px] border-[1.5px]" style={{ borderColor: `var(${cssVar})` }} />
                        ) : (
                          <>
                            <span className="text-[15px] font-bold leading-none w-5 text-center tabular-nums"
                              style={{ color: `var(${cssVar})` }}>15</span>
                            <div className="w-5 h-[2.5px] rounded-full" style={{ backgroundColor: `var(${cssVar})` }} />
                          </>
                        )}
                      </div>
                      <ChevronDown size={11} className="text-label-tertiary"
                        style={{ transform: openCalKey === key ? 'rotate(180deg)' : undefined }} />
                    </button>
                  </div>
                ))}
              </div>

              {/* ドロップダウンパレット：wrapperを基準に中央配置 */}
              {openCalKey && (() => {
                const field = CAL_COLOR_FIELDS.find(f => f.key === openCalKey);
                if (!field) return null;
                const value = settings[field.key] as string;
                const isCustom = !!(value && !PALETTE_FLAT.includes(value));
                return (
                  <div
                    className="absolute z-[300] rounded-xl shadow-2xl"
                    style={{
                      top: paletteTop,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-default)',
                      padding: 8,
                      width: 224,
                    }}
                  >
                    {/* 自動（デフォルト）*/}
                    <button
                      onClick={() => { updateSettings({ [field.key]: '' }); setOpenCalKey(null); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs mb-1.5 active:opacity-70"
                      style={{ color: 'var(--label-secondary)', backgroundColor: value === '' ? 'var(--border-subtle)' : undefined }}
                    >
                      <div className="w-4 h-4 rounded border-[1.5px] flex items-center justify-center"
                        style={{ borderColor: 'var(--border-strong)', color: 'var(--label-tertiary)', fontSize: 7 }}>自</div>
                      自動（デフォルト）
                    </button>

                    {/* 10×7 カラーグリッド */}
                    <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${PALETTE_COLS}, 1fr)` }}>
                      {PALETTE_FLAT.map((color, ci) => (
                        <button
                          key={ci}
                          onClick={() => { updateSettings({ [field.key]: color }); setOpenCalKey(null); }}
                          className="rounded-[3px] active:scale-90 transition-transform"
                          style={{ backgroundColor: color, width: 19, height: 19,
                            outline: value === color ? '2px solid var(--label-primary)' : undefined, outlineOffset: 1 }}
                          title={color}
                        />
                      ))}
                    </div>

                    <div className="my-2 h-px" style={{ backgroundColor: 'var(--border-subtle)' }} />

                    {/* その他の色 */}
                    <div className="relative">
                      <button
                        onClick={() => calCustomInputRef.current?.click()}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs active:opacity-70"
                        style={{ color: 'var(--label-secondary)' }}
                      >
                        <div className="w-4 h-4 rounded-[3px] border flex-shrink-0"
                          style={{ borderColor: 'var(--border-default)',
                            background: isCustom ? value : 'conic-gradient(red 0deg,yellow 60deg,lime 120deg,cyan 180deg,blue 240deg,magenta 300deg,red 360deg)',
                            outline: isCustom ? '2px solid var(--label-primary)' : undefined, outlineOffset: 1 }} />
                        その他の色...
                      </button>
                      <input
                        ref={calCustomInputRef}
                        type="color"
                        value={value && value.startsWith('#') ? value : '#888888'}
                        onChange={e => updateSettings({ [field.key]: e.target.value })}
                        className="absolute opacity-0 pointer-events-none"
                        style={{ width: 0, height: 0, top: 0, left: 0 }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </section>

        {/* 作品カラー */}
        {participatedWorks.length > 0 && (
          <section>
            <button
              onClick={() => { setWorkColorOpen(v => !v); setOpenWorkColorKey(null); }}
              className="w-full flex items-center justify-between mb-2"
            >
              <p className="text-label-tertiary text-xs">作品カラー</p>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {participatedWorks.slice(0, 5).map((w, i) => (
                    <div key={w.id} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: workColors[w.id] ?? WORK_COLORS[i % WORK_COLORS.length] }} />
                  ))}
                </div>
                <ChevronDown size={13} className="text-label-tertiary transition-transform"
                  style={{ transform: workColorOpen ? 'rotate(180deg)' : undefined }} />
              </div>
            </button>

            {workColorOpen && (
              <div className="relative" ref={workColorWrapperRef}>
                <div className="flex flex-col gap-3">
                  {participatedWorks.map((w, i) => {
                    const currentColor = workColors[w.id] ?? WORK_COLORS[i % WORK_COLORS.length];
                    return (
                      <div key={w.id} className="flex items-center justify-between">
                        <span className="text-label-secondary text-sm">{w.name}</span>
                        <button
                          ref={el => { workBtnRefs.current[i] = el; }}
                          onClick={() => handleWorkColorToggle(w.id, i)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border active:opacity-70"
                          style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-primary)' }}
                        >
                          <div className="w-5 h-5 rounded-full" style={{ backgroundColor: currentColor }} />
                          <ChevronDown size={11} className="text-label-tertiary"
                            style={{ transform: openWorkColorKey === w.id ? 'rotate(180deg)' : undefined }} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {openWorkColorKey && (() => {
                  const workIdx = participatedWorks.findIndex(w => w.id === openWorkColorKey);
                  const defaultColor = WORK_COLORS[workIdx % WORK_COLORS.length];
                  const value = workColors[openWorkColorKey] ?? '';
                  const isCustom = !!(value && !PALETTE_FLAT.includes(value));
                  return (
                    <div
                      className="absolute z-[300] rounded-xl shadow-2xl"
                      style={{
                        top: workColorPaletteTop,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-default)',
                        padding: 8,
                        width: 224,
                      }}
                    >
                      <button
                        onClick={() => updateWorkColor(openWorkColorKey, null)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs mb-1.5 active:opacity-70"
                        style={{ color: 'var(--label-secondary)', backgroundColor: !workColors[openWorkColorKey] ? 'var(--border-subtle)' : undefined }}
                      >
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: defaultColor }} />
                        デフォルト（{defaultColor}）
                      </button>
                      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${PALETTE_COLS}, 1fr)` }}>
                        {PALETTE_FLAT.map((color, ci) => (
                          <button
                            key={ci}
                            onClick={() => updateWorkColor(openWorkColorKey, color)}
                            className="rounded-[3px] active:scale-90 transition-transform"
                            style={{ backgroundColor: color, width: 19, height: 19,
                              outline: value === color ? '2px solid var(--label-primary)' : undefined, outlineOffset: 1 }}
                            title={color}
                          />
                        ))}
                      </div>
                      <div className="my-2 h-px" style={{ backgroundColor: 'var(--border-subtle)' }} />
                      <div className="relative">
                        <button
                          onClick={() => workCustomInputRef.current?.click()}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs active:opacity-70"
                          style={{ color: 'var(--label-secondary)' }}
                        >
                          <div className="w-4 h-4 rounded-[3px] border flex-shrink-0"
                            style={{ borderColor: 'var(--border-default)',
                              background: isCustom ? value : 'conic-gradient(red 0deg,yellow 60deg,lime 120deg,cyan 180deg,blue 240deg,magenta 300deg,red 360deg)',
                              outline: isCustom ? '2px solid var(--label-primary)' : undefined, outlineOffset: 1 }} />
                          その他の色...
                        </button>
                        <input
                          ref={workCustomInputRef}
                          type="color"
                          value={(value && value.startsWith('#')) ? value : '#888888'}
                          onChange={e => {
                            const updated = { ...workColors, [openWorkColorKey]: e.target.value };
                            setWorkColors(updated);
                            localStorage.setItem('fan_work_colors', JSON.stringify(updated));
                            pushAppState('work_colors', updated);
                          }}
                          className="absolute opacity-0 pointer-events-none"
                          style={{ width: 0, height: 0, top: 0, left: 0 }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </section>
        )}

        {/* 背景画像 */}
        <section>
          <p className="text-label-tertiary text-xs mb-3">カレンダー背景画像</p>
          {!hasNativePhotoPicker() && (
            <input ref={bgInputRef} type="file" accept="image/*" onChange={handleBgUpload} className="hidden" />
          )}
          {settings.backgroundImageUrl ? (
            <div className="flex gap-3 items-start">
              {/* サムネイルプレビュー */}
              <button
                onClick={() => { setPendingImageUrl(settings.backgroundImageUrl); setShowCropModal(true); }}
                className="relative flex-shrink-0 rounded-xl overflow-hidden active:opacity-70"
                style={{ width: 80, height: 68 }}
              >
                <div
                  className="w-full h-full"
                  style={{
                    backgroundImage: `url(${settings.backgroundImageUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: `${settings.bgImageOffsetX ?? 50}% ${settings.bgImageOffsetY ?? 50}%`,
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                  <span className="text-white text-[9px] font-medium">位置を調整</span>
                </div>
              </button>
              <div className="flex-1 flex flex-col gap-2 pt-1">
                <button onClick={() => void openBgPicker()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-subtle text-label-secondary text-sm active:opacity-60">
                  <Upload size={13} />画像を変更
                </button>
                <button onClick={() => updateSettings({ backgroundImageUrl: '', bgImageOffsetX: 50, bgImageOffsetY: 50 })}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-subtle text-label-tertiary text-sm active:opacity-60">
                  削除
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => void openBgPicker()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-subtle text-label-secondary text-sm active:opacity-60">
              <Upload size={14} />画像をアップロード
            </button>
          )}
        </section>

      </div>

      {showCropModal && pendingImageUrl && (
        <BgImageCropModal
          imageUrl={pendingImageUrl}
          initialOffsetX={settings.bgImageOffsetX ?? 50}
          initialOffsetY={settings.bgImageOffsetY ?? 50}
          onConfirm={(ox, oy) => {
            updateSettings({ backgroundImageUrl: pendingImageUrl, bgImageOffsetX: ox, bgImageOffsetY: oy });
            setShowCropModal(false);
            setPendingImageUrl('');
          }}
          onCancel={() => { setShowCropModal(false); setPendingImageUrl(''); }}
        />
      )}
    </Layout>
  );
}
