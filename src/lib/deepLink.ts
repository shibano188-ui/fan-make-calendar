import { Capacitor, registerPlugin } from '@capacitor/core';

// 共有ページ（https://fanhive.jp/e/<id>）からアプリに来た人を、その予定の詳細へ連れて行く（2026-10-09）。
//   ・アプリが入っている人 … リンクを押すとアプリが開く（Android App Links／iOS Universal Links）。
//     URL は @capacitor/app の appUrlOpen・getLaunchUrl で受ける
//   ・Android でストアから入れた人 … 共有ページのストアのリンクに付けた予定の id を、
//     初めて開いたときに Install Referrer（ネイティブの InstallReferrerPlugin）から読む
// 案内（オンボーディング）の途中なら覚えておき、終わってから開く（App.tsx の DeepLinkHandler）

const PENDING_KEY = 'fan_pending_event_v1';
const REFERRER_CHECKED_KEY = 'fan_install_referrer_checked_v1';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** https://fanhive.jp/e/<id> から予定の id を取る。違う URL なら null */
export function eventIdFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!/^(www\.)?fanhive\.jp$/.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/e\/([0-9a-f-]{36})\/?$/i);
    return m ? m[1].toLowerCase() : null;
  } catch { return null; }
}

export function setPendingEvent(id: string): void {
  try { localStorage.setItem(PENDING_KEY, id); } catch { /* 覚えられなければ開かないだけ */ }
}

/** 覚えている予定を取り出す（取り出したら消す） */
export function takePendingEvent(): string | null {
  try {
    const id = localStorage.getItem(PENDING_KEY);
    if (id) localStorage.removeItem(PENDING_KEY);
    return id;
  } catch { return null; }
}

export function hasPendingEvent(): boolean {
  try { return !!localStorage.getItem(PENDING_KEY); } catch { return false; }
}

const InstallReferrer = registerPlugin<{ get(): Promise<{ referrer: string }> }>('InstallReferrer');

/**
 * Android でストアから入れたときの来た元（utm_content=<予定の id>）を1回だけ読む。
 * 古い版のアプリ（プラグインが無い）では失敗するので、そのときは読んだことにしない（更新後に読む）
 */
export async function readInstallReferrer(): Promise<string | null> {
  if (Capacitor.getPlatform() !== 'android') return null;
  try { if (localStorage.getItem(REFERRER_CHECKED_KEY)) return null; } catch { return null; }
  try {
    const { referrer } = await InstallReferrer.get();
    try { localStorage.setItem(REFERRER_CHECKED_KEY, '1'); } catch { /* noop */ }
    const p = new URLSearchParams(referrer || '');
    if (p.get('utm_source') !== 'share') return null;
    return p.get('utm_content')?.match(UUID)?.[0]?.toLowerCase() ?? null;
  } catch { return null; }
}
