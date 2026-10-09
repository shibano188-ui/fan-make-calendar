import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

// 共有された予定のページ（/e/:id）の、X などのクローラー向けの入口（api/ics.ts に相乗り。関数は12個が上限）。
//   share-page  … vercel.json でクローラーの UA だけここへ流す。カード用の meta を入れた HTML を返す
//                 （人は SPA の /e/:id をそのまま開く。src/pages/SharedItem.tsx）
//   share-image … X のカードの画像（1200x630）。作品名・タイトル・日付・「あと◯日」。商品画像は使わない
// 日付の書き方はアプリ（src/design/tokens.ts の itemDateLines）に合わせているが、src は読み込まずにここで書く

const SITE = 'https://fanhive.jp';
const HONEY = '#FBC000';

type Row = {
  id: string; title: string; type: string | null;
  event_date: string | null; end_date: string | null; date_label: string | null; event_time: string | null;
  preorder_start_date: string | null; preorder_end_date: string | null;
  works: { name: string } | null;
};

async function loadEvent(id: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
  const { data } = await db.from('events')
    .select('id, title, type, event_date, end_date, date_label, event_time, preorder_start_date, preorder_end_date, works(name)')
    .eq('id', id).maybeSingle();
  return (data as unknown as Row | null) ?? null;
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function dateLines(e: Row): string[] {
  const lines: string[] = [];
  if (e.preorder_start_date && e.preorder_end_date) lines.push(`予約・受注 ${md(e.preorder_start_date)}〜${md(e.preorder_end_date)}`);
  else if (e.preorder_end_date) lines.push(`予約・受注 〜${md(e.preorder_end_date)}`);
  else if (e.preorder_start_date) lines.push(`予約・受注 ${md(e.preorder_start_date)}〜`);
  const head = e.type === 'goods' ? '発売' : '開催';
  if (e.date_label) lines.push(`${head} ${formatDateLabel(e.event_date, e.date_label)}`);
  else if (e.event_date) {
    const period = e.end_date && e.end_date !== e.event_date ? `${md(e.event_date)}〜${md(e.end_date)}` : md(e.event_date);
    lines.push(`${head} ${period}${e.event_time ? ` ${e.event_time.slice(0, 5)}` : ''}`);
  }
  if (lines.length === 0) lines.push('日付未定');
  return lines;
}

const SEASON_LABELS = ['春頃', '夏頃', '秋頃', '冬頃'];
function formatDateLabel(date: string | null, label: string): string {
  const m = date ? Number(date.slice(5, 7)) : 0;
  const y = date && date.slice(0, 4) !== todayJst().slice(0, 4) ? `${date.slice(0, 4)}年` : '';
  if (SEASON_LABELS.includes(label)) return `${y}${label}`;
  if (label === '中') return m ? `${y}${m}月` : '月内';
  return m ? `${y}${m}月${label}` : label;
}

function todayJst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 一番近い節目までの日数（「予約締切まで あと6日」）。過ぎたものは数えない */
function countdown(e: Row): string | null {
  const today = todayJst();
  const days = (d: string) => Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000);
  const head = e.type === 'goods' ? '発売' : '開催';
  const cands: [string, string | null][] = [
    ['予約開始', e.preorder_start_date], ['予約締切', e.preorder_end_date], [head, e.date_label ? null : e.event_date],
  ];
  for (const [label, d] of cands) {
    if (!d) continue;
    const n = days(d);
    if (n === 0) return `${label}は今日`;
    if (n > 0) return `${label}まで あと${n}日`;
  }
  return null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

async function sharePage(res: VercelResponse, id: string) {
  const e = await loadEvent(id);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  const url = `${SITE}/e/${id}`;
  if (!e) return res.status(404).send(`<!doctype html><meta charset="utf-8"><title>FanHive</title><a href="${SITE}/lp">FanHive</a>`);
  const work = e.works?.name ?? '';
  const title = work ? `${e.title}｜${work}` : e.title;
  const desc = [...dateLines(e), countdown(e)].filter(Boolean).join(' / ');
  // 画像の URL に日付を入れる（X は画像を URL ごとに長く覚えるので、「あと◯日」を日ごとに作り直させる）
  const image = `${SITE}/api/ics?action=share-image&id=${id}&d=${todayJst()}`;
  res.status(200).send(`<!doctype html>
<html lang="ja"><head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="FanHive">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
</head><body>
<h1>${esc(e.title)}</h1><p>${esc(work)}</p><p>${esc(desc)}</p><a href="${url}">FanHive で見る</a>
</body></html>`);
}

/** Google Fonts から、カードに出す文字だけの Noto Sans JP を取る（ttf。User-Agent を付けないと ttf が返る） */
async function loadFont(text: string, weight: number): Promise<ArrayBuffer> {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}&text=${encodeURIComponent(text)}`).then((r) => r.text());
  const src = css.match(/src: url\((.+?)\) format/)?.[1];
  if (!src) throw new Error('font');
  return fetch(src).then((r) => r.arrayBuffer());
}

// satori の要素（JSX を使わずに書く）
type El = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): El =>
  ({ type, props: { style, children, ...extra } });

async function shareImage(res: VercelResponse, id: string) {
  const e = await loadEvent(id);
  if (!e) return res.status(404).end();
  const work = e.works?.name ?? '';
  const lines = dateLines(e);
  const cd = countdown(e);
  const title = e.title.length > 36 ? `${e.title.slice(0, 35)}…` : e.title;
  const text = [work, title, ...lines, cd ?? '', 'FanHive推し活の予定、ぜんぶここに。…'].join('');
  const [bold, regular, icon] = await Promise.all([
    loadFont(text, 700), loadFont(text, 400),
    fetch(`${SITE}/icon-512.png`).then((r) => r.arrayBuffer()),
  ]);

  const body = h('div', {
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexGrow: 1,
    padding: '44px 72px 48px',
  }, [
    h('div', { display: 'flex', flexDirection: 'column' }, [
      work ? h('div', { fontSize: 40, fontWeight: 700, color: '#8a6400' }, work) : null,
      h('div', { fontSize: 56, fontWeight: 700, lineHeight: 1.3, marginTop: 8, display: 'flex' }, title),
      h('div', { display: 'flex', flexDirection: 'column', marginTop: 20, fontSize: 34, fontWeight: 400, color: '#444' },
        lines.map((l) => h('div', {}, l))),
    ].filter(Boolean)),
    h('div', { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }, [
      cd ? h('div', { fontSize: 40, fontWeight: 700, background: HONEY, color: '#1a1a1a', padding: '10px 28px', borderRadius: 999 }, cd) : h('div', {}, ''),
      h('div', { display: 'flex', alignItems: 'center' }, [
        h('img', { width: 64, height: 64, borderRadius: 14 }, undefined, { src: `data:image/png;base64,${Buffer.from(icon).toString('base64')}`, width: 64, height: 64 }),
        h('div', { display: 'flex', flexDirection: 'column', marginLeft: 16 }, [
          h('div', { fontSize: 34, fontWeight: 700 }, 'FanHive'),
          h('div', { fontSize: 20, fontWeight: 400, color: '#666' }, '推し活の予定、ぜんぶここに。'),
        ]),
      ]),
    ]),
  ]);
  const root = h('div', {
    width: 1200, height: 630, display: 'flex', flexDirection: 'column', background: '#fffdf7',
    fontFamily: 'Noto Sans JP', color: '#1a1a1a',
  }, [h('div', { height: 20, background: HONEY }), body]);

  const svg = await satori(root as never, {
    width: 1200, height: 630,
    fonts: [
      { name: 'Noto Sans JP', data: bold, weight: 700, style: 'normal' },
      { name: 'Noto Sans JP', data: regular, weight: 400, style: 'normal' },
    ],
  });
  const buf = new Resvg(svg).render().asPng();
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, s-maxage=86400');
  res.status(200).send(buf);
}

export async function shareHandler(req: VercelRequest, res: VercelResponse, action: string) {
  const id = String(req.query.id ?? '');
  if (action === 'share-page') return sharePage(res, id);
  if (action === 'share-image') return shareImage(res, id);
  return res.status(404).end();
}
