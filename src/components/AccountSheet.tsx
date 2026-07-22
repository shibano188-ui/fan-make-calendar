import { useState } from 'react';
import { Mail, Loader2, ArrowLeft } from 'lucide-react';
import Sheet from './ui/Sheet';
import { haptic } from '../lib/haptics';
import { startEmailLink, verifyEmailLink, startEmailSignIn, verifyEmailSignIn } from '../lib/account';

// アカウント連携シート。用途は2つ:
//  mode='link'   … この端末の匿名アカウントをメールで恒久化（データ引き継ぎ用に登録）
//  mode='signin' … 別端末で登録済みのメールでログインし、データを引き継ぐ
type Mode = 'link' | 'signin';
type Step = 'email' | 'code';

export default function AccountSheet({
  mode, onClose, onDone,
}: { mode: Mode; onClose: () => void; onDone: (email: string) => void }) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isLink = mode === 'link';
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const sendCode = async () => {
    if (!emailValid || busy) return;
    haptic.select(); setBusy(true); setErr(null);
    const r = isLink ? await startEmailLink(email) : await startEmailSignIn(email);
    setBusy(false);
    if (r.ok) { setStep('code'); } else { setErr(r.error); }
  };

  const confirm = async () => {
    if (code.trim().length < 6 || busy) return;
    haptic.select(); setBusy(true); setErr(null);
    const r = isLink ? await verifyEmailLink(email, code) : await verifyEmailSignIn(email, code);
    setBusy(false);
    if (r.ok) { haptic.success?.(); onDone(email.trim()); } else { setErr(r.error); }
  };

  const inputCls = 'w-full rounded-[10px] px-3 py-3 text-[15px] outline-none';
  const inputStyle = { backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' } as const;

  return (
    <Sheet onClose={onClose} title={isLink ? 'メールで引き継ぎを設定' : '登録済みのメールでログイン'} maxHeight="70dvh">
      <div className="px-4 pt-1 pb-4">
        {step === 'email' ? (
          <>
            <p className="text-[13px] text-label-secondary leading-relaxed mb-3">
              {isLink
                ? 'メールアドレスを登録すると、機種変更や別の端末でも同じデータ（フォロー・いいね・投稿）を引き継げます。'
                : '登録済みのメールアドレスを入力してください。確認コードを送ります。'}
            </p>
            <div className="flex items-center gap-2 rounded-[10px] px-3" style={inputStyle}>
              <Mail size={17} className="text-label-tertiary flex-shrink-0" />
              <input
                type="email" inputMode="email" autoComplete="email" autoFocus
                value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }}
                onKeyDown={(e) => e.key === 'Enter' && sendCode()}
                placeholder="you@example.com"
                className="flex-1 bg-transparent py-3 text-[15px] outline-none" style={{ color: 'var(--input-text)' }} />
            </div>
            {err && <p className="text-[12px] mt-2" style={{ color: 'var(--color-destructive)' }}>{err}</p>}
            <button onClick={sendCode} disabled={!emailValid || busy}
              className="pressable w-full mt-4 py-3 rounded-[12px] text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
              {busy && <Loader2 size={16} className="animate-spin" />} 確認コードを送る
            </button>
          </>
        ) : (
          <>
            <button onClick={() => { setStep('email'); setCode(''); setErr(null); }}
              className="pressable flex items-center gap-1 text-[13px] text-label-secondary mb-2">
              <ArrowLeft size={15} /> メール入力に戻る
            </button>
            <p className="text-[13px] text-label-secondary leading-relaxed mb-3">
              <span className="font-semibold text-label-primary">{email}</span> に届いた6桁の確認コードを入力してください。
            </p>
            <input
              inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6}
              value={code} onChange={(e) => { setCode(e.target.value.replace(/[^0-9]/g, '')); setErr(null); }}
              onKeyDown={(e) => e.key === 'Enter' && confirm()}
              placeholder="123456"
              className={`${inputCls} text-center tracking-[0.4em] text-[20px] font-bold`} style={inputStyle} />
            {err && <p className="text-[12px] mt-2" style={{ color: 'var(--color-destructive)' }}>{err}</p>}
            <button onClick={confirm} disabled={code.trim().length < 6 || busy}
              className="pressable w-full mt-4 py-3 rounded-[12px] text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
              {busy && <Loader2 size={16} className="animate-spin" />} {isLink ? '登録する' : 'ログイン'}
            </button>
            <button onClick={sendCode} disabled={busy}
              className="pressable w-full mt-2 py-2 text-[12px] text-label-tertiary">コードを再送する</button>
          </>
        )}
      </div>
    </Sheet>
  );
}
