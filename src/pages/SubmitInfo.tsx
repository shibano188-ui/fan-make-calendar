import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { haptic } from '../lib/haptics';
import { submitInfo, listMyInfoSubmissions, searchWorks, type InfoSubmission, type Work } from '../lib/api';

// 情報を送る（2026-09-29 投稿の方法の作り直し）。
// 入れてもらうのは作品名・URL（いくつでも）・一言（任意）だけ。フォームを埋める手間を無くす。
// 中身の読み取りと公開はボット（api/_submissions.ts）が10分おきに最優先でやる:
//   Xのポスト・巡回先の店の一覧で、日付とタイトルが読めて、同じ予定が無い → 送った人を投稿者にして公開
//   同じ予定がある → その予定にURLを足す ／ それ以外 → 運営の確認待ち
// 送ったものの結果は、この画面の下に出す（自分の送ったものだけ）。

const inputCls = 'w-full rounded-[10px] px-3 py-2.5 text-[14px] outline-none';
const inputStyle = { backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' };
const labelCls = 'text-[12px] text-label-secondary mb-1 mt-4';

const STATUS_LABEL: Record<InfoSubmission['status'], { text: string; color: string }> = {
  pending: { text: '確認中', color: 'var(--label-secondary)' },
  published: { text: '登録しました', color: 'var(--color-success)' },
  merged: { text: '既存の予定に追加しました', color: 'var(--color-success)' },
  needs_review: { text: '運営が確認しています', color: 'var(--color-warning)' },
  rejected: { text: '登録できませんでした', color: 'var(--color-destructive)' },
};

const isUrl = (s: string) => /^https?:\/\/\S+\.\S+/.test(s.trim());

export default function SubmitInfo() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [workName, setWorkName] = useState('');
  const [matches, setMatches] = useState<Work[]>([]);
  const [urls, setUrls] = useState<string[]>(['']);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<InfoSubmission[]>([]);

  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  };

  const reload = () => { if (user) listMyInfoSubmissions(user.id).then(setMine).catch(() => {}); };
  useEffect(reload, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 作品名の候補（表記ゆれを揃えるため。候補に無い名前でもそのまま送れる）
  useEffect(() => {
    const q = workName.trim();
    if (!q) { setMatches([]); return; }
    let alive = true;
    const t = setTimeout(() => { searchWorks(q).then((r) => alive && setMatches(r.filter((w) => w.name !== q).slice(0, 4))).catch(() => {}); }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [workName]);

  const filledUrls = urls.map((u) => u.trim()).filter(Boolean);
  const badUrl = filledUrls.some((u) => !isUrl(u));
  const ready = !!workName.trim() && filledUrls.length > 0 && !badUrl && !busy;

  const send = async () => {
    if (!ready) return;
    haptic.select();
    setBusy(true);
    try {
      await submitInfo({ workName, urls: filledUrls, comment });
      toast('送りました。内容を確認して登録します（数分〜）');
      setUrls(['']); setComment('');
      reload();
    } catch {
      toast('送れませんでした。時間をおいてお試しください', 'error');
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app">
        <div className="sticky top-0 z-20 flex items-center gap-1 px-3 py-2.5 material-bar scroll-edge" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
          <button onPointerDown={(e) => { e.preventDefault(); goBack(); }} aria-label="閉じる" className="pressable tap-44 p-1"><X size={22} /></button>
          <span className="font-semibold">情報を送る</span>
        </div>

        <div className="px-4 pb-10">
          <p className="text-[13px] text-label-secondary leading-relaxed mt-2">
            見つけた情報のURLを送ってください。内容の読み取りと登録はFanHiveが行います。
          </p>

          <div className={labelCls}>作品名 <span style={{ color: 'var(--color-destructive)' }}>*</span></div>
          <input value={workName} onChange={(e) => setWorkName(e.target.value)} placeholder="例: 葬送のフリーレン" className={inputCls} style={inputStyle} />
          {matches.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {matches.map((w) => (
                <button key={w.id} onClick={() => { haptic.select(); setWorkName(w.name); setMatches([]); }}
                  className="pressable text-[12px] px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
                  {w.name}
                </button>
              ))}
            </div>
          )}

          <div className={labelCls}>URL <span style={{ color: 'var(--color-destructive)' }}>*</span></div>
          <div className="flex flex-col gap-2">
            {urls.map((u, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={u} inputMode="url" placeholder="Xのポスト・公式サイト・通販のページなど"
                  onChange={(e) => setUrls(urls.map((r, j) => (j === i ? e.target.value : r)))}
                  className={inputCls} style={inputStyle} />
                {urls.length > 1 && (
                  <button onClick={() => { haptic.select(); setUrls(urls.filter((_, j) => j !== i)); }}
                    aria-label="この行を消す" className="pressable tap-44 text-label-tertiary flex-shrink-0"><X size={16} /></button>
                )}
              </div>
            ))}
            {urls.length < 10 && (
              <button onClick={() => { haptic.select(); setUrls([...urls, '']); }} disabled={!urls[urls.length - 1].trim()}
                aria-label="URLを増やす" className="pressable self-start tap-44 py-1"
                style={{ color: urls[urls.length - 1].trim() ? 'var(--accent-text)' : 'var(--label-tertiary)' }}>
                <Plus size={18} strokeWidth={3} />
              </button>
            )}
            {badUrl && <p className="text-[12px]" style={{ color: 'var(--color-destructive)' }}>URLの形になっていないものがあります</p>}
          </div>

          <div className={labelCls}>ひとこと（任意）</div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 500))} rows={3}
            placeholder="例: 受注は10/20まで。会場限定もあるみたいです"
            className={`${inputCls} resize-none`} style={inputStyle} />

          <button onClick={send} disabled={!ready}
            className="pressable w-full mt-5 py-3 rounded-full text-[15px] font-semibold flex items-center justify-center gap-1.5"
            style={ready ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)' }}>
            <Send size={16} /> 送る
          </button>

          {mine.length > 0 && (
            <div className="mt-8">
              <div className="text-[12px] text-label-secondary mb-2">送った情報</div>
              <div className="flex flex-col divide-y divide-[var(--separator)]">
                {mine.map((m) => {
                  const st = STATUS_LABEL[m.status];
                  return (
                    <div key={m.id} className="py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium flex-1 min-w-0 truncate">{m.workName}</span>
                        <span className="text-[12px] font-semibold flex-shrink-0" style={{ color: st.color }}>{st.text}</span>
                      </div>
                      <div className="text-[12px] text-label-tertiary truncate mt-0.5">{m.urls.join('  ')}</div>
                      {m.reason && m.status !== 'pending' && <div className="text-[12px] text-label-secondary mt-0.5">{m.reason}</div>}
                      {m.resultEventIds.length > 0 && (
                        <button onClick={() => navigate(`/item/${m.resultEventIds[0]}`)}
                          className="pressable text-[12px] mt-1 underline" style={{ color: 'var(--accent-text)' }}>
                          登録された予定を見る
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
