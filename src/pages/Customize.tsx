import { useRef, useState, useEffect } from 'react';
import { Upload, Share2, Users, X, Check, Loader, Trash2, ChevronDown } from 'lucide-react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import SettingsMenuButton from '../components/SettingsMenuButton';
import { useTheme, COMMUNITY_THEMES, type FontFamily, type UserSettings } from '../contexts/ThemeContext';
import { listSharedThemes, shareTheme, incrementThemeUseCount, deleteSharedTheme, type SharedTheme, type SharedThemeData } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const FONT_OPTIONS: { value: FontFamily; label: string; stack: string }[] = [
  { value: 'system',  label: 'システム標準', stack: SYSTEM_FONT },
  { value: 'serif',   label: '明朝体',      stack: '"Hiragino Mincho ProN", "Yu Mincho", serif' },
  { value: 'rounded', label: '丸ゴシック',  stack: '"Hiragino Maru Gothic ProN", "M PLUS Rounded 1c", sans-serif' },
];

const CAL_COLOR_FIELDS: { key: keyof UserSettings; label: string; cssVar: string }[] = [
  { key: 'calWeekday',    label: '平日',        cssVar: '--cal-weekday-color' },
  { key: 'calSaturday',   label: '土曜日',      cssVar: '--cal-saturday-color' },
  { key: 'calSunday',     label: '日曜日',      cssVar: '--cal-sunday-color' },
  { key: 'calOtherMonth', label: '前後月の日付', cssVar: '--cal-other-month-color' },
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

function formatCount(n: number): string {
  return n.toLocaleString('ja-JP');
}

// ─── コミュニティテーマ モーダル ──────────────────────────────────

type Tab = 'preset' | 'shared';

function CommunityThemeModal({
  currentId, onSelect, onApplyShared, onClose, userId, currentSettings, canShare,
}: {
  currentId: string;
  onSelect: (id: string) => void;
  onApplyShared: (td: SharedThemeData) => void;
  onClose: () => void;
  userId: string | undefined;
  currentSettings: Pick<UserSettings, 'theme' | 'font' | 'accentColor' | 'communityThemeId' | 'calWeekday' | 'calSaturday' | 'calSunday' | 'calOtherMonth'>;
  canShare: boolean;
}) {
  const [tab, setTab] = useState<Tab>('preset');
  const [sharedThemes, setSharedThemes] = useState<SharedTheme[]>([]);
  const [loadingShared, setLoadingShared] = useState(false);
  const [shareName, setShareName] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  useEffect(() => {
    if (tab !== 'shared') return;
    setLoadingShared(true);
    listSharedThemes().then(setSharedThemes).finally(() => setLoadingShared(false));
  }, [tab]);

  const handleApplyShared = async (theme: SharedTheme) => {
    onApplyShared(theme.themeData);
    await incrementThemeUseCount(theme.id);
    onClose();
  };

  const handleDeleteShared = async (themeId: string) => {
    if (!window.confirm('このテーマを削除しますか？')) return;
    try {
      await deleteSharedTheme(themeId);
      setSharedThemes(prev => prev.filter(t => t.id !== themeId));
    } catch {
      alert('削除できませんでした。SupabaseのSQLエディタで以下を実行してください:\n\nDROP POLICY IF EXISTS "delete own shared_themes" ON shared_themes;\nCREATE POLICY "delete any shared_themes"\nON shared_themes FOR DELETE TO authenticated\nUSING (true);');
    }
  };

  const handleShare = async () => {
    if (!userId || !shareName.trim() || !canShare) return;
    setSharing(true);
    try {
      await shareTheme(userId, shareName.trim(), {
        theme: currentSettings.theme,
        font: currentSettings.font,
        accentColor: currentSettings.accentColor,
        communityThemeId: currentSettings.communityThemeId,
        calWeekday: currentSettings.calWeekday,
        calSaturday: currentSettings.calSaturday,
        calSunday: currentSettings.calSunday,
        calOtherMonth: currentSettings.calOtherMonth,
      });
      setShareSuccess(true);
      setShareName('');
      listSharedThemes().then(setSharedThemes);
    } catch { /* silent */ }
    finally { setSharing(false); }
  };

  const getPreviewColors = (td: SharedThemeData) => {
    if (td.communityThemeId) {
      const ct = COMMUNITY_THEMES.find(c => c.id === td.communityThemeId);
      if (ct) return { bg: ct.vars['--bg-primary'], bg2: ct.vars['--bg-secondary'], accent: td.accentColor };
    }
    return td.theme === 'dark'
      ? { bg: '#1a1a1a', bg2: '#2a2a2a', accent: td.accentColor }
      : { bg: '#f5f5f5', bg2: '#e8e8e8', accent: td.accentColor };
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="mt-auto rounded-t-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-subtle">
          <p className="text-label-primary font-semibold text-base">みんなのテーマ</p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-label-tertiary active:opacity-60" style={{ backgroundColor: 'var(--border-subtle)' }}>
            <X size={14} />
          </button>
        </div>
        <div className="flex px-4 pt-3 gap-1">
          {(['preset', 'shared'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${tab === t ? 'bg-label-primary text-bg-primary' : 'text-label-secondary'}`}>
              {t === 'preset' ? 'プリセット' : 'みんなの共有'}
            </button>
          ))}
        </div>
        <div className="px-4 py-3 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: '48vh' }}>
          {tab === 'preset' ? (
            COMMUNITY_THEMES.map(theme => {
              const selected = currentId === theme.id;
              return (
                <button key={theme.id} onClick={() => { onSelect(theme.id); onClose(); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border text-left active:opacity-70"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: selected ? 'var(--border-selected)' : 'var(--border-faint)' }}>
                  <div className="w-10 h-10 rounded-lg flex-shrink-0 overflow-hidden" style={{ backgroundColor: theme.vars['--bg-primary'] }}>
                    <div className="w-full h-1/2" style={{ backgroundColor: theme.vars['--bg-secondary'] }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-label-primary text-sm font-medium">{theme.name}</p>
                    <p className="text-label-tertiary text-xs mt-0.5">{formatCount(theme.useCount)}人が使用中</p>
                  </div>
                  {selected && <Check size={16} className="text-label-secondary flex-shrink-0" />}
                </button>
              );
            })
          ) : loadingShared ? (
            <div className="flex justify-center py-8"><Loader size={18} className="text-label-tertiary animate-spin" /></div>
          ) : sharedThemes.length === 0 ? (
            <p className="text-center text-label-tertiary text-sm py-8">まだ共有されたテーマがありません</p>
          ) : (
            sharedThemes.map(theme => {
              const colors = getPreviewColors(theme.themeData);
              return (
                <div key={theme.id} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-faint)' }}>
                  <button onClick={() => handleApplyShared(theme)} className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-70">
                    <div className="w-10 h-10 rounded-lg flex-shrink-0 overflow-hidden relative" style={{ backgroundColor: colors.bg }}>
                      <div className="w-full h-1/2" style={{ backgroundColor: colors.bg2 }} />
                      <div className="absolute bottom-1 right-1 w-3 h-3 rounded-full" style={{ backgroundColor: colors.accent }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-label-primary text-sm font-medium">{theme.name}</p>
                      <p className="text-label-tertiary text-xs mt-0.5">{formatCount(theme.useCount)}人が使用中</p>
                    </div>
                  </button>
                  <button onClick={() => handleDeleteShared(theme.id)}
                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-label-tertiary active:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="px-4 pt-2 pb-2 border-t border-subtle">
          {shareSuccess ? (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-label-secondary">
              <Check size={14} />共有しました
            </div>
          ) : canShare ? (
            <div className="flex gap-2">
              <input type="text" value={shareName} onChange={e => setShareName(e.target.value)}
                placeholder="テーマ名を入力して共有"
                className="flex-1 bg-bg-secondary rounded-lg px-3 py-2 text-sm text-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong" />
              <button onClick={handleShare} disabled={!shareName.trim() || sharing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-label-primary text-bg-primary text-sm font-medium disabled:opacity-30 active:opacity-70">
                {sharing ? <Loader size={13} className="animate-spin" /> : <Share2 size={13} />}
                共有
              </button>
            </div>
          ) : (
            <p className="text-center text-label-tertiary text-xs py-3">
              独自フォントと背景画像の両方を設定すると共有できます
            </p>
          )}
        </div>
        <div className="pb-4" />
      </div>
    </div>
  );
}

// ─── メイン画面 ────────────────────────────────────────────────────

export default function Customize() {
  const { settings, updateSettings, currentWorkId } = useTheme();
  const { user } = useAuth();
  const currentWorkName = localStorage.getItem('last_calendar_work_name') ?? '';
  const fontInputRef     = useRef<HTMLInputElement>(null);
  const bgInputRef       = useRef<HTMLInputElement>(null);
  const calColorWrapperRef  = useRef<HTMLDivElement>(null);
  const calBtnRefs       = useRef<(HTMLButtonElement | null)[]>([null, null, null, null]);
  const calCustomInputRef = useRef<HTMLInputElement>(null);

  const [showCommunityModal, setShowCommunityModal] = useState(false);
  const [calColorOpen, setCalColorOpen]   = useState(false);
  const [openCalKey, setOpenCalKey]       = useState<string | null>(null);
  const [paletteTop, setPaletteTop]       = useState(0);

  // パレット外クリックで閉じる
  useEffect(() => {
    if (!openCalKey) return;
    const handler = (e: MouseEvent) => {
      if (!calColorWrapperRef.current?.contains(e.target as Node)) setOpenCalKey(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openCalKey]);

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

  const handleFontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    updateSettings({ font: 'custom', customFontUrl: URL.createObjectURL(file), customFontName: file.name.replace(/\.[^.]+$/, '') });
  };

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => updateSettings({ backgroundImageUrl: ev.target?.result as string });
    reader.readAsDataURL(file);
  };

  const handleApplyShared = (td: SharedThemeData) => {
    updateSettings({
      communityThemeId: td.communityThemeId ?? '',
      theme: td.theme as UserSettings['theme'],
      font: td.font as FontFamily,
      accentColor: td.accentColor,
      calWeekday: td.calWeekday ?? '',
      calSaturday: td.calSaturday ?? '',
      calSunday: td.calSunday ?? '',
      calOtherMonth: td.calOtherMonth ?? '',
    });
  };

  const canShare = !!(settings.customFontUrl && settings.backgroundImageUrl);
  const isCommunityActive = !!settings.communityThemeId;
  const themeButtonClass = (active: boolean) =>
    `rounded-xl overflow-hidden border-2 transition-colors ${active ? 'border-selected' : 'border-subtle'}`;

  const fontCards = [
    ...FONT_OPTIONS,
    ...(settings.customFontName
      ? [{ value: 'custom' as FontFamily, label: settings.customFontName, stack: `"${settings.customFontName}", sans-serif` }]
      : []),
  ];

  const calColorPreviewDots = CAL_COLOR_FIELDS.map(f => settings[f.key] as string).filter(Boolean);

  return (
    <Layout>
      <Header
        title="カスタマイズ"
        subtitle={currentWorkId && currentWorkName ? `「${currentWorkName}」の設定` : undefined}
        rightAction={<SettingsMenuButton />}
      />

      <div className="px-4 pt-4 pb-8 flex flex-col gap-6">

        {/* テーマ */}
        <section>
          <p className="text-label-tertiary text-xs mb-3">テーマ</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => updateSettings({ theme: 'simple', communityThemeId: '' })} className={themeButtonClass(settings.theme === 'simple' && !isCommunityActive)}>
              <div className="h-12 bg-[#f5f5f5]" />
              <div className="bg-bg-secondary py-1.5"><p className="text-xs text-label-primary text-center">シンプル</p></div>
            </button>
            <button onClick={() => updateSettings({ theme: 'dark', communityThemeId: '' })} className={themeButtonClass(settings.theme === 'dark' && !isCommunityActive)}>
              <div className="h-12 bg-[#1a1a1a]" />
              <div className="bg-bg-secondary py-1.5"><p className="text-xs text-label-primary text-center">ダーク</p></div>
            </button>
            <button className="rounded-xl overflow-hidden border-2 border-subtle opacity-40" disabled>
              <div className="h-12" style={{ backgroundImage: 'repeating-linear-gradient(45deg,#333 0,#333 4px,#444 4px,#444 8px)' }} />
              <div className="bg-bg-secondary py-1.5"><p className="text-xs text-label-tertiary text-center">作品公式</p></div>
            </button>
            <button onClick={() => setShowCommunityModal(true)} className={themeButtonClass(isCommunityActive)}>
              <div className="h-12 bg-bg-secondary flex items-center justify-center"><Users size={20} className="text-label-tertiary" /></div>
              <div className="bg-bg-secondary py-1.5 border-t border-subtle"><p className="text-xs text-label-secondary text-center">みんなのテーマ</p></div>
            </button>
          </div>
          {isCommunityActive && (
            <p className="text-label-tertiary text-xs mt-1.5 px-1">
              適用中: {COMMUNITY_THEMES.find(t => t.id === settings.communityThemeId)?.name}
            </p>
          )}
        </section>

        {/* フォント */}
        <section>
          <p className="text-label-tertiary text-xs mb-3">フォント</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
            {fontCards.map(f => {
              const active = settings.font === f.value;
              return (
                <button key={f.value} onClick={() => updateSettings({ font: f.value })}
                  className={`flex-shrink-0 w-20 rounded-xl overflow-hidden flex flex-col border-2 transition-colors ${active ? 'border-selected' : 'border-subtle'}`}>
                  <div className="h-16 flex flex-col items-center justify-center bg-bg-secondary" style={{ fontFamily: f.stack }}>
                    <span className="text-label-primary text-sm leading-tight">1月23日</span>
                    <span className="text-label-tertiary text-xs leading-tight mt-1">12:34</span>
                  </div>
                  <div className="flex items-center justify-center gap-1 py-1.5 px-1 border-t border-faint bg-bg-secondary" style={{ fontFamily: SYSTEM_FONT }}>
                    {active && <Check size={9} className="text-label-primary flex-shrink-0" />}
                    <p className="text-[10px] text-label-secondary truncate leading-tight">{f.label}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <input ref={fontInputRef} type="file" accept=".ttf,.otf,.woff,.woff2" onChange={handleFontUpload} className="hidden" />
          <button onClick={() => fontInputRef.current?.click()}
            className="mt-2 w-full py-3 rounded-xl border border-subtle text-label-secondary active:opacity-60 overflow-hidden"
            style={{ fontFamily: SYSTEM_FONT }}>
            <div className="flex items-center justify-center gap-1.5 px-4">
              <Upload size={13} className="flex-shrink-0" />
              <span style={{ fontSize: '14px', lineHeight: '1.4' }}>フォントをアップロード</span>
            </div>
            <div className="mt-0.5" style={{ fontSize: '11px', color: 'var(--label-tertiary)', fontFamily: SYSTEM_FONT }}>.ttf / .otf / .woff</div>
          </button>
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
                        <span className="text-[15px] font-bold leading-none w-5 text-center tabular-nums"
                          style={{ color: `var(${cssVar})` }}>15</span>
                        <div className="w-5 h-[2.5px] rounded-full" style={{ backgroundColor: `var(${cssVar})` }} />
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

        {/* 背景画像 */}
        <section>
          <p className="text-label-tertiary text-xs mb-3">背景画像</p>
          <input ref={bgInputRef} type="file" accept="image/*" onChange={handleBgUpload} className="hidden" />
          <button onClick={() => bgInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-subtle text-label-secondary text-sm active:opacity-60">
            <Upload size={14} />画像をアップロード
          </button>
          {settings.backgroundImageUrl && (
            <div className="mt-2 flex items-center justify-between px-1">
              <p className="text-label-tertiary text-xs">背景画像 設定済み</p>
              <button onClick={() => updateSettings({ backgroundImageUrl: '' })} className="text-label-tertiary text-xs underline active:opacity-60">削除</button>
            </div>
          )}
        </section>

      </div>

      {showCommunityModal && (
        <CommunityThemeModal
          currentId={settings.communityThemeId}
          onSelect={id => updateSettings({ communityThemeId: id, theme: settings.theme })}
          onApplyShared={handleApplyShared}
          onClose={() => setShowCommunityModal(false)}
          userId={user?.id}
          currentSettings={{
            theme: settings.theme, font: settings.font, accentColor: settings.accentColor,
            communityThemeId: settings.communityThemeId,
            calWeekday: settings.calWeekday, calSaturday: settings.calSaturday,
            calSunday: settings.calSunday, calOtherMonth: settings.calOtherMonth,
          }}
          canShare={canShare}
        />
      )}
    </Layout>
  );
}
