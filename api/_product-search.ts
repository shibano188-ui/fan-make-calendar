// 商品候補検索の共有ロジック。search-product（投稿時の手動/自動検索）と
// refresh-offers（毎日Cronの価格更新・リンクバックフィル）の両方から使う。
// 楽天: 2026新API（RAKUTEN_APP_ID＋accessKey）。Yahoo!: 商品検索v3（YAHOO_APP_ID。未設定ならスキップ）。
// あみあみ・駿河屋・アニメイトは楽天/Yahoo!の公式出店店舗経由で価格が取れる → 公式店を優先表示。

export interface Candidate {
  title: string; price: number; url: string; image: string; shop: string; retailer: string; hasAffiliate: boolean;
  shopCode?: string; official?: boolean;
  inStock?: boolean;    // 楽天 availability / Yahoo! inStock / アニメイト「販売状況」。false=売切れ
  stockLabel?: string;  // アニメイトの生の表記（予約受付中・取り寄せ等）。表示用
}

// 楽天/Yahoo!に公式出店しているホビー系ショップ（優先表示・「公式店」表示の対象）。
// 全体検索だと転売系ショップが上位を埋めて公式店が圏外に沈むため、公式店は shopCode 指定で別途検索する。
const RAKUTEN_OFFICIAL_SHOPS: Record<string, string> = {
  'amiami': 'あみあみ',
  'surugaya-a-too': '駿河屋',
  'acosbyanimate': 'アニメイト',
  'book': '楽天ブックス', // 楽天直営
};
const YAHOO_OFFICIAL_SELLERS: Record<string, string> = {
  'suruga-ya': '駿河屋',
  'amiami': 'あみあみ',
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rakutenRequest(keyword: string, hits: number, shopCode?: string): Promise<Candidate[]> {
  const appId = process.env.RAKUTEN_APP_ID?.trim();
  const accessKey = process.env.RAKUTEN_ACCESS_KEY?.trim();
  if (!appId || !accessKey) return [];
  const affiliateId = (process.env.RAKUTEN_AFFILIATE_ID || '').trim();
  const params = new URLSearchParams({
    applicationId: appId, keyword, hits: String(hits), format: 'json', formatVersion: '2',
    ...(affiliateId ? { affiliateId } : {}),
    ...(shopCode ? { shopCode } : {}),
  });
  const referer = process.env.RAKUTEN_REFERER || 'https://fan-make-calendar.vercel.app/';
  const r = await fetch(`https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401?${params.toString()}`, {
    headers: { accessKey, Referer: referer, Origin: referer.replace(/\/$/, '') },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await r.json()) as { Items?: any[] };
  return (data.Items ?? []).map((it) => ({
    title: it.itemName as string,
    price: it.itemPrice as number,
    url: (it.affiliateUrl || it.itemUrl) as string,
    image: ((it.mediumImageUrls && it.mediumImageUrls[0]) || (it.smallImageUrls && it.smallImageUrls[0]) || '') as string,
    shop: it.shopName as string,
    retailer: '楽天',
    hasAffiliate: !!affiliateId,
    shopCode: it.shopCode as string | undefined,
    official: !!RAKUTEN_OFFICIAL_SHOPS[(it.shopCode as string) ?? ''],
    inStock: it.availability !== 0, // 1=在庫あり / 0=在庫なし
  }));
}

async function searchRakuten(keyword: string): Promise<Candidate[]> {
  // 全体検索＋公式店ごとのshopCode検索を少しずらして並列実行（レート制限429回避のためスタガー）
  const shopCodes = Object.keys(RAKUTEN_OFFICIAL_SHOPS);
  const jobs = [
    rakutenRequest(keyword, 8),
    // 楽天APIは概ね1req/秒。詰めると429が返り items が空になる＝「掲載終了」と誤認されるので広めに割る
    ...shopCodes.map((sc, i) => delay(450 * (i + 1)).then(() => rakutenRequest(keyword, 3, sc))),
  ];
  const results = await Promise.all(jobs.map((p) => p.catch(() => [] as Candidate[])));
  // 公式店の結果を優先し、実商品URL基準で重複除去
  // 注意: 楽天アフィリエイトURLのパスはショップ単位（商品単位でない）なので、pcパラメータ内の実商品URLをキーにする
  const seen = new Set<string>();
  const merged: Candidate[] = [];
  for (const c of [...results.slice(1).flat(), ...results[0]]) {
    const key = dedupeKey(c.url);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(c);
  }
  return merged;
}

function dedupeKey(u: string): string {
  try {
    const url = new URL(u);
    const pc = url.searchParams.get('pc');
    if (pc) return decodeURIComponent(pc).split('?')[0];
    return url.origin + url.pathname;
  } catch { return u; }
}

async function searchYahoo(keyword: string): Promise<Candidate[]> {
  const appId = process.env.YAHOO_APP_ID?.trim();
  if (!appId) return [];
  // バリューコマース連携時: ck.jp.ap.valuecommerce.com/servlet/referral?sid=…&pid=…&vc_url= 形式をそのまま入れる
  const vcAffiliateId = process.env.YAHOO_VC_AFFILIATE_ID?.trim();
  const params = new URLSearchParams({ appid: appId, query: keyword, results: '8' });
  if (vcAffiliateId) { params.set('affiliate_type', 'vc'); params.set('affiliate_id', vcAffiliateId); }
  const r = await fetch(`https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?${params.toString()}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await r.json()) as { hits?: any[] };
  return (data.hits ?? []).map((it) => ({
    title: it.name as string,
    price: it.price as number,
    url: it.url as string,
    image: (it.image?.medium || it.image?.small || '') as string,
    shop: (it.seller?.name || '') as string,
    retailer: 'Yahoo!',
    hasAffiliate: !!vcAffiliateId,
    shopCode: it.seller?.sellerId as string | undefined,
    official: !!YAHOO_OFFICIAL_SELLERS[(it.seller?.sellerId as string) ?? ''],
    inStock: it.inStock !== false,
    // condition は 'new' | 'used'。タイトル正規表現より確実なので中古判定に使う
    stockLabel: it.condition === 'used' ? '中古' : undefined,
  }));
}

// 注: あみあみ本店・駿河屋本店はCloudflareでサーバー403 → 直接取得不可。
// 上記の公式出店店舗（楽天/Yahoo!）経由で取得し、それ以外は「各店で探す」リンクで対応する。

// アニメイト本店。API は無いが検索ページ(list.php?smt=)はサーバーから取得できるので HTML を読む。
// 楽天のアニメイト系店舗(acosbyanimate)はコスプレ中心で品揃えが本店と別物のため、本店を直接見る必要がある。
// アフィリエイトは未提携(2026-07-23審査落ち)なので hasAffiliate=false。提携が通れば affiliate.ts の wrap だけで成果化する。
const ANIMATE_ORIGIN = 'https://www.animate-onlineshop.jp';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}

async function searchAnimate(keyword: string): Promise<Candidate[]> {
  const r = await fetch(`${ANIMATE_ORIGIN}/products/list.php?smt=${encodeURIComponent(keyword)}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ja' },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return [];
  const html = await r.text();
  const out: Candidate[] = [];
  // 検索結果は <div class="item_list_thumb"> 単位。1商品 = サムネ・h3タイトル・p.price。
  for (const chunk of html.split('<div class="item_list_thumb">').slice(1)) {
    const href = chunk.match(/<a href="(\/pn\/[^"]+\/pd\/\d+\/)"/)?.[1];
    const title = chunk.match(/<h3><a [^>]*>([^<]+)<\/a><\/h3>/)?.[1];
    const price = chunk.match(/<p class="price">(?:<font[^>]*>)?([\d,]+)<\/font>?円/)?.[1];
    if (!href || !title || !price) continue;
    const image = chunk.match(/<img src="([^"]+)"/)?.[1] ?? '';
    // 販売状況: 在庫あり / 残りわずか / 予約受付中 / 取り寄せ / 通常N日以内に入荷 / 販売終了
    const stock = chunk.match(/販売状況：<span[^>]*>([^<]+)<\/span>/)?.[1]?.trim();
    out.push({
      title: decodeEntities(title).trim(),
      price: Number(price.replace(/,/g, '')),
      url: `${ANIMATE_ORIGIN}${decodeEntities(href)}`,
      image: decodeEntities(image),
      shop: 'アニメイトオンラインショップ',
      retailer: 'アニメイト',
      hasAffiliate: false,
      official: true,
      inStock: !stock || !/販売終了|品切|売切|在庫なし/.test(stock),
      stockLabel: stock,
    });
    if (out.length >= 3) break;
  }
  return out;
}

// 中古/セット判定（src/lib/searchProduct.ts と同期を保つこと）。
export function isUsedTitle(t: string): boolean { return /中古|ユーズド/.test(t); }
export function isSetTitle(t: string): boolean { return /セット|まとめ(買|売)|コンプ|全\d+種|\d+個(入|セット)|\bBOX\b|1BOX/i.test(t); }

/** キーワードで楽天/Yahoo!を横断検索し、中古除外・公式店優先・1店舗3件・最大12件に整形して返す。 */
export async function searchCandidates(keyword: string): Promise<Candidate[]> {
  const [rakuten, yahoo, animate] = await Promise.all([
    searchRakuten(keyword).catch(() => [] as Candidate[]),
    searchYahoo(keyword).catch(() => [] as Candidate[]),
    searchAnimate(keyword).catch(() => [] as Candidate[]),
  ]);
  // 中古品は除外（駿河屋等は中古が混じる。本人方針で自動添付対象外）。
  // タイトル正規表現に加え、Yahoo!の condition='used' も見る（stockLabel='中古'）。
  // 在庫ありを先に、次に公式店（sortは安定なので同グループ内の順序は維持）。
  // 1店舗あたり最大3件に制限（楽天ブックス等が枠を占拠して他販路が圧迫されるのを防ぐ）
  const sorted = [...rakuten, ...yahoo, ...animate]
    .filter((c) => !isUsedTitle(c.title) && c.stockLabel !== '中古')
    .sort((a, b) =>
      Number(b.inStock !== false) - Number(a.inStock !== false) ||
      Number(b.official ?? false) - Number(a.official ?? false));
  const perShop: Record<string, number> = {};
  const items: Candidate[] = [];
  for (const c of sorted) {
    const k = `${c.retailer}:${c.shopCode || c.shop}`;
    perShop[k] = (perShop[k] ?? 0) + 1;
    if (perShop[k] > 3) continue;
    items.push(c);
    if (items.length >= 12) break;
  }
  return items;
}

// ── マッチング（src/lib/searchProduct.ts と同じロジック。両者は同期を保つこと）──

/** 検索キーワードを組み立てる（src/lib/searchProduct.ts と同期を保つこと）。
 * 「作品名 + タイトル」が基本だが、タイトルに既に作品名が入っていると
 * 「ハイキュー!! ハイキュー!! 缶バッジ」と二重になり、**アニメイト検索が0件になる**
 * （楽天/Yahoo!は耐えるが結果は劣化する）。重複するときは作品名を足さない。 */
export function searchKeyword(workName: string, title: string): string {
  const w = (workName || '').trim();
  const t = (title || '').trim();
  if (!w) return t;
  if (!t) return w;
  // NFKCで全角半角を揃える（作品名「ハイキュー!!」とタイトル内「ハイキュー！！」を同一視する）
  const norm = (s: string) => s.normalize('NFKC').replace(/[\s　]/g, '').toLowerCase();
  return norm(t).includes(norm(w)) ? t : `${w} ${t}`;
}

/** 入力タイトルが候補タイトルにどれだけ含まれるか（0〜1）。誤商品の防止用ガード。 */
export function scoreTitle(entered: string, candidate: string): number {
  const norm = (s: string) => s.replace(/[\s　]/g, '').toLowerCase();
  const a = norm(entered);
  const b = norm(candidate);
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string) => { const set = new Set<string>(); for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2)); return set; };
  const A = grams(a);
  const B = grams(b);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / A.size;
}

/** タイトルから「種類マーカー」を取り出す（src/lib/searchProduct.ts と同期を保つこと）。
 * 一致度スコアは2文字組の一致率なので vol.2 と vol.3 で0.9超になり見分けられない。
 * 巻数・弾数・丸数字だけを別枠で取り出して照合する。
 * 楽天は「(1)クリア」、アニメイトは「①クリア」と表記が割れるので同じ `no:N` に正規化する。 */
export function variantKey(title: string): string[] {
  const out = new Set<string>();
  const push = (k: string, n: string) => out.add(`${k}:${Number(n)}`);
  for (const m of title.matchAll(/vol\.?\s*(\d+)/gi)) push('vol', m[1]);
  for (const m of title.matchAll(/ver\.?\s*(\d+)/gi)) push('ver', m[1]);
  for (const m of title.matchAll(/part\.?\s*(\d+)/gi)) push('part', m[1]);
  for (const m of title.matchAll(/第\s*(\d+)\s*([弾期巻話章])/g)) push(m[2], m[1]);
  for (const m of title.matchAll(/[(（]\s*(\d+)\s*[)）]/g)) push('no', m[1]);
  for (const ch of title) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x2460 && c <= 0x2473) push('no', String(c - 0x2460 + 1)); // ①〜⑳
  }
  return [...out];
}

/** 入力と候補の種類マーカーが食い違うか。入力に指定が無いときは判定しない（別ルールで扱う）。 */
export function variantMismatch(entered: string, candidate: string): boolean {
  const a = variantKey(entered);
  if (!a.length) return false;
  const b = new Set(variantKey(candidate));
  return !a.every((k) => b.has(k));
}

/** 自動添付してよい高信頼候補だけを返す（公式店0.55以上/非公式0.8以上・販路ごと1件・最大4件）。
 * アフィ対応の販路を先に確保してから、アニメイト本店など非対応の公式店を足す。
 * 売切れ・種類違いは自動添付しない（候補としては残るので手動では選べる）。 */
export function highConfidence(enteredTitle: string, items: Candidate[]): Candidate[] {
  const scored = items
    .map((c) => ({ c, score: scoreTitle(enteredTitle, c.title) }))
    .filter(({ c, score }) => (c.official ? score >= 0.55 : score >= 0.8))
    .filter(({ c }) => c.inStock !== false)
    .filter(({ c }) => !variantMismatch(enteredTitle, c.title));
  // 入力に種類指定が無いのに候補が複数の種類に分かれている（①と②、vol.1とvol.2）場合、
  // どれか1つを自動で貼ると「バリエーションがあるのに1種類だけリンクされる」ので添付しない。
  if (!variantKey(enteredTitle).length) {
    const kinds = new Set(scored.flatMap(({ c }) => variantKey(c.title)));
    if (kinds.size >= 2) return [];
  }
  const ranked = [...scored]
    .sort((a, b) =>
      Number(b.c.hasAffiliate) - Number(a.c.hasAffiliate) ||
      Number(b.c.official ?? false) - Number(a.c.official ?? false) ||
      b.score - a.score);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const { c } of ranked) {
    const k = `${c.retailer}:${c.shop || ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= 4) break;
  }
  return out;
}
