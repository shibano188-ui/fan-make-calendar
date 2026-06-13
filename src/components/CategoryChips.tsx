import type { CSSProperties } from 'react';
import { displayCategories } from '../lib/constants';

type Props = {
  category?: string | null;
  /** 各チップに適用するクラス（サイトごとの既存チップclassをそのまま渡す） */
  className?: string;
  /** 各チップに適用するインラインスタイル */
  style?: CSSProperties;
};

/** category（単一文字列 or JSON配列文字列）をパースして、1カテゴリ＝1チップで描画する */
export default function CategoryChips({ category, className, style }: Props) {
  const cats = displayCategories(category);
  if (cats.length === 0) return null;
  return (
    <>
      {cats.map(c => (
        <span key={c} className={className} style={style}>{c}</span>
      ))}
    </>
  );
}
