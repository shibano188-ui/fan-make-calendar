import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { getOrCreateIcsToken, regenerateIcsToken, icsSubscribeUrl, icsWebcalUrl } from '../lib/api';
import { openExternal } from '../lib/openExternal';
import { useConfirm } from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';
import { haptic } from '../lib/haptics';

// 外部カレンダー連携（プレミアム）。**購読URLだけ**で連携する（2026-09-19 本人判断）。
//
// 端末のカレンダーへ直接書き込む方式はやめた。URL購読なら Apple / Google / Outlook のどれにも入り、
// やめたいときはカレンダーごと消せば一度に消える。予定の日付が変わっても次の更新で置き換わる。
// 配信は api/ics.ts。プレミアムが切れると空のカレンダーを返すので、解約後は中身が消える。
//
// URLは開いたときに初めて作る（使わない人の行を作らない）。

export default function CalendarSubscribe({ userId }: { userId: string }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Apple のカレンダーは Android に無い（webcal: を受けるアプリも無い）ので出さない
  const isAndroid = Capacitor.getPlatform() === 'android' || /Android/i.test(navigator.userAgent);

  useEffect(() => {
    getOrCreateIcsToken(userId).then((t) => { setToken(t); setFailed(!t); }).catch(() => setFailed(true));
  }, [userId]);

  const https = token ? icsSubscribeUrl(token) : null;
  const webcal = token ? icsWebcalUrl(token) : null;

  const onCopy = async () => {
    if (!https) return;
    haptic.select();
    try { await navigator.clipboard.writeText(https); toast('URLをコピーしました'); }
    catch { toast('コピーできませんでした。長押しで選択してください'); }
  };

  const onRegen = async () => {
    haptic.select();
    const ok = await confirm({ title: 'URLを作り直しますか？', message: '今のURLで購読しているカレンダーは更新されなくなります', confirmLabel: '作り直す', destructive: true });
    if (!ok) return;
    const t = await regenerateIcsToken(userId);
    if (t) { setToken(t); toast('新しいURLを作りました'); }
    else toast('作り直せませんでした', 'error');
  };

  if (failed) return <p className="text-[12px] text-label-secondary">URLを作れませんでした。時間をおいて開き直してください。</p>;

  const btn = 'pressable w-full flex items-center justify-center px-3 py-2.5 rounded-[10px] text-[13px] font-semibold';
  const accent = { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] text-label-secondary">
        いいねした予定と自分の投稿が、使っているカレンダーに自動で入ります。登録は1回だけです。
      </p>

      {/* Apple: webcal: を開くと購読の画面がそのまま出る（iPhone・iPad・Mac） */}
      {!isAndroid && (
        <a href={webcal ?? undefined} onClick={() => haptic.select()} aria-disabled={!webcal}
          className={btn} style={accent}>Appleのカレンダーに追加</a>
      )}
      {/* Google: スマホのアプリには「URLで追加」が無いので、ブラウザ版の追加画面を cid で開く */}
      <button disabled={!webcal} className={btn} style={accent}
        onClick={() => { haptic.select(); if (webcal) openExternal(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`); }}>
        Googleカレンダーに追加
      </button>
      {/* Outlook: Web版の「Webから追加」を開く */}
      <button disabled={!https} className={btn} style={accent}
        onClick={() => { haptic.select(); if (https) openExternal(`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=FanHive`); }}>
        Outlookに追加
      </button>

      {/* ほかのカレンダーアプリ用 */}
      <div className="flex gap-2 mt-1">
        <input readOnly value={https ?? '準備中…'} onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 rounded-[10px] px-3 py-2 text-[11px] outline-none"
          style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' }} />
        <button onClick={onCopy} disabled={!https}
          className="pressable px-3 rounded-[10px] text-[12px] font-semibold flex-shrink-0"
          style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>URLをコピー</button>
      </div>
      <button onClick={onRegen} className="pressable text-[11px] text-label-tertiary text-left">
        URLを作り直す（今のURLは使えなくなります）
      </button>
    </div>
  );
}
