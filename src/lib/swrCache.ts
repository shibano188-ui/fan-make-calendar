// タブ切り替え・起動時の体感速度向上用キャッシュ（stale-while-revalidate）
// キャッシュヒット時は即表示し、裏で必ず再取得して最新化する。
// メモリに加えて localStorage にも書き、コールドスタート直後でも前回データを即表示できる。
// 常に再取得が走るので、古いデータが見えるのは一瞬だけ。

const cache = new Map<string, unknown>();
const LS_PREFIX = 'swr:';

export function getCached<T>(key: string): T | undefined {
  if (cache.has(key)) return cache.get(key) as T;
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw != null) {
      const value = JSON.parse(raw) as T;
      cache.set(key, value);
      return value;
    }
  } catch { /* 破損・容量超過時は無視してネットワーク取得に任せる */ }
  return undefined;
}

export function setCached<T>(key: string, value: T): void {
  // 同じものを入れ直すだけなら、大きな JSON を書き直さない（ホーム・探すの一覧は数MBある）
  if (cache.get(key) === value) return;
  cache.set(key, value);
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch { /* noop */ }
}

// ─── 大きいもの（ホーム・探すの全予定の一覧）は IndexedDB に置く ───────────────
// 一覧は数千件・数MBあり、localStorage（5MBまで）に入らず、書くたびに黙って失敗していた。
// そのため起動のたびに前回のデータが無く、全件の取得（数秒）を毎回待っていた（2026-10-04 実測）。
// IndexedDB は容量に余裕があり、JSON にせずそのまま入れられる。読み出しは非同期なので、
// 画面は「メモリにあれば即・無ければ IndexedDB を読んでから・その間にネットワークも走らせる」で使う。

/** ホーム・探す・オンボーディングで共有する、全予定の一覧のキー */
export const EXPLORE_EVENTS_KEY = 'explore-events';

const IDB_NAME = 'fanhive-swr';
const IDB_STORE = 'kv';
let idbOpen: Promise<IDBDatabase> | null = null;
function idb(): Promise<IDBDatabase> {
  idbOpen ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // 失敗した回は覚えない（次に呼ばれたときに開き直す）
  idbOpen.catch(() => { idbOpen = null; });
  return idbOpen;
}

/** IndexedDB から読む。メモリにあればそれを返す。読めなければ undefined */
export async function loadCachedLarge<T>(key: string): Promise<T | undefined> {
  if (cache.has(key)) return cache.get(key) as T;
  try {
    const db = await idb();
    const value = await new Promise<T | undefined>((resolve, reject) => {
      const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
    // 読んでいる間にネットワークの結果が先に入っていたら、そちらを使う
    if (cache.has(key)) return cache.get(key) as T;
    if (value !== undefined) cache.set(key, value);
    return value;
  } catch { return undefined; }
}

/** メモリと IndexedDB に書く。同じものを入れ直すだけなら書かない */
export function setCachedLarge<T>(key: string, value: T): void {
  if (cache.get(key) === value) return;
  cache.set(key, value);
  idb().then((db) => { db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(value, key); }).catch(() => {});
}
