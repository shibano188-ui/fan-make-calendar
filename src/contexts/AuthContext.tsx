import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getWorksByNames, upsertParticipation } from '../lib/api';
import { DEFAULT_WORK_NAMES } from '../lib/constants';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true });

// 初回起動時、デフォルト作品（ちいかわ・ハイキュー!!）へ自動参加させる。端末ごとに1回だけ。
// user を公開する前にこれを await して完了させることで、Home 等が「参加0件」を先読みして
// フォロー0のままキャッシュしてしまうレースを防ぐ。以後ユーザーが脱退しても再追加はしない。
// v2: 旧レース条件でフォロー0のまま詰まった既存端末を回復させるためキーをバージョンアップ。
// 未設定の端末（新規／旧フラグのみ持つ端末）で一度だけ再参加する。
const DEFAULT_JOINED_KEY = 'fan_default_joined_v2';
let defaultJoinPromise: Promise<void> | null = null;
function ensureDefaultJoined(userId: string): Promise<void> {
  if (localStorage.getItem(DEFAULT_JOINED_KEY)) return Promise.resolve();
  if (!defaultJoinPromise) {
    defaultJoinPromise = (async () => {
      try {
        const defaults = await getWorksByNames(DEFAULT_WORK_NAMES);
        await Promise.all(defaults.map((w) => upsertParticipation(w.id, userId)));
        localStorage.setItem(DEFAULT_JOINED_KEY, '1');
      } catch (e) {
        console.error('[ensureDefaultJoined]', e);
        defaultJoinPromise = null; // 失敗時は次回リトライできるようクリア
      }
    })();
  }
  return defaultJoinPromise;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // user を公開する前にデフォルト参加を確定させる
    const activate = async (u: User) => {
      await ensureDefaultJoined(u.id);
      if (cancelled) return;
      setUser(u);
      setLoading(false);
    };

    // 既存セッションを確認し、なければ匿名サインイン（成功時は onAuthStateChange 経由で activate）
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        activate(session.user);
      } else {
        supabase.auth.signInAnonymously().then(({ error }) => {
          if (error && !cancelled) setLoading(false);
        });
      }
    });

    // セッション変化を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // onAuthStateChange のコールバック内で supabase を直接 await するとロック競合の恐れが
        // あるため、setTimeout で外に出してから activate する
        const u = session.user;
        setTimeout(() => { if (!cancelled) activate(u); }, 0);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
