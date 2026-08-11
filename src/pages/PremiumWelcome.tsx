import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Crown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { listSavedEvents } from '../lib/api';
import { PREMIUM_FEATURES, PREMIUM_FEATURE_ORDER, PREMIUM_FEATURE_NOTES } from '../lib/premium';
import { ensurePermission, notificationsSupported, rescheduleAll } from '../lib/notifications';
import { deviceCalendarSupported, enableDeviceCalendar, isDeviceCalendarOn } from '../lib/deviceCalendar';
import DeviceCalendarSheet from '../components/DeviceCalendarSheet';
import { useToast } from '../components/ui/Toast';
import { haptic } from '../lib/haptics';

// 購入直後の案内。決済が終わった直後にここへ送る。
//
// なぜ要るか: トライアル解約の55%は初日に起きる。買った直後の人は自分が何を買ったのか
// 説明できないことが多く、それがそのまま解約になる（[[fanhive-paywall-design]]）。
// ここでやるのは2つ。**何が使えるようになったかを全部見せること**と、
// **今すぐ効く設定をその場で終わらせること**。
//
// 設定を後回しにすると「通知が来ない」「カレンダーに入らない」で価値が体感されないまま
// 無料期間が終わる。だから許可と書き込み先だけはこの流れの中で押させる。

export default function PremiumWelcome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [calSheet, setCalSheet] = useState(false);
  const [notifyDone, setNotifyDone] = useState(false);
  const [calDone, setCalDone] = useState(() => isDeviceCalendarOn());

  const finish = () => { haptic.select(); navigate('/', { replace: true }); };

  const askNotify = async () => {
    haptic.select();
    const ok = await ensurePermission();
    setNotifyDone(ok);
    if (ok) {
      toast('通知を受け取ります');
      if (user) listSavedEvents(user.id).then(rescheduleAll).catch(() => {});
    } else {
      toast('端末の設定から通知をONにしてください');
    }
  };

  const askCalendar = async () => {
    haptic.select();
    const ok = await enableDeviceCalendar();
    if (!ok) { toast('カレンダーへのアクセスを許可してください'); return; }
    setCalSheet(true);
  };

  const btn = 'pressable w-full py-3.5 rounded-full text-[15px] font-bold';
  const primary = { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app flex-1 flex flex-col px-5"
        style={{ paddingTop: 'calc(var(--sat) + 32px)', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>

        {step === 0 && (
          <>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Crown size={22} style={{ color: 'var(--accent-color)' }} />
                <h1 className="text-[22px] font-bold">プレミアムを始めました</h1>
              </div>
              <p className="text-[13px] text-label-secondary mb-5">
                今日から次の機能が使えます。あと2つだけ設定させてください。
              </p>
              <div className="rounded-[12px] overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                {PREMIUM_FEATURE_ORDER.map((f, i) => (
                  <div key={f} className={`px-3 py-2.5 ${i > 0 ? 'border-t border-subtle' : ''}`}>
                    <div className="flex items-center gap-2">
                      <Check size={16} style={{ color: 'var(--accent-color)' }} className="flex-shrink-0" />
                      <span className="text-[14px] font-medium">{PREMIUM_FEATURES[f]}</span>
                    </div>
                    <p className="text-[11px] text-label-secondary mt-1 ml-6">{PREMIUM_FEATURE_NOTES[f]}</p>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => { haptic.select(); setStep(1); }} className={`${btn} mt-5`} style={primary}>
              次へ
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <div className="flex-1">
              <h1 className="text-[22px] font-bold mb-1">通知を許可してください</h1>
              <p className="text-[13px] text-label-secondary leading-relaxed">
                受付開始や値下げは、始まった時点でお知らせします。通知が許可されていないと、
                プレミアムの機能のうち3つが動きません。
              </p>
              {!notificationsSupported() && (
                <p className="text-[12px] text-label-tertiary mt-4">
                  ブラウザ版では通知を出せません。アプリ版で許可してください。
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 mt-5">
              <button onClick={askNotify} className={btn} style={primary} disabled={notifyDone}>
                {notifyDone ? '許可しました' : '通知を許可する'}
              </button>
              <button onClick={() => { haptic.select(); setStep(2); }}
                className="pressable w-full py-2.5 text-[13px] text-label-secondary">
                {notifyDone ? '次へ' : 'あとで'}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex-1">
              <h1 className="text-[22px] font-bold mb-1">カレンダーに自動で入れる</h1>
              <p className="text-[13px] text-label-secondary leading-relaxed">
                いいねした予定と自分の投稿が、選んだカレンダーに自動で入ります。
                書き込み先を決めるまでは何も書き込みません。
              </p>
              {!deviceCalendarSupported() && (
                <p className="text-[12px] text-label-tertiary mt-4">
                  この端末では直接の書き込みに対応していません。マイページの「カレンダー自動同期」から
                  購読URLを登録すると、Google・Appleのカレンダーに入ります。
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 mt-5">
              {deviceCalendarSupported() && (
                <button onClick={askCalendar} className={btn} style={primary} disabled={calDone}>
                  {calDone ? '設定しました' : '書き込み先を選ぶ'}
                </button>
              )}
              <button onClick={finish} className="pressable w-full py-2.5 text-[13px] text-label-secondary">
                {calDone ? 'はじめる' : 'あとで'}
              </button>
            </div>
          </>
        )}
      </div>

      {calSheet && (
        <DeviceCalendarSheet
          open
          onClose={() => setCalSheet(false)}
          onDecide={() => { setCalSheet(false); setCalDone(true); toast('カレンダーに書き込みます'); }}
        />
      )}
    </div>
  );
}
