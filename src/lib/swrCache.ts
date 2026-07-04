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
  cache.set(key, value);
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch { /* noop */ }
}
