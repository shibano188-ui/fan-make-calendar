import { useEffect, useState } from 'react';

/** 文字の入力欄にカーソルがある（＝キーボードが出ている）か。
 *  Android は画面がキーボードの分だけ縮むので、下に浮かぶバーがキーボードの上に乗ってしまう。その間は隠すために使う */
export function useTyping(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isText = (el: Element | null) =>
      !!el && (el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable ||
        (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes((el as HTMLInputElement).type)));
    const update = () => setTyping(isText(document.activeElement));
    // focusout の直後は activeElement がまだ body なので、次の入力欄へ移るのを待ってから判定する
    const onOut = () => setTimeout(update, 0);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', onOut);
    return () => { document.removeEventListener('focusin', update); document.removeEventListener('focusout', onOut); };
  }, []);
  return typing;
}
