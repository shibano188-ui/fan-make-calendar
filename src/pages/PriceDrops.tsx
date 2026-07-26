import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ImageOff, TrendingDown, PackageCheck, BellOff } from 'lucide-react';
import { listMyPriceChanges, type PriceChange } from '../lib/api';
import { markPriceAlertsSeen } from '../lib/priceAlerts';
import { parseImageUrls, toggleMutedEventId } from '../lib/constants';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../contexts/AuthContext';
import { haptic } from '../lib/haptics';
import OptImg from '../components/ui/OptImg';
import { SkeletonList } from '../components/ui/Skeleton';

// いいねしたグッズの値下げ・再入荷をまとめて出すページ（プレミアム機能）。
// ホームには「値下がりしたものがあります」の1行だけ出し、中身はここに集める
// （1件ずつ通知すると煩わしいという本人指摘。数だけ知らせて、見たい人が開く形）。

const yen = (n?: number | null) => (n != null ? `¥${n.toLocaleString()}` : '');

function Row({ c, onOpen, onMute }: { c: PriceChange; onOpen: () => void; onMute: () => void }) {
  const [imgError, setImgError] = useState(false);
  const img = parseImageUrls(c.event.imageUrl)[0];
  const drop = c.kind === 'price_drop';
  return (
    <div className="rounded-[12px] border border-subtle overflow-hidden bg-bg-secondary p-2 flex gap-3">
      <button onClick={onOpen} className="pressable flex-shrink-0" aria-label={c.event.title}>
      <div className="w-20 h-20 rounded-[8px] overflow-hidden bg-fill-3 flex items-center justify-center">
        {img && !imgError
          ? <OptImg src={img} w={192} alt={c.event.title} loading="lazy" onError={() => setImgError(true)} className="w-full h-full object-cover" />
          : <ImageOff size={20} className="text-label-tertiary" />}
      </div>
      </button>
      <div className="flex-1 min-w-0">
        <button onClick={onOpen} className="pressable w-full text-left">
        <div className="flex items-center gap-1 text-[11px] font-bold" style={{ color: drop ? 'var(--color-success)' : 'var(--accent-text)' }}>
          {drop ? <TrendingDown size={13} /> : <PackageCheck size={13} />}
          {drop ? '値下がり' : '再入荷'}
        </div>
        {c.event.workName && <div className="text-[11px] text-label-secondary truncate">{c.event.workName}</div>}
        <div className="text-[14px] font-semibold leading-snug line-clamp-2">{c.event.title}</div>
        {/* 出しているのは代表価格ではなく**最安値**（在庫あり・単品・商品ページの中の最安）。
            高い販路が下がっても買う人には関係がないので、そもそも記録していない。 */}
        {drop ? (
          <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[11px] text-label-tertiary">最安</span>
            <span className="text-[12px] text-label-tertiary line-through">{yen(c.oldPrice)}</span>
            <span className="text-[12px] text-label-tertiary">→</span>
            <span className="text-[16px] font-bold" style={{ color: 'var(--color-success)' }}>{yen(c.newPrice)}</span>
            {c.oldPrice != null && c.newPrice != null && (
              <span className="text-[11px] font-bold" style={{ color: 'var(--color-success)' }}>-{yen(c.oldPrice - c.newPrice)}</span>
            )}
          </div>
        ) : (
          c.newPrice != null && (
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[11px] text-label-tertiary">最安</span>
              <span className="text-[16px] font-bold" style={{ color: 'var(--accent-text)' }}>{yen(c.newPrice)}</span>
            </div>
          )
        )}
        <div className="text-[11px] text-label-tertiary mt-0.5">{c.createdAt.slice(5, 10).replace('-', '/')} 時点</div>
        </button>
        {/* このグッズだけ通知を止める。いいねしたものは自動で対象になる（オプトアウト）ので、
            うるさいと思った瞬間にその場で止められるところに置く。 */}
        <button onClick={onMute} className="pressable mt-1.5 flex items-center gap-1 text-[11px] text-label-tertiary">
          <BellOff size={13} /> このグッズは通知しない
        </button>
      </div>
    </div>
  );
}

export default function PriceDrops() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [changes, setChanges] = useState<PriceChange[] | null>(null);

  const mute = (c: PriceChange) => {
    haptic.select();
    toggleMutedEventId(c.event.id);
    setChanges((prev) => (prev ?? []).filter((x) => x.event.id !== c.event.id));
    toast('このグッズの通知を止めました');
  };

  useEffect(() => {
    if (!user) { setChanges([]); return; }
    let alive = true;
    listMyPriceChanges(user.id)
      .then((cs) => {
        if (!alive) return;
        setChanges(cs);
        // 開いた時点までを既読にする（ホームのバッジが消える）。取得できた分だけを既読にするので、
        // 通信に失敗したときは前の既読位置のままになる。
        if (cs.length) markPriceAlertsSeen(cs[0].createdAt);
      })
      .catch(() => { if (alive) setChanges([]); });
    return () => { alive = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app flex-1 flex flex-col">
        <div className="sticky top-0 z-20 flex items-center gap-1 px-2 py-2 material-bar scroll-edge" style={{ paddingTop: 'calc(var(--sat) + 8px)' }}>
          <button onClick={() => { haptic.select(); navigate(-1); }} aria-label="戻る" className="pressable tap-44 p-2"><ArrowLeft size={22} /></button>
          <span className="text-[16px] font-bold">値下がり・再入荷</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: 'var(--accent-text)', background: 'var(--fill-secondary, rgba(120,120,128,0.16))' }}>ベータ</span>
        </div>

        <div className="px-3 pb-8">
          <div className="text-[12px] text-label-secondary mt-1 mb-1">いいねしたグッズのうち、最安値が下がったもの・在庫が戻ったものです（毎日1回チェック）</div>
          {/* 対象が全グッズではない（限定・イベント・プライズ品は価格が取れない）ことを先に言っておく。
              「いいねしたのに来なかった」を不具合だと思われないように。 */}
          <div className="text-[11px] text-label-tertiary mb-3">
            ベータ機能です。通販サイトで価格を取得できるグッズだけが対象で、
            会場限定・イベント限定・プライズ品などはお知らせできません。作品ごとの通知は
            <button onClick={() => { haptic.select(); navigate('/follows'); }} className="pressable underline" style={{ color: 'var(--accent-text)' }}>フォロー中の作品</button>
            から止められます。
          </div>
          {changes === null ? (
            <SkeletonList />
          ) : changes.length === 0 ? (
            <div className="text-center text-[13px] text-label-secondary py-16">
              値下がり・再入荷はまだありません<br />
              <span className="text-[12px] text-label-tertiary">気になるグッズにいいねしておくと、ここに出ます</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {changes.map((c) => (
                <Row key={c.id} c={c} onOpen={() => { haptic.select(); navigate(`/item/${c.event.id}`); }} onMute={() => mute(c)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
