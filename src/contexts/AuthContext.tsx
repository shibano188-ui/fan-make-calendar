import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getWorksByNames, upsertParticipation } from '../lib/api';
import { DEFAULT_WORK_NAMES, SHOW_ONBOARDING, ONBOARDING_KEY } from '../lib/constants';
import { setAppStateUser, setAppStateSync, syncAppState } from '../lib/appState';
import { setStampUser } from '../lib/stampStore';
import { refreshPremium, clearPremium } from '../lib/premium';
import { configureBilling } from '../lib/billing';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true });

// デフォルト作品（ちいかわ・ハイキュー!!）へ自動参加させる。端末ごとに1回だけ。
// user を公開する前にこれを await して完了させることで、Home 等が「参加0件」を先読みして
// フォロー0のままキャッシュしてしまうレースを防ぐ。以後ユーザーが脱退しても再追加はしない。
// v2: 旧レース条件でフォロー0のまま詰まった既存端末を回復させるためキーをバージョンアップ。
// 未設定の端末（新規／旧フラグのみ持つ端末）で一度だけ再参加する。
//
// 新しい端末（オンボーディングをまだ見ていない）ではここで入れない。案内の1枚目で作品を選ばせ、
// 1つも選ばずに閉じた人にだけ Onboarding の finish が joinDefaultWorks を呼ぶ。
// 案内を見終えた端末でログアウト→新しい匿名アカウントになったときは今までどおりここで入れる
// （新規ユーザーではないのに、フォローが空になると事故に見えるため）。
const DEFAULT_JOINED_KEY = 'fan_default_joined_v2';
// 端末設定をこの端末で一度でも同期できた人（値は user_id）。2回目からは起動時に同期を待たない
const SYNCED_ONCE_KEY = 'fan_app_state_synced_v1';

/** 既定の作品を入れるかの判断を済ませた印を立てる。オンボーディングで作品を選んで入れなかったときも立てる。
 *  立てないと、次の起動で ensureDefaultJoined が「まだ入れていない」と見て、選んでいない作品まで足してしまう */
export function markDefaultJoinSettled(): void {
  try { localStorage.setItem(DEFAULT_JOINED_KEY, '1'); } catch { /* 保存できなくても次の起動で入るだけ */ }
}

/** 既定の作品をフォローして、判断済みの印を立てる。失敗したら印は立てない（次の起動でやり直す） */
export async function joinDefaultWorks(userId: string): Promise<void> {
  const defaults = await getWorksByNames(DEFAULT_WORK_NAMES);
  await Promise.all(defaults.map((w) => upsertParticipation(w.id, userId)));
  markDefaultJoinSettled();
}

let defaultJoinPromise: Promise<void> | null = null;
function ensureDefaultJoined(userId: string): Promise<void> {
  if (localStorage.getItem(DEFAULT_JOINED_KEY)) return Promise.resolve();
  // 案内がこれから出る端末は、案内の中で選ばせるのでここでは入れない
  if (SHOW_ONBOARDING && !localStorage.getItem(ONBOARDING_KEY)) return Promise.resolve();
  if (!defaultJoinPromise) {
    defaultJoinPromise = (async () => {
      try {
        await joinDefaultWorks(userId);
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
    let activatedId: string | null = null;

    // user を公開する前にデフォルト参加とアプリ状態の同期を確定させる。
    // 同期はサーバーが遅い/落ちている場合に起動を止めないよう上限を切り、超えたらローカルのまま進む。
    const activate = async (u: User) => {
      // getSession と onAuthStateChange の両方から同じ人で呼ばれるので、2回目は何もしない
      if (activatedId === u.id) return;
      activatedId = u.id;
      setAppStateUser(u.id);
      setStampUser(u.id);
      // 端末設定（通知ベル・ミュート・作品の色など）の同期は**全員**に開放している。
      // 元は有料機能だったが、投稿・いいね・フォローはそもそもアカウントに紐付いていて
      // 無料でも別端末で見られる＝「複数端末で使える」は有料の売りとして成立しなかった
      // （2026-08-14 本人判断で有料リストから外した）。
      setAppStateSync(true);
      await ensureDefaultJoined(u.id);
      // 端末設定の同期を待つのは**その端末で初めて同期するときだけ**。
      // 2回目からは手元に前回の写しがあるので、画面を先に出して裏で同期する
      // （毎回待っていたため、起動のたびにデータの表示が1往復以上遅れていた）。
      if (localStorage.getItem(SYNCED_ONCE_KEY) === u.id) {
        syncAppState(u.id).catch(() => { /* 失敗してもローカルは無事 */ });
      } else {
        await Promise.race([
          syncAppState(u.id).then(() => { try { localStorage.setItem(SYNCED_ONCE_KEY, u.id); } catch { /* noop */ } }),
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      }
      if (cancelled) return;
      setUser(u);
      setLoading(false);
      // 課金SDKのユーザーIDを Supabase の user_id に合わせる。
      // ここがズレると Webhook から user_private に引き当てられない
      configureBilling(u.id).catch(() => { /* 購入時にもう一度試す */ });
      // 会員状態は起動を待たせない（キャッシュで即答し、確定したらストア経由で切り替わる）
      // 端末設定の同期は会員状態に関係なく続ける。ここで無料の人の同期を止めていたため、
      // 起動後に変えた作品の色・通知ベルなどがサーバーに届かず、次の起動で古い値に戻っていた（2026-09-20 修正）
      refreshPremium(u.id).catch(() => { /* 取れなければ無料のまま */ });
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
        activatedId = null;
        setUser(null);
        setLoading(false);
        clearPremium();       // 別アカウントに有料状態を持ち越さない
        setAppStateSync(false);
        setStampUser(null);
      }
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  // アプリ復帰時に会員状態を読み直す（別端末での加入・解約や期限切れを拾う）。
  // @capacitor/app の 'resume' はネイティブ限定なので、Web/WebView 共通の visibilitychange を使う。
  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshPremium(user.id).catch(() => { /* 維持 */ });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
