import { useEffect, useState } from 'react';
import { Heart, MessageCircle, Repeat2, Share, Sparkles } from 'lucide-react';
import { parseEventsApi, type ParsedEvent } from '../lib/parseEvents';
import LineLoader from './ui/LineLoader';
import { haptic } from '../lib/haptics';

// 初回オンボーディングの「AI入力を使ってみる」。
//
// なぜ貼り付け欄を見せないか: 最初にテキストボックスを出すと「毎回コピーしてくるアプリ」だと
// 学習される。実際の売りはXの共有シートから選ぶだけの1タップなので、その手順をそのまま辿らせる。
//
// 手順は本物と同じ3タップ: ポストの共有ボタン → 共有先で FanHive → 埋まる。
// 共有シートは**本物そっくりには描かない**（OSのUIだと誤解させると審査で問題になりうる）。
// アイコンと文字だけの簡略化した図にしてある。
//
// 解析は本物のAPIを呼ぶ。作り物の結果を見せると実際の精度と食い違うため。
// 失敗したときだけ用意した結果に差し替えて、初回体験が失敗で終わらないようにする。
//
// 今はAndroidの共有シートの形だけ作ってある。iOS版が存在しないので、実機で確かめられない
// ほうを想像で描かない方針（iOS展開時に SHEET_STYLE を分岐させて足す）。

const SAMPLE_POST = `【予約受付開始のお知らせ】
「ほしぞら喫茶」アクリルスタンド 全6種

8月20日(木) 10:00より受付開始
価格 各1,320円(税込)
発売は11月中旬を予定しています`;

// APIが落ちたときだけ使う。上のサンプルから取れるはずの内容と揃えてある
const FALLBACK: ParsedEvent = {
  title: 'ほしぞら喫茶 アクリルスタンド 全6種',
  work: 'ほしぞら喫茶', price: 1320,
  date: '2026-11-15', dateLabel: '中旬', time: null, endDate: null, endTime: null,
  category: 'グッズ', prefecture: null, locationDetail: null, link: null,
  memo: null, imageUrl: null, sourceUrl: null,
  isOrderMade: true, preorderStart: '2026-08-20', preorderEnd: null, sellsGoods: false,
};

// 投稿画面のモックで使う見た目（PostNew と揃える）
const inputCls = 'w-full rounded-[10px] px-3 py-2.5 text-[14px]';
const inputStyle = { backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' };
const labelCls = 'text-[12px] text-label-secondary mb-1 mt-4';

type Step = 'post' | 'sheet' | 'loading' | 'form';

export default function AiDemo({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('post');
  const [result, setResult] = useState<ParsedEvent | null>(null);

  // 「FanHiveに共有」を押した時点で解析を始める（見せているのは本物の処理）
  useEffect(() => {
    if (step !== 'loading') return;
    let alive = true;
    const started = Date.now();
    parseEventsApi({ url: SAMPLE_POST })
      .then((events) => (alive ? events[0] ?? FALLBACK : null))
      .catch(() => (alive ? FALLBACK : null))
      .then((r) => {
        if (!alive || !r) return;
        // 速すぎると何が起きたか分からないので、最低1.2秒は読み取っている状態を見せる
        const wait = Math.max(0, 1200 - (Date.now() - started));
        setTimeout(() => { if (alive) { setResult(r); setStep('form'); haptic.select(); } }, wait);
      });
    return () => { alive = false; };
  }, [step]);

  const dateText = (d: string) => {
    const [y, m, day] = d.split('-');
    return `${y}年${Number(m)}月${Number(day)}日`;
  };

  // ── 投稿画面のモック。**保存はしない**。
  // 例の予定は架空の作品なので、本当に登録すると他の人の「探す」に実在しない予定が流れる。
  // 「投稿する」は手順を最後まで見せるためだけのボタンで、押したらオンボーディングに戻る。
  if (step === 'form' && result) {
    return (
      <div className="fixed inset-0 z-[310] max-w-app mx-auto flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-subtle" style={{ paddingTop: 'max(12px, var(--sat))' }}>
          <span className="text-[16px] font-bold flex-1">新しい予定</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' }}>例</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <div className="flex items-center gap-1.5 mt-3 rounded-[10px] px-3 py-2.5" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
            <Sparkles size={14} className="flex-shrink-0" style={{ color: 'var(--accent-color)' }} />
            <span className="text-[12px]">AIが入力しました。あとは確認するだけです</span>
          </div>

          <div className={labelCls}>作品</div>
          <div className={inputCls} style={inputStyle}>{result.work ?? FALLBACK.work}</div>

          <div className={labelCls}>タイトル</div>
          <div className={inputCls} style={inputStyle}>{result.title}</div>

          {result.price != null && (
            <>
              <div className={labelCls}>価格</div>
              <div className={inputCls} style={inputStyle}>¥{result.price.toLocaleString('ja-JP')}</div>
            </>
          )}
          {result.preorderStart && (
            <>
              <div className={labelCls}>受付開始</div>
              <div className={inputCls} style={inputStyle}>{dateText(result.preorderStart)}</div>
            </>
          )}
          {(result.date || result.dateLabel) && (
            <>
              <div className={labelCls}>発売</div>
              <div className={inputCls} style={inputStyle}>
                {result.date ? `${dateText(result.date)}${result.dateLabel ? `（${result.dateLabel}）` : ''}` : result.dateLabel}
              </div>
            </>
          )}
        </div>

        <div className="px-5 pt-3 border-t border-subtle" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          <button onClick={() => { haptic.select(); onDone(); }}
            className="w-full py-3.5 rounded-full text-[15px] font-bold pressable"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
            投稿する
          </button>
          <p className="text-[11px] text-label-tertiary mt-2 text-center leading-relaxed">
            これは例なので投稿はされません。次は自分の推しの告知でどうぞ。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[310] max-w-app mx-auto flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="px-5 pt-4 pb-2" style={{ paddingTop: 'max(16px, var(--sat))' }}>
        <p className="text-[13px] text-label-secondary">
          {step === 'post' ? 'Xで見つけた告知の例です。共有ボタンを押してみてください'
            : step === 'sheet' ? '共有先から FanHive を選びます'
            : 'AIが読み取っています'}
        </p>
      </div>

      <div className="flex-1 px-5 flex flex-col justify-center gap-4 min-h-0">
        {/* Xのポスト（例） */}
        <div className="rounded-[14px] border border-subtle p-3.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[13px]"
              style={{ backgroundColor: 'var(--fill-tertiary)' }}>☕️</div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-tight">ほしぞら喫茶 公式（例）</p>
              <p className="text-[11px] text-label-tertiary leading-tight">@hoshizora_cafe</p>
            </div>
          </div>
          <p className="text-[13px] leading-relaxed whitespace-pre-line">{SAMPLE_POST}</p>
          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-subtle text-label-tertiary">
            <MessageCircle size={16} />
            <Repeat2 size={16} />
            <Heart size={16} />
            <button
              onClick={() => { if (step === 'post') { haptic.select(); setStep('sheet'); } }}
              disabled={step !== 'post'}
              aria-label="共有"
              className="relative pressable tap-44 p-1 rounded-full"
              style={step === 'post' ? { color: 'var(--accent-text)' } : undefined}
            >
              {step === 'post' && (
                <span className="absolute inset-0 rounded-full animate-ping"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 35%, transparent)' }} />
              )}
              <Share size={16} className="relative" />
            </button>
          </div>
        </div>

        {step === 'loading' && <LineLoader label="予定にしています…" />}
      </div>

      {/* 共有シート（簡略化した図。OSの本物ではない） */}
      {step === 'sheet' && (
        <div className="absolute inset-0 flex flex-col justify-end" onClick={() => { haptic.select(); setStep('loading'); }}>
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} />
          <div className="relative rounded-t-[20px] px-5 pt-4 pb-8" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <p className="text-[12px] text-label-tertiary mb-3">共有</p>
            <div className="flex gap-5">
              {[
                { label: 'FanHive', emoji: '🐝', on: true },
                { label: 'コピー', emoji: '🔗', on: false },
                { label: 'メール', emoji: '✉️', on: false },
              ].map((a) => (
                <button key={a.label} disabled={!a.on}
                  onClick={() => { if (a.on) { haptic.select(); setStep('loading'); } }}
                  className="relative flex flex-col items-center gap-1.5 pressable">
                  {a.on && (
                    <span className="absolute top-0 w-12 h-12 rounded-full animate-ping"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 35%, transparent)' }} />
                  )}
                  <span className="relative w-12 h-12 rounded-full flex items-center justify-center text-[20px]"
                    style={{ backgroundColor: 'var(--fill-tertiary)', opacity: a.on ? 1 : 0.45 }}>{a.emoji}</span>
                  <span className="text-[11px]" style={{ opacity: a.on ? 1 : 0.45 }}>{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="px-5" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
        <button onClick={() => { haptic.select(); onDone(); }}
          className="w-full py-2.5 text-[13px] text-label-tertiary pressable">
          スキップ
        </button>
      </div>
    </div>
  );
}
