import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { searchCandidates, highConfidence, scoreTitle, isSetTitle, searchKeyword, variantMismatch, type Candidate } from './_product-search.js';

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

// ECの検索・一覧ページ（商品が特定できないURL）。src/lib/affiliate.ts の isSearchPageUrl と同期を保つこと。
const SEARCH_PAGE_PATTERNS = [
  /animate-onlineshop\.jp\/(?:[^?]*\/)?(animetitle|products\/list)/i,
  /(^|\/\/)search\.rakuten\.co\.jp\//i,
  /shopping\.yahoo\.co\.jp\/search/i,
  /amazon\.co\.jp\/s\?/i,
  /amiami\.jp\/[^?]*\/search/i,
  /suruga-ya\.jp\/search/i,
];
const isSearchPage = (u: string) => !!u && SEARCH_PAGE_PATTERNS.some((re) => re.test(u));

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

  // 共同編集で取り消された購入リンク（src/lib/api.ts の applyEdits と同じ実効値の考え方）。
  // events.offers は書き換えない設計なので、Cronもこれを読まないと取り消したリンクの価格を
  // 更新し続け、代表価格(events.price)にも選んでしまう。
  const removedByEvent = new Map<string, Set<string>>();
  {
    // 取り消しを含むパッチだけ引く（日付編集が増えても既定の行数上限に押し出されないように）
    const { data: edits } = await db.from('event_edits').select('event_id, patch').not('patch->removedOfferUrls', 'is', null);
    for (const e of edits ?? []) {
      const urls = (e.patch as { removedOfferUrls?: string[] } | null)?.removedOfferUrls;
      if (!urls?.length) continue;
      const set = removedByEvent.get(e.event_id as string) ?? new Set<string>();
      for (const u of urls) set.add(u);
      removedByEvent.set(e.event_id as string, set);
    }
  }
  const EMPTY: ReadonlySet<string> = new Set();

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
    // 取り消された販路は配列に残したまま（編集履歴から「戻す」ため）、更新・代表選び・アフィ有無の
    // 判定からは外す。ここで除外しないと o.url が最新候補に張り替わり、URL基準の取り消しが外れる。
    const removed = removedByEvent.get(row.id as string) ?? EMPTY;
    const active = removed.size ? offers.filter((o) => !removed.has(o.url)) : offers;
    const hasAff = active.some(isAff);
    // 価格を再取得できる販路（楽天/Yahoo!/アニメイト本店）を1つでも持つなら毎日更新する。
    // 1つも無い＝限定/イベント/プライズ品で検索に出ないので、再挑戦はバックフィル日だけ（無駄打ち回避）。
    // 検索・一覧ページしか無いグッズ（Xのまとめが貼ったアニメイト検索リンク等）も「毎日」からは外す。
    // 商品が特定できないので毎日叩いても空振りする。バックフィル日には下の (1) で商品ページへの
    // 張り替えを試すので、アニメイトに商品が載れば週1で自己修復する。
    const refreshable = active.some((o) => !isSearchPage(o.url) && (isAff(o) || /アニメイト|楽天|Yahoo/.test(o.retailer ?? '')));
    if (!refreshable && !doBackfill) continue;
    scanned++;
    // works は多対一なので単一オブジェクト
    const workName = ((row.works as { name?: string } | null)?.name) || '';
    const kw = searchKeyword(workName, title);

    let cands: Candidate[];
    try { cands = await searchCandidates(kw); } catch { await delay(300); continue; }
    if (!cands.length) { await delay(300); continue; }

    const now = new Date().toISOString();
    let changed = false;

    // (1) 既存アフィ販路(楽天/Yahoo!)を最新化。同じ販路(できれば同じ店)で最もタイトル一致する候補に
    //     URL・店・価格・フラグを合わせる。候補は中古除外済みなので、過去に付いた中古URLの付け替え・
    //     失効URLの解消・価格とURLのズレ防止も兼ねる。
    for (const o of active) {
      const rk = o.retailer || '';
      if (!rk) continue;
      // その販路の検索が生きているか（0件＝レート制限や一時エラーの可能性。後述の判定で使う）
      const sameRetailer = cands.filter((c) => rk.includes(c.retailer) || c.retailer.includes(rk));
      // 同じ販路でタイトルが近い候補（種類マーカーは見ない）。「その店にまだ在るか」の判定に使う。
      const loose = sameRetailer
        .map((c) => ({ c, s: scoreTitle(title, c.title) + (o.shop && c.shop === o.shop ? 0.5 : 0) }))
        .filter((x) => x.s >= 0.5)
        .sort((a, b) => b.s - a.s);
      // 種類違い(vol.2↔vol.3・①↔②)へURLを張り替えてしまわないよう投稿時と同じ照合をかける
      const match = loose.find((x) => !variantMismatch(title, x.c.title))?.c;
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
      } else if (sameRetailer.length > 0 && loose.length === 0 && o.inStock !== undefined) {
        // その販路の検索結果から消えた＝売切れ・掲載終了の可能性。古い「在庫あり」を
        // 出し続けると嘘になるので不明(undefined)に戻す。翌日また見つかれば復活する。
        // 消してよい条件を厳しく2つ課している:
        //  ① sameRetailer > 0 … その販路の検索自体は生きている。0件だと楽天のレート制限(429→[])と
        //     区別が付かず、APIが詰まっただけで在庫表示が毎回削れていく（実際に45→38まで減った）
        //  ② loose = 0 … 商品自体が見当たらない。loose があるのに match が無い場合は
        //     種類マーカーの表記揺れ（②と2）で確定できないだけなので触らない
        delete o.inStock;
        delete o.stockLabel;
        changed = true;
      }
    }

    // (2) アフィ販路が皆無なら高信頼候補をバックフィル（週1のバックフィル日のみ到達）
    if (!hasAff) {
      // 取り消し済みのURLも existing に含める（取り消したリンクをバックフィルで復活させない）
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
      // バックフィルで push した分も含めるため、取り消し分を除いた実効値をここで取り直す。
      // 検索・一覧ページは商品が特定できないので代表にしない（クライアントの primaryOffer と揃える）。
      const live = removed.size ? offers.filter((o) => !removed.has(o.url)) : offers;
      const products = live.filter((o) => !isSearchPage(o.url));
      const base = products.length ? products : live;
      const affOffers = base.filter(isAff);
      const rep = [...(affOffers.length ? affOffers : base)].sort((a, b) =>
        (Number(b.inStock !== false) - Number(a.inStock !== false)) ||
        (Number(!!a.isSet) - Number(!!b.isSet)) ||
        (Number(isOfficial(b)) - Number(isOfficial(a))) ||
        ((a.price ?? Infinity) - (b.price ?? Infinity)),
      )[0];
      const newPrice = rep?.price ?? ((row.price as number | null) ?? null);
      const { error: upErr } = await db.from('events').update({ offers, price: newPrice }).eq('id', row.id);
      if (!upErr) updated++;
    }
    // 楽天は1件あたり5リクエスト（全体＋公式店4）投げるので、間隔を詰めると429で0件が返る。
    // 0件は「掲載終了」と見分けが付かないため、レート制限は精度に直結する。
    await delay(900);
  }

  return res.status(200).json({ doBackfill, scanned, backfilled, updated, total: (rows ?? []).length, tookMs: Date.now() - started });
}
