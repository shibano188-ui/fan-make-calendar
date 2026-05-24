import { useState } from 'react';
import { Gift } from 'lucide-react';
import { requestGiftExchange, GIFT_OPTIONS, type GiftType } from '../lib/api';

type Step = 'select' | 'confirm' | 'done';

export default function GiftExchangeSheet({
  currentPoints,
  userId,
  userEmail,
  onClose,
  onExchanged,
}: {
  currentPoints: number;
  userId: string;
  userEmail: string;
  onClose: () => void;
  onExchanged: (newPoints: number) => void;
}) {
  const [step, setStep]           = useState<Step>('select');
  const [selected, setSelected]   = useState<GiftType | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const selectedOption = GIFT_OPTIONS.find(g => g.type === selected);

  const handleConfirm = async () => {
    if (!selectedOption) return;
    setLoading(true);
    setError(null);
    try {
      await requestGiftExchange(userId, userEmail, selectedOption.type, selectedOption.points);
      onExchanged(currentPoints - selectedOption.points);
      setStep('done');
    } catch {
      setError('申請に失敗しました。しばらく後にもう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={step === 'done' ? onClose : onClose} />
      <div
        className="relative bg-bg-primary rounded-t-2xl"
        style={{
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUpPanel 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
        }}
      >
        {/* ヘッダー */}
        <div style={{ flexShrink: 0 }} className="pt-3 px-4 pb-3 border-b border-faint">
          <div className="flex justify-center mb-2">
            <div className="w-10 h-1 rounded-full bg-label-tertiary/50" />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-label-primary font-semibold text-sm">ポイント交換</p>
            <button onClick={onClose} className="text-xs text-label-secondary active:opacity-60">閉じる</button>
          </div>
        </div>

        {/* コンテンツ */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'scroll',
            WebkitOverflowScrolling: 'touch',
            padding: '16px 16px 40px',
          } as React.CSSProperties}
        >
          {step === 'done' ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(52,211,153,0.15)' }}
              >
                <Gift size={28} style={{ color: '#34D399' }} />
              </div>
              <p className="text-label-primary font-bold text-lg">申請を受け付けました</p>
              <p className="text-label-secondary text-sm text-center leading-relaxed">
                数日以内に登録メールアドレス（{userEmail}）へご連絡します。
              </p>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl font-semibold text-sm active:opacity-70"
                style={{ backgroundColor: 'var(--accent-color)', color: '#fff' }}
              >
                閉じる
              </button>
            </div>
          ) : step === 'confirm' && selectedOption ? (
            <div className="flex flex-col gap-5">
              <div
                className="rounded-xl px-4 py-4 flex flex-col gap-2"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <p className="text-label-tertiary text-xs">交換内容</p>
                <p className="text-label-primary font-semibold">{selectedOption.label}</p>
                <p className="text-label-secondary text-sm">
                  {selectedOption.points.toLocaleString('ja-JP')} pt 消費
                </p>
              </div>

              <div
                className="rounded-xl px-4 py-4 flex flex-col gap-2"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <p className="text-label-tertiary text-xs">送付先メールアドレス</p>
                <p className="text-label-primary text-sm">{userEmail}</p>
              </div>

              <p className="text-label-tertiary text-[11px] leading-relaxed px-1">
                ※ 申請後、数日以内にメールにてギフトコードをお送りします。
                交換後のポイント返金はできません。
              </p>

              {error && (
                <p className="text-red-400 text-xs text-center">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep('select'); setError(null); }}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl text-sm text-label-secondary font-semibold active:opacity-70 disabled:opacity-40"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  戻る
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm text-white active:opacity-70 disabled:opacity-40"
                  style={{ backgroundColor: 'var(--accent-color)' }}
                >
                  {loading ? '申請中…' : '申請する'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* 現在のポイント */}
              <div
                className="rounded-xl px-4 py-4 flex flex-col items-center gap-1"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <span className="text-label-tertiary text-xs">現在の保有ポイント</span>
                <span className="text-label-primary text-3xl font-bold">
                  {currentPoints.toLocaleString('ja-JP')}
                </span>
                <span className="text-label-tertiary text-[11px]">pt</span>
              </div>

              {/* 交換オプション */}
              <p className="text-label-tertiary text-xs px-1">交換先を選んでください</p>
              {GIFT_OPTIONS.map(opt => {
                const canAfford = currentPoints >= opt.points;
                const isSelected = selected === opt.type;
                return (
                  <button
                    key={opt.type}
                    onClick={() => canAfford && setSelected(opt.type)}
                    disabled={!canAfford}
                    className="w-full text-left rounded-xl px-4 py-4 flex items-center justify-between transition-colors active:opacity-70 disabled:opacity-40"
                    style={{
                      backgroundColor: isSelected ? 'rgba(136,135,128,0.15)' : 'var(--bg-secondary)',
                      border: `1px solid ${isSelected ? 'var(--accent-color)' : 'var(--border-faint)'}`,
                    }}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-label-primary text-sm font-medium">{opt.label}</span>
                      {!canAfford && (
                        <span className="text-label-tertiary text-[10px]">
                          あと {(opt.points - currentPoints).toLocaleString('ja-JP')} pt 必要
                        </span>
                      )}
                    </div>
                    <span
                      className="text-sm font-bold flex-shrink-0 ml-3"
                      style={{ color: canAfford ? 'var(--accent-color)' : 'var(--label-tertiary)' }}
                    >
                      {opt.points.toLocaleString('ja-JP')} pt
                    </span>
                  </button>
                );
              })}

              <button
                onClick={() => selected && setStep('confirm')}
                disabled={!selected}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white active:opacity-70 disabled:opacity-40"
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                次へ
              </button>

              <p className="text-label-tertiary text-[10px] text-center leading-relaxed px-2">
                ※ 景品表示法に基づき、ポイントの有効期限は獲得から1年間です。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
