import { supabase } from './supabase';
import { IS_AUTOMATED } from './screenLog';

// 人ごとの「どこから来たか」を user_acquisition に残す（sql/2026-11-13-user-acquisition.sql）。
//   answer … 案内の最後の「FanHiveをどこで知りましたか？」（OnboardingTour の source の段）
//   play   … Android の Install Referrer（deepLink.ts）
//   web    … Web で最初に開いたときの来た元（App.tsx の ScreenLogger）
// 最初の1回だけ残す（表の主キーで2回目は弾かれる）。
// ログイン前の分は端末にためておき、ログインしたら送る。Install Referrer は1回しか読まないので、
// アプリを閉じても消えないよう localStorage にためる（screenLog はメモリだけ）。失敗しても画面には何も出さない。

export type AcquisitionKind = 'answer' | 'play' | 'web';

const PENDING_KEY = 'fan_acquisition_pending_v1';
const MAX_LEN = 200;

type Pending = Partial<Record<AcquisitionKind, string>>;

let userId: string | null = null;
let sending = false;

function load(): Pending {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '{}') as Pending; } catch { return {}; }
}

function save(p: Pending): void {
  try {
    if (Object.keys(p).length) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch { /* 残せなければ送れないだけ */ }
}

/** 来た元を1つ残す。同じ種類をすでにためていれば、最初の値のままにする */
export function recordAcquisition(kind: AcquisitionKind, value: string): void {
  if (IS_AUTOMATED) return;
  const v = value.trim().slice(0, MAX_LEN);
  if (!v) return;
  const p = load();
  if (p[kind]) return;
  save({ ...p, [kind]: v });
  void flush();
}

export function setAcquisitionUser(id: string | null): void {
  userId = id;
  if (id) void flush();
}

// 送っている途中に新しく足されたら、終わってからもう1回送る
let again = false;

async function flush(): Promise<void> {
  if (!userId) return;
  if (sending) { again = true; return; }
  sending = true;
  again = false;
  try {
    for (const [kind, value] of Object.entries(load()) as [AcquisitionKind, string][]) {
      // user_id は表の既定値（auth.uid()）に任せる。1行ずつ送る（まとめると1つの重複で全部落ちる）
      const { error } = await supabase.from('user_acquisition').insert({ kind, value });
      // 送れた、またはもう入っている（23505）なら消す。通信の失敗・表がまだ無いなどは残して次の起動で送り直す
      if (!error || error.code === '23505') {
        const rest = load();
        delete rest[kind];
        save(rest);
      }
    }
  } catch { /* 次の起動で送り直す */ }
  sending = false;
  if (again) void flush();
}
