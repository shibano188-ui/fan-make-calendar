// SNS に出す予定表の対象の作品と、作品ごとの色・見出しの飾り。
// 作品名は works.name と完全に一致させる。フォントは全作品で同じ（変えるとAIっぽく見えるため・柴野 2026-09-29）。
// 見出しの飾りは色・縁取り・グラデーション・影だけで、ロゴの形は真似ない（商標・公式との混同を避ける）。
export const WORKS = [
  {
    name: '葬送のフリーレン',
    color: '#3f8f86', // フリーレンの髪・装いの青緑
    title: 'background:linear-gradient(90deg,#2f7d74,#6aa89a 55%,#a88a3d); -webkit-background-clip:text; color:transparent;',
  },
  {
    name: '呪術廻戦',
    color: '#4b3b8f', // 呪力の紫
    title: 'color:#1d1d1f; text-shadow:0 0 18px rgba(92,64,190,.5), 3px 3px 0 #4b3b8f;',
  },
  {
    name: 'ハイキュー!!',
    color: '#e0620d', // 烏野のオレンジ
    title: 'color:#e0620d; -webkit-text-stroke:3px #1d1d1f; paint-order:stroke fill;',
  },
  {
    name: '進撃の巨人',
    color: '#6b4a2b', // 調査兵団の革ベルト・マントの茶
    title: 'background:linear-gradient(180deg,#b8ad96 0%,#7a6a50 45%,#3e3120 100%); -webkit-background-clip:text; color:transparent;',
  },
  {
    name: '鬼滅の刃',
    color: '#b3263a', // ロゴ・日輪刀の赤
    title: 'color:#1d1d1f; text-shadow:3px 3px 0 #b3263a;',
  },
  {
    name: '僕のヒーローアカデミア',
    color: '#1f8a4c', // デクのヒーロースーツ・ロゴの緑
    title: 'color:#1f8a4c; -webkit-text-stroke:3px #10331f; paint-order:stroke fill; text-shadow:4px 4px 0 #f2c230;',
  },
  {
    name: 'ちいかわ',
    color: '#d9669a', // ちいかわのほっぺのピンク（文字として読める濃さに寄せた）
    title: 'color:#d9669a; -webkit-text-stroke:6px #fff; paint-order:stroke fill; text-shadow:0 4px 0 #f3c1d6;',
  },
  {
    name: 'ブルーロック',
    color: '#1f63c6', // ロゴ・ユニフォームの青
    title: 'background:linear-gradient(180deg,#3d8bff,#0b2f86); -webkit-background-clip:text; color:transparent;',
  },
];
