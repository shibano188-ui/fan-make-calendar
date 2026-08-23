// 使う人が作ったテーマの保存と、生成APIの呼び出し。
//
// 保存先はサーバー（user_themes）。端末に置くと機種変で消えて、
// 「作った」という資産が飛ぶ＝課金の理由が壊れるため。
// 選んでいるテーマ（どれを使っているか）だけは端末に置く。

import { supabase } from './supabase';
import { authHeaders } from './apiAuth';
import type { ThemeSpec, UserTheme } from '../design/themeSpec';
import { applyPatch, type ContrastReport } from '../design/themeCheck';

const ACTIVE_KEY = 'fan_user_theme';

/** 無料で保存できる数。プレミアムは上限なし（DB側の天井20だけ効く） */
export const FREE_THEME_LIMIT = 1;

/** 1つのテーマを手直しできる回数。作り直せばリセットされる */
export const TWEAK_LIMIT = 10;

export function loadActiveThemeId(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

export function saveActiveThemeId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch { /* 保存できなくても表示は続ける */ }
}

type Row = { id: string; name: string; spec: ThemeSpec; created_at: string };

function toTheme(r: Row): UserTheme {
  return { id: r.id, spec: { ...r.spec, name: r.name || r.spec.name }, createdAt: r.created_at };
}

export async function listUserThemes(): Promise<UserTheme[]> {
  const { data, error } = await supabase
    .from('user_themes')
    .select('id, name, spec, created_at')
    .order('updated_at', { ascending: false });
  if (error || !data) return [];
  return (data as Row[]).map(toTheme);
}

export async function createUserTheme(spec: ThemeSpec): Promise<UserTheme | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('user_themes')
    .insert({ user_id: user.id, name: spec.name, spec })
    .select('id, name, spec, created_at')
    .single();
  if (error || !data) return null;
  return toTheme(data as Row);
}

export async function updateUserTheme(id: string, spec: ThemeSpec): Promise<boolean> {
  const { error } = await supabase
    .from('user_themes')
    .update({ name: spec.name, spec, updated_at: new Date().toISOString() })
    .eq('id', id);
  return !error;
}

export async function deleteUserTheme(id: string): Promise<boolean> {
  const { error } = await supabase.from('user_themes').delete().eq('id', id);
  return !error;
}

// ── 生成 ──────────────────────────────────────────────────────────

export class ThemeLimitError extends Error {
  constructor(public retryAfterSec?: number) {
    super('rate_limited');
  }
}

/**
 * 言葉から設定表を作る／手直しする。
 *
 * サーバーが返すのは**差分だけ**。今の表に当てて、明暗差を検算して直すのはここ
 * （語彙の一覧＝themeCheck.ts を持っているのがクライアント側なので、
 *   サーバーに同じ表を二重に持たせない）。
 */
export async function generateTheme(
  prompt: string,
  current: ThemeSpec,
  images: string[] = [],
): Promise<{ spec: ThemeSpec; note: string; report: ContrastReport[] }> {
  const apiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  const res = await fetch(`${apiBase}/api/generate-theme`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ prompt, current, images }),
  });
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    throw new ThemeLimitError(body?.retryAfterSec);
  }
  if (!res.ok) throw new Error('generation_failed');
  const { patch, note } = await res.json() as { patch: unknown; note?: string };
  const { spec, report } = applyPatch(current, patch);
  return { spec, note: note ?? '', report };
}
