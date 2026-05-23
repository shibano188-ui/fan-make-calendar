import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getUserSettings, updateUserSettings } from '../lib/api';

export type ThemeMode = 'simple' | 'dark';
export type FontFamily = 'system' | 'serif' | 'rounded' | 'custom';

export interface CommunityTheme {
  id: string;
  name: string;
  useCount: number;
  vars: Record<string, string>;
}

export const COMMUNITY_THEMES: CommunityTheme[] = [
  {
    id: 'sakura',
    name: 'さくらピンク',
    useCount: 482,
    vars: {
      '--bg-primary': '#fff0f3', '--bg-secondary': '#ffd6e0',
      '--label-primary': '#2a1a1f', '--label-secondary': '#7a4a56', '--label-tertiary': '#b07a88',
      '--border-faint': 'rgba(180,80,100,0.05)', '--border-subtle': 'rgba(180,80,100,0.08)',
      '--border-default': 'rgba(180,80,100,0.15)', '--border-strong': 'rgba(180,80,100,0.30)',
      '--border-selected': 'rgba(180,80,100,0.70)',
      '--input-text': '#2a1a1f', '--input-placeholder': 'rgba(42,26,31,0.35)', '--input-caret': '#2a1a1f',
    },
  },
  {
    id: 'midnight',
    name: 'ミッドナイト',
    useCount: 891,
    vars: {
      '--bg-primary': '#080c14', '--bg-secondary': '#111827',
      '--label-primary': '#c8d8f0', '--label-secondary': '#7890b0', '--label-tertiary': '#4a5a70',
      '--border-faint': 'rgba(100,150,220,0.05)', '--border-subtle': 'rgba(100,150,220,0.08)',
      '--border-default': 'rgba(100,150,220,0.15)', '--border-strong': 'rgba(100,150,220,0.30)',
      '--border-selected': 'rgba(100,150,220,0.70)',
      '--input-text': '#c8d8f0', '--input-placeholder': 'rgba(200,216,240,0.30)', '--input-caret': '#c8d8f0',
    },
  },
  {
    id: 'matcha',
    name: '抹茶グリーン',
    useCount: 256,
    vars: {
      '--bg-primary': '#1a2614', '--bg-secondary': '#263520',
      '--label-primary': '#c8e8b0', '--label-secondary': '#7aaa60', '--label-tertiary': '#4a7040',
      '--border-faint': 'rgba(100,180,80,0.05)', '--border-subtle': 'rgba(100,180,80,0.08)',
      '--border-default': 'rgba(100,180,80,0.15)', '--border-strong': 'rgba(100,180,80,0.30)',
      '--border-selected': 'rgba(100,180,80,0.70)',
      '--input-text': '#c8e8b0', '--input-placeholder': 'rgba(200,232,176,0.30)', '--input-caret': '#c8e8b0',
    },
  },
  {
    id: 'ivory',
    name: 'アイボリー',
    useCount: 203,
    vars: {
      '--bg-primary': '#faf8f2', '--bg-secondary': '#f0ece0',
      '--label-primary': '#2c2820', '--label-secondary': '#6a6050', '--label-tertiary': '#9a9080',
      '--border-faint': 'rgba(80,60,40,0.05)', '--border-subtle': 'rgba(80,60,40,0.08)',
      '--border-default': 'rgba(80,60,40,0.15)', '--border-strong': 'rgba(80,60,40,0.30)',
      '--border-selected': 'rgba(80,60,40,0.70)',
      '--input-text': '#2c2820', '--input-placeholder': 'rgba(44,40,32,0.35)', '--input-caret': '#2c2820',
    },
  },
  {
    id: 'mahou',
    name: '魔法少女の夢',
    useCount: 743,
    vars: {
      '--bg-primary': '#1a0d2e', '--bg-secondary': '#2d1448',
      '--label-primary': '#f0c0f8', '--label-secondary': '#b080c8', '--label-tertiary': '#6840a0',
      '--border-faint': 'rgba(200,100,240,0.05)', '--border-subtle': 'rgba(200,100,240,0.08)',
      '--border-default': 'rgba(200,100,240,0.15)', '--border-strong': 'rgba(200,100,240,0.30)',
      '--border-selected': 'rgba(200,100,240,0.70)',
      '--input-text': '#f0c0f8', '--input-placeholder': 'rgba(240,192,248,0.30)', '--input-caret': '#f0c0f8',
    },
  },
  {
    id: 'neon',
    name: 'ネオン街',
    useCount: 1204,
    vars: {
      '--bg-primary': '#0a0a12', '--bg-secondary': '#12121e',
      '--label-primary': '#d0e8ff', '--label-secondary': '#5080b0', '--label-tertiary': '#304060',
      '--border-faint': 'rgba(80,160,255,0.05)', '--border-subtle': 'rgba(80,160,255,0.08)',
      '--border-default': 'rgba(80,160,255,0.15)', '--border-strong': 'rgba(80,160,255,0.30)',
      '--border-selected': 'rgba(80,160,255,0.70)',
      '--input-text': '#d0e8ff', '--input-placeholder': 'rgba(208,232,255,0.25)', '--input-caret': '#d0e8ff',
    },
  },
  {
    id: 'autumn',
    name: '秋の情景',
    useCount: 389,
    vars: {
      '--bg-primary': '#1e1208', '--bg-secondary': '#2e1c0c',
      '--label-primary': '#f8e0b0', '--label-secondary': '#c09060', '--label-tertiary': '#806040',
      '--border-faint': 'rgba(220,140,40,0.05)', '--border-subtle': 'rgba(220,140,40,0.08)',
      '--border-default': 'rgba(220,140,40,0.15)', '--border-strong': 'rgba(220,140,40,0.30)',
      '--border-selected': 'rgba(220,140,40,0.70)',
      '--input-text': '#f8e0b0', '--input-placeholder': 'rgba(248,224,176,0.30)', '--input-caret': '#f8e0b0',
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
  theme: 'dark',
  font: 'system',
  accentColor: '#888780',
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

export const THEME_VARS: Record<ThemeMode, Record<string, string>> = {
  dark: {
    '--bg-primary':        '#1a1a1a',
    '--bg-secondary':      '#2a2a2a',
    '--label-primary':     '#ffffff',
    '--label-secondary':   '#aaaaaa',
    '--label-tertiary':    '#666666',
    '--border-faint':      'rgba(255,255,255,0.05)',
    '--border-subtle':     'rgba(255,255,255,0.08)',
    '--border-default':    'rgba(255,255,255,0.15)',
    '--border-strong':     'rgba(255,255,255,0.30)',
    '--border-selected':   'rgba(255,255,255,0.60)',
    '--input-text':        '#ffffff',
    '--input-placeholder': 'rgba(255,255,255,0.25)',
    '--input-caret':       '#ffffff',
  },
  simple: {
    '--bg-primary':        '#f5f5f5',
    '--bg-secondary':      '#e8e8e8',
    '--label-primary':     '#111111',
    '--label-secondary':   '#555555',
    '--label-tertiary':    '#888888',
    '--border-faint':      'rgba(0,0,0,0.05)',
    '--border-subtle':     'rgba(0,0,0,0.08)',
    '--border-default':    'rgba(0,0,0,0.15)',
    '--border-strong':     'rgba(0,0,0,0.30)',
    '--border-selected':   'rgba(0,0,0,0.60)',
    '--input-text':        '#111111',
    '--input-placeholder': 'rgba(0,0,0,0.30)',
    '--input-caret':       '#111111',
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

// ウィジェットページが設定をCSSに反映するためのユーティリティ
export function applySettingsToCSS(settings: UserSettings) {
  const root = document.documentElement;

  // テーマカラー
  const communityTheme = settings.communityThemeId
    ? COMMUNITY_THEMES.find(t => t.id === settings.communityThemeId)
    : null;
  const vars = communityTheme ? communityTheme.vars : THEME_VARS[settings.theme];
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

  // アクセントカラー
  root.style.setProperty('--accent-color', settings.accentColor);

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

  // テーマカラーを CSS 変数に反映
  useEffect(() => {
    const communityTheme = settings.communityThemeId
      ? COMMUNITY_THEMES.find(t => t.id === settings.communityThemeId)
      : null;
    const vars = communityTheme ? communityTheme.vars : THEME_VARS[settings.theme];
    Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
  }, [settings.theme, settings.communityThemeId]);

  // アクセントカラーを CSS 変数に反映
  useEffect(() => {
    document.documentElement.style.setProperty('--accent-color', settings.accentColor);
  }, [settings.accentColor]);

  // カレンダー文字色を CSS 変数に反映
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
  }, [settings.calWeekday, settings.calSaturday, settings.calSunday, settings.calOtherMonth]);

  // カスタムフォントの @font-face 登録のみ（フォントはカレンダーグリッドに直接渡すためCSS変数は設定しない）
  useEffect(() => {
    if (settings.font === 'custom' && settings.customFontUrl && settings.customFontName) {
      const existing = document.getElementById('custom-font-style');
      if (existing) existing.remove();
      const style = document.createElement('style');
      style.id = 'custom-font-style';
      style.textContent = `@font-face { font-family: "${settings.customFontName}"; src: url("${settings.customFontUrl}"); }`;
      document.head.appendChild(style);
    }
  }, [settings.font, settings.customFontUrl, settings.customFontName]);

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
