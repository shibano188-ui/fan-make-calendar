import { useEffect, useRef } from 'react';

// Android の「戻る」（端のスワイプ・戻るボタン）で、画面の上に重ねて開いたものを閉じる（2026-10-05）。
//
// 前は App.tsx の BackButtonHandler が、ホーム・探す・カレンダー・マイページでは「戻り先が無い」としてアプリを終了していた。
// 新着を見る画面・下から出るシート・確認のダイアログ・絞り込みなどは画面の移動ではないので、
// これらを開いたまま戻ると、閉じる代わりにアプリが終わっていた（柴野の報告）。
// 開いている間ここに「閉じる」を積み、戻るが押されたら一番上だけを閉じる。何も無いときだけ今までどおり。
// iOS はスワイプで戻る動きを有効にしていないので、このための作りは要らない（呼ばれないだけで害は無い）

type Closer = { close: () => void };
const stack: Closer[] = [];

/** 一番上に開いているものを閉じる。閉じたら true（App.tsx の戻るの処理が使う） */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/** active の間、戻るで onClose を呼ぶ。後から開いたものほど先に閉じる */
export function useBackToClose(active: boolean, onClose: () => void): void {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return;
    const entry: Closer = { close: () => ref.current() };
    stack.push(entry);
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
