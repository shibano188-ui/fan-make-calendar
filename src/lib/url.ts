// ユーザー入力・AI抽出のURLを <a href> に渡す前の無害化。
// http/https のみ素通しし、javascript:・data: 等は undefined を返してリンクを無効化する。
// 正規のURLは元の文字列をそのまま返すため表示・遷移先は一切変わらない。
export function safeHref(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const proto = new URL(url).protocol;
    return proto === 'http:' || proto === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}
