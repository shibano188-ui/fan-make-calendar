// 販路として保存された短縮URL（x.gd / bit.ly 等）を実URLへ展開する一度きりの掃除。
// 以後の投稿は api/parse-event.ts の expandEventLinks が保存前に展開するので、これは既存データ用。
// 実行: node scripts/expand-short-offer-urls.mjs        （下見だけ・書き込まない）
//       node scripts/expand-short-offer-urls.mjs --apply（更新する。前に backups/ へ元データを保存）
import fs from 'node:fs';
import path from 'node:path';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, '')]),
);
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ref = JSON.parse(Buffer.from(KEY.split('.')[1], 'base64url')).ref;
const URL_BASE = `https://${ref}.supabase.co/rest/v1`;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// api/parse-event.ts の SHORTENER_HOSTS と同期を保つこと
const SHORTENER_HOSTS = /^(t\.co|x\.gd|bit\.ly|bitly\.com|tinyurl\.com|is\.gd|v\.gd|ow\.ly|buff\.ly|cutt\.ly|rebrand\.ly|shorturl\.at|s\.id|onl\.(bz|sc)|urx\d?\.(blue|nu)|ur0\.(link|work)|amzn\.(to|asia)|a\.r10\.to)$/i;
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } };
const isShort = (u) => SHORTENER_HOSTS.test(hostOf(u));

// api/parse-event.ts の deMojibake と同期を保つこと（リダイレクト先の日本語パスが二重エンコードされる）
function deMojibake(url) {
  try {
    const u = new URL(url);
    const dec = decodeURIComponent(u.pathname);
    if (!/[\u0080-\u00ff]/.test(dec)) return url;
    const fixed = Buffer.from(dec, 'latin1').toString('utf8');
    if (fixed.includes('\uFFFD')) return url;
    u.pathname = fixed;
    return u.toString();
  } catch { return url; }
}

const ok = async (url) => {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FanHive/1.0)' }, signal: AbortSignal.timeout(10000) });
    return r.status < 400;
  } catch { return false; }
};

async function resolve(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FanHive/1.0)' }, signal: AbortSignal.timeout(8000) });
    const final = deMojibake(res.url);
    if (!final || isShort(final) || /twitter\.com|x\.com/.test(final)) return null;
    // 生きている短縮URLを壊れたURLに置き換えないよう、書き込む前に到達確認する
    if (!(await ok(final))) { console.log(`  ! 展開先が開けない(${final})`); return null; }
    return final;
  } catch { return null; }
}

const apply = process.argv.includes('--apply');
const rows = await (await fetch(`${URL_BASE}/events?select=id,title,retailer,link_url,affiliate_url,offers`, { headers: H })).json();
const targets = rows.filter((r) => (r.offers ?? []).some((o) => isShort(o.url)) || isShort(r.link_url ?? ''));
console.log(`短縮URLを持つ行: ${targets.length}件`);

if (apply && targets.length) {
  const dir = path.join('backups', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'events-short-urls.json'), JSON.stringify(targets, null, 2));
  console.log(`元データを ${dir} に保存`);
}

for (const r of targets) {
  const offers = structuredClone(r.offers ?? []);
  const patch = {};
  let changed = false;
  for (const o of offers) {
    if (!isShort(o.url)) continue;
    const final = await resolve(o.url);
    if (!final) { console.log(`  ! 展開できず: ${o.url}`); continue; }
    console.log(`  ${o.url} -> ${final}`);
    // 短縮ホストのままだった retailer / affiliateUrl も実URLの店に合わせる。
    // アフィ変換はクライアントの offerUrl が表示時に行うので、ここでは素のURLを入れる。
    if (o.affiliateUrl === o.url || isShort(o.affiliateUrl ?? '')) o.affiliateUrl = final;
    if (!o.retailer || isShort(`https://${o.retailer}`)) o.retailer = hostOf(final);
    if (r.link_url === o.url) { patch.link_url = final; patch.retailer = hostOf(final); }
    if (r.affiliate_url === o.url) patch.affiliate_url = final;
    o.url = final;
    changed = true;
  }
  if (changed) patch.offers = offers;
  // offers を持たない行（イベントの関連リンク等）は link_url だけが短縮のまま残っている。
  // 詳細ページは getOffers の旧 link フォールバックでこれを1販路として表示するので同じく展開する。
  if (!changed && isShort(r.link_url ?? '')) {
    const final = await resolve(r.link_url);
    if (final) {
      console.log(`  ${r.link_url} -> ${final}`);
      patch.link_url = final;
      patch.retailer = hostOf(final);
      if (r.affiliate_url === r.link_url) patch.affiliate_url = final;
      changed = true;
    } else console.log(`  ! 展開できず: ${r.link_url}`);
  }
  if (!changed) continue;
  console.log(`${r.title}: ${Object.keys(patch).join(', ')} を更新${apply ? '' : '（下見）'}`);
  if (!apply) continue;
  const res = await fetch(`${URL_BASE}/events?id=eq.${r.id}`, { method: 'PATCH', headers: H, body: JSON.stringify(patch) });
  if (!res.ok) console.error(`  更新失敗: ${res.status} ${await res.text()}`);
}
console.log(apply ? '完了' : '下見のみ。--apply を付けると更新します');
