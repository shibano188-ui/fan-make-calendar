import { useState } from 'react';
import { optimizedImage, type OptWidth } from '../../lib/image';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  w: OptWidth;
};

// 最適化URLで読み込み、失敗したら元URLへフォールバックする img。
// 元URLでも失敗した場合のみ呼び出し側の onError に伝える。
export default function OptImg({ src, w, onError, ...rest }: Props) {
  const [useRaw, setUseRaw] = useState(false);
  const url = useRaw ? src : optimizedImage(src, w);
  return (
    <img
      {...rest}
      src={url}
      onError={(e) => {
        if (!useRaw && url !== src) setUseRaw(true);
        else onError?.(e);
      }}
    />
  );
}
