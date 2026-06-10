// タブ切り替え時の体感速度向上用インメモリキャッシュ（stale-while-revalidate）
// キャッシュヒット時は即表示し、裏で必ず再取得して最新化する。
// メモリのみ（リロードで消える）なので鮮度の問題は起きない。

const cache = new Map<string, unknown>();

export function getCached<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function setCached<T>(key: string, value: T): void {
  cache.set(key, value);
}
