import { useNavigate } from 'react-router-dom';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { usePremium, canFollowMore, followLimitTitle } from '../lib/premium';

// 作品をもう1つフォローしようとしたときの関所。上限に当たったら止めて、その場でプレミアムの案内へ送る
// （欲しいと思った瞬間が一番効く）。**今フォロー中のものは触らない**（不利益変更にしない）。
// 返り値の関数は「止めたら true」。
export function useFollowGate(): (count: number) => Promise<boolean> {
  const premium = usePremium();
  const confirm = useConfirm();
  const navigate = useNavigate();
  return async (count: number) => {
    if (canFollowMore(count, premium)) return false;
    const go = await confirm({
      title: followLimitTitle(),
      message: 'プレミアムなら、作品をいくつでもフォローできます。今フォロー中の作品はそのまま使えます。',
      confirmLabel: 'プレミアムを見る',
    });
    if (go) navigate('/premium?from=follow');
    return true;
  };
}
