import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getUserSettings, updateUserSettings } from '../lib/api';
import { accentTokens } from '../lib/color';
import { syncStatusBar } from '../lib/statusbar';

export type ThemeMode = 'simple' | 'dark' | 'system';
export type FontFamily = 'system' | 'serif' | 'rounded' | 'custom';

/** 'system' を OS 設定に基づいて 'simple' | 'dark' に解決する */
export function resolveTheme(mode: ThemeMode): 'simple' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'simple' : 'dark';
}

export interface CommunityTheme {
  id: string;
  name: string;
  useCount: number;
  dark: boolean;
  vars: Record<string, string>;
}

export const COMMUNITY_THEMES: CommunityTheme[] = [
  {
    id: 'sakura',
    name: 'さくらピンク',
    useCount: 482,
    dark: false,
    vars: {
      '--bg-primary': '#fff0f3', '--bg-secondary': '#ffd6e0', '--bg-tertiary': '#fec9d5',
      '--label-primary': '#2a1a1f', '--label-secondary': '#7a4a56', '--label-tertiary': '#b07a88',
      '--border-faint': 'rgba(180,80,100,0.05)', '--border-subtle': 'rgba(180,80,100,0.08)',
      '--border-default': 'rgba(180,80,100,0.15)', '--border-strong': 'rgba(180,80,100,0.30)',
      '--border-selected': 'rgba(180,80,100,0.70)',
      '--separator': 'rgba(180,80,100,0.29)',
      '--fill-primary': 'rgba(180,80,100,0.2)', '--fill-secondary': 'rgba(180,80,100,0.16)',
      '--fill-tertiary': 'rgba(180,80,100,0.12)', '--fill-quaternary': 'rgba(180,80,100,0.08)',
      '--input-text': '#2a1a1f', '--input-placeholder': 'rgba(42,26,31,0.35)', '--input-caret': '#2a1a1f',
      '--color-destructive': '#ff3b30', '--color-success': '#34c759', '--color-warning': '#ff9500',
    },
  },
  {
    id: 'midnight',
    name: 'ミッドナイト',
    useCount: 891,
    dark: true,
    vars: {
      '--bg-primary': '#080c14', '--bg-secondary': '#111827', '--bg-tertiary': '#1a2535',
      '--label-primary': '#c8d8f0', '--label-secondary': '#7890b0', '--label-tertiary': '#4a5a70',
      '--border-faint': 'rgba(100,150,220,0.05)', '--border-subtle': 'rgba(100,150,220,0.08)',
      '--border-default': 'rgba(100,150,220,0.15)', '--border-strong': 'rgba(100,150,220,0.30)',
      '--border-selected': 'rgba(100,150,220,0.70)',
      '--separator': 'rgba(100,150,220,0.29)',
      '--fill-primary': 'rgba(100,150,220,0.2)', '--fill-secondary': 'rgba(100,150,220,0.16)',
      '--fill-tertiary': 'rgba(100,150,220,0.12)', '--fill-quaternary': 'rgba(100,150,220,0.08)',
      '--input-text': '#c8d8f0', '--input-placeholder': 'rgba(200,216,240,0.30)', '--input-caret': '#c8d8f0',
      '--color-destructive': '#ff453a', '--color-success': '#30d158', '--color-warning': '#ffd60a',
    },
  },
  {
    id: 'matcha',
    name: '抹茶グリーン',
    useCount: 256,
    dark: true,
    vars: {
      '--bg-primary': '#1a2614', '--bg-secondary': '#263520', '--bg-tertiary': '#344a28',
      '--label-primary': '#c8e8b0', '--label-secondary': '#7aaa60', '--label-tertiary': '#4a7040',
      '--border-faint': 'rgba(100,180,80,0.05)', '--border-subtle': 'rgba(100,180,80,0.08)',
      '--border-default': 'rgba(100,180,80,0.15)', '--border-strong': 'rgba(100,180,80,0.30)',
      '--border-selected': 'rgba(100,180,80,0.70)',
      '--separator': 'rgba(100,180,80,0.29)',
      '--fill-primary': 'rgba(100,180,80,0.2)', '--fill-secondary': 'rgba(100,180,80,0.16)',
      '--fill-tertiary': 'rgba(100,180,80,0.12)', '--fill-quaternary': 'rgba(100,180,80,0.08)',
      '--input-text': '#c8e8b0', '--input-placeholder': 'rgba(200,232,176,0.30)', '--input-caret': '#c8e8b0',
      '--color-destructive': '#ff453a', '--color-success': '#30d158', '--color-warning': '#ffd60a',
    },
  },
  {
    id: 'ivory',
    name: 'アイボリー',
    useCount: 203,
    dark: false,
    vars: {
      '--bg-primary': '#faf8f2', '--bg-secondary': '#f0ece0', '--bg-tertiary': '#e6e0cc',
      '--label-primary': '#2c2820', '--label-secondary': '#6a6050', '--label-tertiary': '#9a9080',
      '--border-faint': 'rgba(80,60,40,0.05)', '--border-subtle': 'rgba(80,60,40,0.08)',
      '--border-default': 'rgba(80,60,40,0.15)', '--border-strong': 'rgba(80,60,40,0.30)',
      '--border-selected': 'rgba(80,60,40,0.70)',
      '--separator': 'rgba(80,60,40,0.29)',
      '--fill-primary': 'rgba(80,60,40,0.2)', '--fill-secondary': 'rgba(80,60,40,0.16)',
      '--fill-tertiary': 'rgba(80,60,40,0.12)', '--fill-quaternary': 'rgba(80,60,40,0.08)',
      '--input-text': '#2c2820', '--input-placeholder': 'rgba(44,40,32,0.35)', '--input-caret': '#2c2820',
      '--color-destructive': '#ff3b30', '--color-success': '#34c759', '--color-warning': '#ff9500',
    },
  },
  {
    id: 'mahou',
    name: '魔法少女の夢',
    useCount: 743,
    dark: true,
    vars: {
      '--bg-primary': '#1a0d2e', '--bg-secondary': '#2d1448', '--bg-tertiary': '#401a60',
      '--label-primary': '#f0c0f8', '--label-secondary': '#b080c8', '--label-tertiary': '#6840a0',
      '--border-faint': 'rgba(200,100,240,0.05)', '--border-subtle': 'rgba(200,100,240,0.08)',
      '--border-default': 'rgba(200,100,240,0.15)', '--border-strong': 'rgba(200,100,240,0.30)',
      '--border-selected': 'rgba(200,100,240,0.70)',
      '--separator': 'rgba(200,100,240,0.29)',
      '--fill-primary': 'rgba(200,100,240,0.2)', '--fill-secondary': 'rgba(200,100,240,0.16)',
      '--fill-tertiary': 'rgba(200,100,240,0.12)', '--fill-quaternary': 'rgba(200,100,240,0.08)',
      '--input-text': '#f0c0f8', '--input-placeholder': 'rgba(240,192,248,0.30)', '--input-caret': '#f0c0f8',
      '--color-destructive': '#ff453a', '--color-success': '#30d158', '--color-warning': '#ffd60a',
    },
  },
  {
    id: 'neon',
    name: 'ネオン街',
    useCount: 1204,
    dark: true,
    vars: {
      '--bg-primary': '#0a0a12', '--bg-secondary': '#12121e', '--bg-tertiary': '#1a1a2e',
      '--label-primary': '#d0e8ff', '--label-secondary': '#5080b0', '--label-tertiary': '#304060',
      '--border-faint': 'rgba(80,160,255,0.05)', '--border-subtle': 'rgba(80,160,255,0.08)',
      '--border-default': 'rgba(80,160,255,0.15)', '--border-strong': 'rgba(80,160,255,0.30)',
      '--border-selected': 'rgba(80,160,255,0.70)',
      '--separator': 'rgba(80,160,255,0.29)',
      '--fill-primary': 'rgba(80,160,255,0.2)', '--fill-secondary': 'rgba(80,160,255,0.16)',
      '--fill-tertiary': 'rgba(80,160,255,0.12)', '--fill-quaternary': 'rgba(80,160,255,0.08)',
      '--input-text': '#d0e8ff', '--input-placeholder': 'rgba(208,232,255,0.25)', '--input-caret': '#d0e8ff',
      '--color-destructive': '#ff453a', '--color-success': '#30d158', '--color-warning': '#ffd60a',
    },
  },
  {
    id: 'autumn',
    name: '秋の情景',
    useCount: 389,
    dark: true,
    vars: {
      '--bg-primary': '#1e1208', '--bg-secondary': '#2e1c0c', '--bg-tertiary': '#3e2610',
      '--label-primary': '#f8e0b0', '--label-secondary': '#c09060', '--label-tertiary': '#806040',
      '--border-faint': 'rgba(220,140,40,0.05)', '--border-subtle': 'rgba(220,140,40,0.08)',
      '--border-default': 'rgba(220,140,40,0.15)', '--border-strong': 'rgba(220,140,40,0.30)',
      '--border-selected': 'rgba(220,140,40,0.70)',
      '--separator': 'rgba(220,140,40,0.29)',
      '--fill-primary': 'rgba(220,140,40,0.2)', '--fill-secondary': 'rgba(220,140,40,0.16)',
      '--fill-tertiary': 'rgba(220,140,40,0.12)', '--fill-quaternary': 'rgba(220,140,40,0.08)',
      '--input-text': '#f8e0b0', '--input-placeholder': 'rgba(248,224,176,0.30)', '--input-caret': '#f8e0b0',
      '--color-destructive': '#ff453a', '--color-success': '#30d158', '--color-warning': '#ffd60a',
    },
  },
];

export interface UserSettings {
  theme: ThemeMode;
  font: FontFamily;
  accentColor: string;
  backgroundImageUrl: string;
  bgImageOffsetX: number;
  bgImageOffsetY: number;
  customFontUrl: string;
  customFontName: string;
  communityThemeId: string;
  calWeekday: string;
  calSaturday: string;
  calSunday: string;
  calOtherMonth: string;
  calGridColor: string;
}

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  font: 'system',
  accentColor: '#FBBF00',
  backgroundImageUrl: '',
  bgImageOffsetX: 50,
  bgImageOffsetY: 50,
  customFontUrl: '',
  customFontName: '',
  communityThemeId: '',
  calWeekday: '',
  calSaturday: '',
  calSunday: '',
  calOtherMonth: '',
  calGridColor: '',
};

const ACCENT_COLORS = ['#2C2C2A', '#888780', '#D85A30', '#1D9E75', '#378ADD', '#D4537E'] as const;
export { ACCENT_COLORS };

export const THEME_VARS: Record<'simple' | 'dark', Record<string, string>> = {
  dark: {
    '--bg-primary':        '#0e0e10',
    '--bg-secondary':      '#1c1c1e',
    '--bg-tertiary':       '#2c2c2e',
    '--label-primary':     '#ffffff',
    '--label-secondary':   'rgba(235,235,245,0.6)',
    '--label-tertiary':    'rgba(235,235,245,0.3)',
    '--border-faint':      'rgba(255,255,255,0.05)',
    '--border-subtle':     'rgba(255,255,255,0.08)',
    '--border-default':    'rgba(255,255,255,0.15)',
    '--border-strong':     'rgba(255,255,255,0.30)',
    '--border-selected':   'rgba(255,255,255,0.60)',
    '--separator':         'rgba(84,84,88,0.65)',
    '--fill-primary':      'rgba(120,120,128,0.36)',
    '--fill-secondary':    'rgba(120,120,128,0.32)',
    '--fill-tertiary':     'rgba(118,118,128,0.24)',
    '--fill-quaternary':   'rgba(118,118,128,0.18)',
    '--input-text':        '#ffffff',
    '--input-placeholder': 'rgba(255,255,255,0.25)',
    '--input-caret':       '#ffffff',
    '--color-destructive': '#ff453a',
    '--color-success':     '#30d158',
    '--color-warning':     '#ffd60a',
  },
  simple: {
    '--bg-primary':        '#f2f2f7',
    '--bg-secondary':      '#ffffff',
    '--bg-tertiary':       '#e5e5ea',
    '--label-primary':     '#000000',
    '--label-secondary':   'rgba(60,60,67,0.6)',
    '--label-tertiary':    'rgba(60,60,67,0.3)',
    '--border-faint':      'rgba(0,0,0,0.05)',
    '--border-subtle':     'rgba(0,0,0,0.08)',
    '--border-default':    'rgba(0,0,0,0.15)',
    '--border-strong':     'rgba(0,0,0,0.30)',
    '--border-selected':   'rgba(0,0,0,0.60)',
    '--separator':         'rgba(60,60,67,0.29)',
    '--fill-primary':      'rgba(120,120,128,0.2)',
    '--fill-secondary':    'rgba(120,120,128,0.16)',
    '--fill-tertiary':     'rgba(118,118,128,0.12)',
    '--fill-quaternary':   'rgba(118,118,128,0.08)',
    '--input-text':        '#000000',
    '--input-placeholder': 'rgba(0,0,0,0.30)',
    '--input-caret':       '#000000',
    '--color-destructive': '#ff3b30',
    '--color-success':     '#34c759',
    '--color-warning':     '#ff9500',
  },
};

// カレンダーごとのストレージキー（workId='' はグローバルデフォルト）
function storageKey(workId: string): string {
  return workId ? `cal_settings_${workId}` : 'user_settings';
}

function loadSettings(workId: string): UserSettings {
  try {
    const raw = localStorage.getItem(storageKey(workId));
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<UserSettings> };
    // 未設定カレンダーはグローバルデフォルトを引き継ぐ
    if (workId) {
      const globalRaw = localStorage.getItem('user_settings');
      if (globalRaw) return { ...DEFAULT_SETTINGS, ...JSON.parse(globalRaw) as Partial<UserSettings> };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(workId: string, s: UserSettings) {
  localStorage.setItem(storageKey(workId), JSON.stringify(s));
}

// ウィジェットページなど ThemeProvider 外で使用するユーティリティ
export function loadCalendarSettings(workId: string): UserSettings {
  return loadSettings(workId);
}

// カレンダーのフォントスタックを返す
function fontStack(settings: UserSettings): string {
  if (settings.font === 'serif') return '"Hiragino Mincho ProN", "Yu Mincho", serif';
  if (settings.font === 'rounded') return '"Hiragino Maru Gothic ProN", "M PLUS Rounded 1c", sans-serif';
  if (settings.font === 'custom' && settings.customFontName) return `"${settings.customFontName}", sans-serif`;
  return '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
}

// テーマ変数の適用 + data-theme / theme-color / ステータスバー同期（共通処理）
function applyThemeVars(settings: UserSettings) {
  const root = document.documentElement;
  const communityTheme = settings.communityThemeId
    ? COMMUNITY_THEMES.find(t => t.id === settings.communityThemeId)
    : null;
  const resolved = resolveTheme(settings.theme);
  const vars = communityTheme ? communityTheme.vars : THEME_VARS[resolved];
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

  const isDark = communityTheme ? communityTheme.dark : resolved === 'dark';
  root.dataset.theme = isDark ? 'dark' : 'light';

  // ブラウザクローム・ネイティブステータスバーをテーマに追従させる
  const bgPrimary = vars['--bg-primary'] ?? (isDark ? '#0e0e10' : '#f2f2f7');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bgPrimary);
  syncStatusBar(isDark, bgPrimary);
}

// アクセントカラー + 派生トークンの適用（共通処理）
function applyAccentVars(accentColor: string) {
  const root = document.documentElement;
  root.style.setProperty('--accent-color', accentColor);
  const { on, textDark, textLight } = accentTokens(accentColor);
  root.style.setProperty('--accent-on', on);
  root.style.setProperty('--accent-text-dark', textDark);
  root.style.setProperty('--accent-text-light', textLight);
}

// ウィジェットページが設定をCSSに反映するためのユーティリティ
export function applySettingsToCSS(settings: UserSettings) {
  const root = document.documentElement;

  // テーマカラー
  applyThemeVars(settings);

  // アクセントカラー
  applyAccentVars(settings.accentColor);

  // 背景画像
  if (settings.backgroundImageUrl) {
    root.style.setProperty('--bg-image', `url(${settings.backgroundImageUrl})`);
  } else {
    root.style.removeProperty('--bg-image');
  }

  // フォント（CSS変数のみ。body全体には適用しない）
  root.style.setProperty('--font-family', fontStack(settings));

  // カスタムフォントの @font-face 登録
  if (settings.font === 'custom' && settings.customFontUrl && settings.customFontName) {
    const existing = document.getElementById('custom-font-style');
    if (existing) existing.remove();
    const style = document.createElement('style');
    style.id = 'custom-font-style';
    style.textContent = `@font-face { font-family: "${settings.customFontName}"; src: url("${settings.customFontUrl}"); }`;
    document.head.appendChild(style);
  }

  // カレンダー文字色
  const calVars: [string, string][] = [
    ['--cal-weekday-color',    settings.calWeekday],
    ['--cal-saturday-color',   settings.calSaturday],
    ['--cal-sunday-color',     settings.calSunday],
    ['--cal-other-month-color', settings.calOtherMonth],
  ];
  for (const [varName, value] of calVars) {
    if (value) root.style.setProperty(varName, value);
    else root.style.removeProperty(varName);
  }

  // グリッド線の色（常に設定 → フォールバック色を保証）
  root.style.setProperty('--cal-grid-color', settings.calGridColor || 'rgba(128,128,128,0.15)');
}

interface ThemeContextValue {
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => void;
  currentWorkId: string;
  setCurrentCalendar: (workId: string) => void;
  calFontFamily: string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // 起動時に最後に開いていたカレンダーの設定を読み込む
  const [currentWorkId, setCurrentWorkId] = useState<string>(() =>
    localStorage.getItem('last_calendar_workId') ?? ''
  );
  const currentWorkIdRef = useRef(currentWorkId);

  const [settings, setSettings] = useState<UserSettings>(() =>
    loadSettings(localStorage.getItem('last_calendar_workId') ?? '')
  );

  // カレンダー切り替え（Calendar ページから呼ばれる）
  const setCurrentCalendar = useCallback((workId: string) => {
    if (workId === currentWorkIdRef.current) return;
    currentWorkIdRef.current = workId;
    localStorage.setItem('last_calendar_workId', workId);
    setCurrentWorkId(workId);
    setSettings(loadSettings(workId));
  }, []);

  // 設定更新（現在のカレンダーのストレージキーに保存）
  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(currentWorkIdRef.current, next);
      // グローバル設定のみ Supabase に同期
      if (user && !currentWorkIdRef.current) {
        updateUserSettings(user.id, {
          theme: next.theme,
          font: next.font,
          accentColor: next.accentColor,
        }).catch(console.error);
      }
      return next;
    });
  }, [user]);

  // 起動時にグローバルデフォルトを Supabase から復元
  useEffect(() => {
    if (!user) return;
    getUserSettings(user.id).then(db => {
      if (!db) return;
      // グローバルデフォルト（cal_settings_ なし）のみ更新
      const globalRaw = localStorage.getItem('user_settings');
      const globalSettings = globalRaw
        ? { ...DEFAULT_SETTINGS, ...JSON.parse(globalRaw) as Partial<UserSettings> }
        : DEFAULT_SETTINGS;
      const next = {
        ...globalSettings,
        ...(db.theme      && { theme:       db.theme      as ThemeMode }),
        ...(db.font       && { font:        db.font       as FontFamily }),
        ...(db.accentColor && { accentColor: db.accentColor }),
      };
      saveSettings('', next);
      // カレンダー未選択時のみ現在の表示に反映
      if (!currentWorkIdRef.current) {
        setSettings(next);
      }
    }).catch(console.error);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // テーマカラーを CSS 変数に反映（theme='system' のときは OS 設定変更にも追従）
  useEffect(() => {
    applyThemeVars(settings);
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemeVars(settings);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings.theme, settings.communityThemeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // アクセントカラー + 派生トークンを CSS 変数に反映
  useEffect(() => {
    applyAccentVars(settings.accentColor);
  }, [settings.accentColor]);

  // カレンダー文字色・グリッド線色を CSS 変数に反映
  useEffect(() => {
    const root = document.documentElement;
    const calVars: [string, string][] = [
      ['--cal-weekday-color',     settings.calWeekday],
      ['--cal-saturday-color',    settings.calSaturday],
      ['--cal-sunday-color',      settings.calSunday],
      ['--cal-other-month-color', settings.calOtherMonth],
    ];
    for (const [varName, value] of calVars) {
      if (value) root.style.setProperty(varName, value);
      else root.style.removeProperty(varName);
    }
    root.style.setProperty('--cal-grid-color', settings.calGridColor || 'rgba(128,128,128,0.15)');
  }, [settings.calWeekday, settings.calSaturday, settings.calSunday, settings.calOtherMonth, settings.calGridColor]);

  // フォントを CSS 変数に反映（body全体に適用）
  useEffect(() => {
    document.documentElement.style.setProperty('--font-family', fontStack(settings));
    if (settings.font === 'custom' && settings.customFontUrl && settings.customFontName) {
      const existing = document.getElementById('custom-font-style');
      if (existing) existing.remove();
      const style = document.createElement('style');
      style.id = 'custom-font-style';
      style.textContent = `@font-face { font-family: "${settings.customFontName}"; src: url("${settings.customFontUrl}"); }`;
      document.head.appendChild(style);
    }
  }, [settings.font, settings.customFontUrl, settings.customFontName]);

  // 背景画像を CSS 変数に反映
  useEffect(() => {
    const root = document.documentElement;
    if (settings.backgroundImageUrl) {
      root.style.setProperty('--bg-image', `url(${settings.backgroundImageUrl})`);
    } else {
      root.style.removeProperty('--bg-image');
    }
  }, [settings.backgroundImageUrl]);

  const calFontFamily = fontStack(settings);

  return (
    <ThemeContext.Provider value={{ settings, updateSettings, currentWorkId, setCurrentCalendar, calFontFamily }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
