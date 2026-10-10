import { Heart, BellRing } from 'lucide-react';
import Sheet from '../ui/Sheet';
import FanHiveMark from '../FanHiveMark';

// 共有ページ（/e/:id）で ♡・ベル・フォローなどを押したときに出す、アプリへの案内。
// Web の上ではいいねさせない（アプリに引き継げないので、押しても意味が無い）。
// ストアへは get.html を通す（来た元 src=share を数え、Android は Play に予定の id も渡す）

/**
 * 「アプリで開く」の行き先。
 * Android … intent:// で、アプリが入っていればその予定を開き、無ければ get.html → Play へ
 *   （X のアプリ内ブラウザや同じドメインの中のリンクでは App Links が働かないので、ふつうのリンクではアプリが開かない）
 * iOS ほか … get.html → App Store（入っている人はストアの「開く」から）
 */
export function openAppHref(eventId: string): string {
  const get = `/get.html?src=share&e=${encodeURIComponent(eventId)}`;
  if (!/Android/.test(navigator.userAgent)) return get;
  const fallback = encodeURIComponent(`${location.origin}${get}`);
  return `intent://fanhive.jp/e/${encodeURIComponent(eventId)}#Intent;scheme=https;package=jp.llp.fanhive;S.browser_fallback_url=${fallback};end`;
}

export default function GetAppSheet({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const href = openAppHref(eventId);
  return (
    <Sheet onClose={onClose} showClose={false} ariaLabel="アプリで受け取る">
      <div className="px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+20px)] flex flex-col items-center text-center">
        <FanHiveMark size={56} />
        <h2 className="mt-3 text-[18px] font-bold">FanHive アプリで受け取る</h2>
        <div className="mt-4 w-full flex flex-col gap-3 text-left text-[14px]">
          <div className="flex items-center gap-3">
            <Heart size={20} style={{ color: 'var(--accent-color)' }} className="flex-shrink-0" />
            <span>♡ を押すだけで、この予定がカレンダーに入ります</span>
          </div>
          <div className="flex items-center gap-3">
            <BellRing size={20} style={{ color: 'var(--accent-color)' }} className="flex-shrink-0" />
            <span>予約締切・発売日の前に通知が届きます</span>
          </div>
        </div>
        <a href={href} className="pressable mt-6 w-full py-3 rounded-[12px] font-semibold text-[15px]"
          style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
          アプリで開く（無料）
        </a>
        <button onClick={onClose} className="pressable mt-3 text-[13px] text-label-secondary">あとで</button>
      </div>
    </Sheet>
  );
}
