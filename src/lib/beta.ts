import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from './supabase';

// 試している途中の画面を、決めた人にだけ出す（2026-11-19 柴野「まずは私のみが確かめられればいい」）。
// user_app_state.beta が true の人だけ（sql/2026-11-19-user-beta.sql）。列がまだ無い環境では false のまま。
// 端末にも覚えておき、開いた瞬間から出す（裏で取り直す）。スタンプのボタンのように一覧に何十個も並ぶ所からも
// 呼ぶので、問い合わせは1人1回にまとめる。

const KEY = 'fan_beta';
/** 止めるときは false（2026-11-20 柴野「私のアカウントでもまだ出さない。時間をかけて調整する」）。
 *  false の間は、beta の人にも出さず、問い合わせもしない。表（records）や beta の列はそのまま残す */
const ENABLED = false;
let value = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
let askedFor: string | null = null;
const listeners = new Set<() => void>();

function ask(userId: string): void {
  if (askedFor === userId) return;
  askedFor = userId;
  void supabase.from('user_app_state').select('beta').eq('user_id', userId).maybeSingle()
    .then(({ data, error }) => {
      if (error) return;
      const v = !!(data as { beta?: boolean } | null)?.beta;
      try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* noop */ }
      if (v !== value) { value = v; listeners.forEach((l) => l()); }
    });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** beta の人か。ログインしていなければ false */
export function useBeta(userId: string | undefined | null): boolean {
  useEffect(() => { if (ENABLED && userId) ask(userId); }, [userId]);
  const v = useSyncExternalStore(subscribe, () => value, () => value);
  return ENABLED && !!userId && v;
}
