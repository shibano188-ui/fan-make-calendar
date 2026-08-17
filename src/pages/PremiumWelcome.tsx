import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Crown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { listSavedEvents } from '../lib/api';
import { PREMIUM_FEATURES, PREMIUM_FEATURE_ORDER, PREMIUM_FEATURE_NOTES } from '../lib/premium';
import { ensurePermission, notificationPermission, rescheduleAll } from '../lib/notifications';
import {
  deviceCalendarSupported, enableDeviceCalendar, getTargetCalendarId, listDeviceCalendars,
} from '../lib/deviceCalendar';
import DeviceCalendarSheet from '../components/DeviceCalendarSheet';
import AccountSheet from '../components/AccountSheet';
import { accountEmail, accountState } from '../lib/account';
import { useToast } from '../components/ui/Toast';
import { haptic } from '../lib/haptics';

// 購入直後の案内。決済が終わった直後にここへ送る。
// マイページのプレミアムからも `?step=settings` で設定だけ開ける（買った直後に飛ばした人の受け皿）。
//
// なぜ要るか: トライアル解約の55%は初日に起きる。買った直後の人は自分が何を買ったのか
// 説明できないことが多く、それがそのまま解約になる（[[fanhive-paywall-design]]）。
// ここでやるのは2つ。**何が使えるようになったかを全部見せること**と、
// **今すぐ効く設定をその場で終わらせること**。
//
// 設定が済んだ項目は**ボタンを消して結果だけ出す**。押せるのに何も起きないボタンを残すと、
// 壊れていると読まれる（2026-08-11 本人指摘）。

export default function PremiumWelcome() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(params.get('step') === 'settings' ? 1 : 0);
  const [perm, setPerm] = useState<'granted' | 'denied' | 'prompt' | 'unsupported' | null>(null);
  const [calName, setCalName] = useState<string | null>(null);
  const [calSheet, setCalSheet] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  // 引き継ぎのメール登録は**購入の前ではなくここで**案内する。
  // 購入の条件にすると iOS 5.1.1(v) で落ちる（2026-08-17 却下）。
  const linked = accountState(user) === 'email';

  const refreshPerm = useCallback(() => { notificationPermission().then(setPerm).catch(() => {}); }, []);

  // 書き込み先の「名前」まで出す。IDだけ覚えていても、どこに入るのか本人には分からない
  const refreshCal = useCallback(() => {
    const id = getTargetCalendarId();
    if (!id) { setCalName(null); return; }
    listDeviceCalendars()
      .then((cs) => setCalName(cs.find((c) => c.id === id)?.title ?? null))
      .catch(() => setCalName(null));
  }, []);

  useEffect(() => { refreshPerm(); refreshCal(); }, [refreshPerm, refreshCal]);

  const askNotify = async () => {
    haptic.select();
    const ok = await ensurePermission();
    refreshPerm();
    if (ok) {
      toast('通知を受け取ります');
      if (user) listSavedEvents(user.id).then(rescheduleAll).catch(() => {});
    }
  };

  const askCalendar = async () => {
    haptic.select();
    const ok = await enableDeviceCalendar();
    if (!ok) { toast('カレンダーへのアクセスを許可してください'); return; }
    setCalSheet(true);
  };

  const done = (label: string) => (
    <div className="flex items-center gap-1.5 mt-2.5">
      <Check size={15} style={{ color: 'var(--color-success)' }} />
      <span className="text-[13px]">{label}</span>
    </div>
  );

  const actionBtn = 'pressable mt-2.5 text-[13px] font-semibold px-4 py-2 rounded-full';
  const accent = { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app flex-1 flex flex-col px-5"
        style={{ paddingTop: 'calc(var(--sat) + 32px)', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>

        {step === 0 ? (
          <>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Crown size={22} style={{ color: 'var(--accent-color)' }} />
                <h1 className="text-[22px] font-bold">プレミアムプランに加入しました</h1>
              </div>
              <p className="text-[13px] text-label-secondary mb-5">次の機能が使えます。</p>
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
            <button onClick={() => { haptic.select(); setStep(1); }}
              className="pressable w-full py-3.5 rounded-full text-[15px] font-bold mt-5" style={accent}>
              次へ
            </button>
          </>
        ) : (
          <>
            <div className="flex-1">
              <h1 className="text-[22px] font-bold mb-1">次の設定をしてください。</h1>
              <p className="text-[13px] text-label-secondary mb-5">
                あとからマイページのプレミアムでも設定できます。
              </p>

              {/* 引き継ぎ（任意）。**購入画面には登録の入口を置かない**（5.1.1(v)）ので、
                  加入した人にはここが入口になる。3つのうち「今やらないと後で困る」のは
                  これだけなので一番上に置く。
                  登録しなくても「購入を復元」で購読は戻せるが、投稿やフォローは戻らない */}
              <div className="rounded-[12px] p-3.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <p className="text-[14px] font-semibold">メールアドレスを登録する（任意）</p>
                {linked ? done(accountEmail(user) ?? '登録済み') : (
                  <>
                    <p className="text-[12px] text-label-secondary mt-2.5">
                      機種変更やアプリを入れ直したあとも、そのまま使えます。
                    </p>
                    <button onClick={() => { haptic.select(); setLinkOpen(true); }}
                      className={actionBtn} style={accent}>登録する</button>
                  </>
                )}
              </div>

              {/* 通知 */}
              <div className="rounded-[12px] p-3.5 mt-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <p className="text-[14px] font-semibold">通知を許可する</p>
                {perm === 'granted' ? done('許可済み')
                  : perm === 'denied' ? (
                    <p className="text-[12px] text-label-secondary mt-2.5">
                      一度断ると、アプリからは聞き直せません。端末の「設定」→「アプリ」→「FanHive」→「通知」からONにしてください。
                    </p>
                  ) : perm === 'unsupported' ? (
                    <p className="text-[12px] text-label-secondary mt-2.5">
                      ブラウザ版では通知を出せません。アプリ版で許可してください。
                    </p>
                  ) : (
                    <button onClick={askNotify} className={actionBtn} style={accent}>許可する</button>
                  )}
              </div>

              {/* カレンダー */}
              <div className="rounded-[12px] p-3.5 mt-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <p className="text-[14px] font-semibold">カレンダーの書き込み先を選ぶ</p>
                {!deviceCalendarSupported() ? (
                  <p className="text-[12px] text-label-secondary mt-2.5">
                    この端末では直接の書き込みに対応していません。マイページの「カレンダー自動同期」から
                    購読URLを登録すると、Google・Appleのカレンダーに入ります。
                  </p>
                ) : calName ? done(calName)
                  : <button onClick={askCalendar} className={actionBtn} style={accent}>書き込み先を選ぶ</button>}
              </div>

            </div>

            <button onClick={() => { haptic.select(); navigate('/', { replace: true }); }}
              className="pressable w-full py-3.5 rounded-full text-[15px] font-bold mt-5" style={accent}>
              はじめる
            </button>
          </>
        )}
      </div>

      {linkOpen && (
        <AccountSheet
          mode="link"
          onClose={() => setLinkOpen(false)}
          onDone={() => { setLinkOpen(false); toast('登録しました'); }}
        />
      )}

      {calSheet && (
        <DeviceCalendarSheet
          open
          onClose={() => setCalSheet(false)}
          onDecide={() => { setCalSheet(false); refreshCal(); toast('カレンダーに書き込みます'); }}
        />
      )}
    </div>
  );
}
