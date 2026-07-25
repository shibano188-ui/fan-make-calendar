import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { searchCandidates, highConfidence, scoreTitle, isSetTitle, type Candidate } from './_product-search.js';

// 毎日Cron: グッズの販路を最新化する。
// (1) 既存のアフィ販路の価格を再取得して更新（鮮度維持）
// (2) アフィ販路が1つも無いグッズに高信頼候補を自動バックフィル（過去投稿の取りこぼし回収）
// Vercel Cron は CRON_SECRET 設定時に `Authorization: Bearer <secret>` を付けて呼ぶ。

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const AFFILIATE_HOSTS = ['px.a8.net', 'ck.jp.ap.valuecommerce.com', 'hb.afl.rakuten.co.jp'];
function hostOf(u: string): string { try { return new URL(u).host.toLowerCase(); } catch { return ''; } }
// src/lib/affiliate.ts の isAffiliateUrl と同じ判定（実際に成果識別子が乗ったURLか）。
function isAffiliateUrl(u: string): boolean {
  const h = hostOf(u);
  if (!h) return false;
  if (AFFILIATE_HOSTS.includes(h)) return true;
  if (/(^|\.)amazon\.co\.jp$/.test(h)) { try { return new URL(u).searchParams.has('tag'); } catch { return false; } }
  return false;
}

interface OfferRow { retailer?: string; shop?: string; url: string; affiliateUrl?: string; hasAffiliate?: boolean; price?: number; fetchedAt?: string; official?: boolean; isSet?: boolean; inStock?: boolean; stockLabel?: string; }
const isAff = (o: OfferRow) => isAffiliateUrl(o.affiliateUrl || o.url) || isAffiliateUrl(o.url);
// src/lib/affiliate.ts の isOfficialOffer と同じ（公式店/公式通販か）。代表選びを揃える。
const OFFICIAL_BRANDS = ['あみあみ', '駿河屋', 'アニメイト', '楽天ブックス'];
const isOfficial = (o: OfferRow) => !!o.official || OFFICIAL_BRANDS.some((b) => `${o.retailer ?? ''} ${o.shop ?? ''}`.includes(b));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization ?? '';
  if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config error' });
  const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: rows, error } = await db
    .from('events')
    .select('id, title, price, offers, works(name)')
    .eq('type', 'goods')
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  const started = Date.now();
  const BUDGET_MS = 240_000; // 300s制限に対する安全余裕
  // アフィ販路が無いグッズ(=アニメイト限定/イベント/プライズ品で楽天・Yahoo!に無いことが多い)を
  // 毎日叩くのは無駄。既存アフィ販路の価格更新は毎日、未取得グッズのバックフィル再挑戦は週1(月曜UTC)だけ。
  // 手動で全件バックフィルしたいときは ?backfill=1 を付ける。
  const doBackfill = req.query.backfill === '1' || new Date().getUTCDay() === 1;
  let scanned = 0, backfilled = 0, updated = 0;

  for (const row of rows ?? []) {
    if (Date.now() - started > BUDGET_MS) break;
    const title = ((row.title as string) || '').trim();
    if (!title) continue;
    const offers: OfferRow[] = Array.isArray(row.offers) ? [...(row.offers as OfferRow[])] : [];
    const hasAff = offers.some(isAff);
    // 価格を再取得できる販路（楽天/Yahoo!/アニメイト本店）を1つでも持つなら毎日更新する。
    // 1つも無い＝限定/イベント/プライズ品で検索に出ないので、再挑戦はバックフィル日だけ（無駄打ち回避）。
    const refreshable = offers.some((o) => isAff(o) || /アニメイト|楽天|Yahoo/.test(o.retailer ?? ''));
    if (!refreshable && !doBackfill) continue;
    scanned++;
    // works は多対一なので単一オブジェクト
    const workName = ((row.works as { name?: string } | null)?.name) || '';
    const kw = `${workName} ${title}`.trim();

    let cands: Candidate[];
    try { cands = await searchCandidates(kw); } catch { await delay(300); continue; }
    if (!cands.length) { await delay(300); continue; }

    const now = new Date().toISOString();
    let changed = false;

    // (1) 既存アフィ販路(楽天/Yahoo!)を最新化。同じ販路(できれば同じ店)で最もタイトル一致する候補に
    //     URL・店・価格・フラグを合わせる。候補は中古除外済みなので、過去に付いた中古URLの付け替え・
    //     失効URLの解消・価格とURLのズレ防止も兼ねる。
    for (const o of offers) {
      const rk = o.retailer || '';
      if (!rk) continue;
      const match = cands
        .filter((c) => rk.includes(c.retailer) || c.retailer.includes(rk))
        .map((c) => ({ c, s: scoreTitle(title, c.title) + (o.shop && c.shop === o.shop ? 0.5 : 0) }))
        .filter((x) => x.s >= 0.5)
        .sort((a, b) => b.s - a.s)[0]?.c;
      if (match) {
        o.url = match.url;
        o.affiliateUrl = match.url;
        if (match.shop) o.shop = match.shop;
        o.price = match.price;
        o.official = match.official;
        o.isSet = isSetTitle(match.title);
        o.inStock = match.inStock;
        o.stockLabel = match.stockLabel;
        o.fetchedAt = now;
        changed = true;
      }
    }

    // (2) アフィ販路が皆無なら高信頼候補をバックフィル（週1のバックフィル日のみ到達）
    if (!hasAff) {
      const existing = new Set(offers.map((o) => o.url));
      for (const c of highConfidence(title, cands)) {
        if (existing.has(c.url)) continue;
        offers.push({ retailer: c.retailer || '楽天', shop: c.shop || undefined, url: c.url, affiliateUrl: c.url, hasAffiliate: c.hasAffiliate, price: c.price, fetchedAt: now, official: c.official, isSet: isSetTitle(c.title), inStock: c.inStock, stockLabel: c.stockLabel });
        changed = true; backfilled++;
      }
    }

    if (changed) {
      // 代表価格 = 在庫あり→単品→公式店→最安（クライアントの primaryOffer と揃える）。
      // アフィ販路が無ければ全販路から選ぶ（アニメイト本店だけのグッズでも価格を出す）。
      const affOffers = offers.filter(isAff);
      const rep = [...(affOffers.length ? affOffers : offers)].sort((a, b) =>
        (Number(b.inStock !== false) - Number(a.inStock !== false)) ||
        (Number(!!a.isSet) - Number(!!b.isSet)) ||
        (Number(isOfficial(b)) - Number(isOfficial(a))) ||
        ((a.price ?? Infinity) - (b.price ?? Infinity)),
      )[0];
      const newPrice = rep?.price ?? ((row.price as number | null) ?? null);
      const { error: upErr } = await db.from('events').update({ offers, price: newPrice }).eq('id', row.id);
      if (!upErr) updated++;
    }
    await delay(300); // 楽天/Yahoo! APIのレート制限に配慮
  }

  return res.status(200).json({ doBackfill, scanned, backfilled, updated, total: (rows ?? []).length, tookMs: Date.now() - started });
}
