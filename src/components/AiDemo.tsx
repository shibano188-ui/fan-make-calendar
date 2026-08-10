import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Repeat2, Share } from 'lucide-react';
import { DEMO_POST_AUTHOR, DEMO_POST_TEXT } from '../lib/demoPost';
import { haptic } from '../lib/haptics';

// 初回オンボーディングの「AI入力を使ってみる」。
//
// なぜ貼り付け欄を見せないか: 最初にテキストボックスを出すと「毎回コピーしてくるアプリ」だと
// 学習される。実際の売りはXの共有シートから選ぶだけの1タップなので、その手順をそのまま辿らせる。
//
// ここが見せるのは **共有ボタン → 共有先で FanHive** の2タップだけ。そのあとは
// モックではなく**本物の投稿画面**（/post?demo=1）へ送る。解析も販売先の自動検索も本番の処理が
// 走るので、画像・購入リンク・価格が実際に埋まるところまで見える。
//
// 共有シートは**本物そっくりには描かない**（OSのUIだと誤解させると審査で問題になりうる）。
// アイコンと文字だけの簡略化した図にしてある。
// 今はAndroidの形だけ。iOS版が存在しないので、実機で確かめられないほうを想像で描かない。

export default function AiDemo({ onSkip }: { onSkip: () => void }) {
  const navigate = useNavigate();
  const [sheet, setSheet] = useState(false);

  const toPostPage = () => {
    haptic.select();
    navigate('/post?demo=1');
  };

  return (
    <div className="fixed inset-0 z-[310] max-w-app mx-auto flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* 手順の説明。ここが読まれないと何をする画面か分からないので、
          小さく上に貼らずに、カードの手前で大きく見せる */}
      <div className="px-6 pb-5" style={{ paddingTop: 'calc(var(--sat) + 56px)' }}>
        <p className="text-[20px] font-bold leading-relaxed">
          {sheet
            ? '共有先から FanHive を選びます'
            : '気になるXの投稿を見つけたら、共有から FanHive を選ぶだけ。'}
        </p>
      </div>

      <div className="flex-1 px-5 flex flex-col justify-start min-h-0">
        <div className="rounded-[14px] border border-subtle p-3.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[15px]"
              style={{ backgroundColor: 'var(--fill-tertiary)' }}>{DEMO_POST_AUTHOR.emoji}</div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-tight">{DEMO_POST_AUTHOR.name}</p>
              <p className="text-[11px] text-label-tertiary leading-tight">{DEMO_POST_AUTHOR.handle}</p>
            </div>
          </div>
          <p className="text-[13px] leading-relaxed whitespace-pre-line">{DEMO_POST_TEXT}</p>
          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-subtle text-label-tertiary">
            <MessageCircle size={16} />
            <Repeat2 size={16} />
            <Heart size={16} />
            <button
              onClick={() => { if (!sheet) { haptic.select(); setSheet(true); } }}
              disabled={sheet}
              aria-label="共有"
              className="relative pressable tap-44 p-1 rounded-full"
              style={!sheet ? { color: 'var(--accent-text)' } : undefined}
            >
              {!sheet && (
                <span className="absolute inset-0 rounded-full animate-ping"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 35%, transparent)' }} />
              )}
              <Share size={16} className="relative" />
            </button>
          </div>
        </div>
      </div>

      {/* 共有シート（簡略化した図。OSの本物ではない） */}
      {sheet && (
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onClick={() => setSheet(false)} />
          <div className="relative rounded-t-[20px] px-5 pt-4 pb-8" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <p className="text-[12px] text-label-tertiary mb-3">共有</p>
            <div className="flex gap-5">
              {[
                { label: 'FanHive', emoji: '', on: true },
                { label: 'コピー', emoji: '🔗', on: false },
                { label: 'メール', emoji: '✉️', on: false },
              ].map((a) => (
                <button key={a.label} disabled={!a.on} onClick={toPostPage}
                  className="relative flex flex-col items-center gap-1.5 pressable">
                  {a.on && (
                    <span className="absolute top-0 w-12 h-12 rounded-[14px] animate-ping"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 35%, transparent)' }} />
                  )}
                  {a.on ? (
                    /* 本物のアプリアイコン。ここだけ絵文字だと「別のアプリ」に見える */
                    <img src="/icon-512.png" alt="" className="relative w-12 h-12 rounded-[14px] object-cover" />
                  ) : (
                    <span className="relative w-12 h-12 rounded-[14px] flex items-center justify-center text-[20px]"
                      style={{ backgroundColor: 'var(--fill-tertiary)', opacity: 0.45 }}>{a.emoji}</span>
                  )}
                  <span className="text-[11px]" style={{ opacity: a.on ? 1 : 0.45 }}>{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="px-5" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
        <button onClick={() => { haptic.select(); onSkip(); }}
          className="w-full py-2.5 text-[13px] text-label-tertiary pressable">
          スキップ
        </button>
      </div>
    </div>
  );
}
