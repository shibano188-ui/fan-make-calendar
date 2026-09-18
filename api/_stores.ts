import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';

// ストア側の数字（ダウンロード・インストール）を取ってくる。api/metrics.ts の Cron から呼ぶ。
// どちらも「その日の行」を返すだけで、保存は呼び出し側がやる。
//
// ── App Store Connect（売上とトレンドのレポート） ────────────────
//   ASC_KEY_ID / ASC_ISSUER_ID / ASC_PRIVATE_KEY（.p8 の中身。改行は \n でよい）
//   ASC_VENDOR_NUMBER … ASC →「支払いと財務レポート」の左上に出る番号
//   日付は太平洋時間で締められ、翌日の昼ごろ（日本時間）に出る。出ていない日は 404 なので飛ばす。
//
// ── Google Play（Cloud Storage に毎日置かれる CSV） ────────────────
//   PLAY_REPORTS_BUCKET … Play Console →「レポートをダウンロード」→ 統計情報 の
//                         「Cloud Storage の URI をコピー」の gs://pubsite_prod_… 部分
//   鍵は FCM と同じサービスアカウント（FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY）。
//   Play Console の「ユーザーと権限」でそのメールを招待し、
//   「アプリ情報の閲覧と一括レポートのダウンロード」を付ける。反映に1日かかることがある。
//   CSV は月ごとのファイルに毎日行が足される形。UTF-16 で届く。

export type StoreRow = { day: string; source: string; metric: string; value: number };
export type StoreResult = { ok: boolean; detail: unknown; rows: StoreRow[] };

const APP_ID = '6801161205';
/** 記録の始まり（metrics_daily のアプリ側と揃える）。これより前は取りに行かない */
const START = '2026-05-22';
const PACKAGE = 'jp.llp.fanhive';

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── App Store ────────────────────────────────────────────

function ascToken(): string | null {
  const kid = process.env.ASC_KEY_ID;
  const iss = process.env.ASC_ISSUER_ID;
  const key = process.env.ASC_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!kid || !iss || !key) return null;
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'ES256', kid, typ: 'JWT' })}.${b64({ iss, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' })}`;
  // JWT の ES256 は r||s の64バイト。node の既定(DER)ではないので指定する
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${unsigned}.${sig}`;
}

/** 1日分の売上レポートを数える。まだ出ていない日は null。
 *  Product Type Identifier の頭の数字: 1=新規ダウンロード 3=再ダウンロード 7=アップデート。
 *  アプリ内課金の行（IA…）は Apple Identifier がアプリ本体と違うので、ここでは数えない。 */
async function ascDay(token: string, vendor: string, day: string): Promise<Record<string, number> | null> {
  const q = new URLSearchParams({
    'filter[frequency]': 'DAILY', 'filter[reportType]': 'SALES', 'filter[reportSubType]': 'SUMMARY',
    'filter[vendorNumber]': vendor, 'filter[reportDate]': day, 'filter[version]': '1_1',
  });
  const r = await fetch(`https://api.appstoreconnect.apple.com/v1/salesReports?${q}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/a-gzip' },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`ASC ${day} ${r.status}: ${(await r.text()).slice(0, 300)}`);

  const tsv = gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf8');
  const [head, ...lines] = tsv.trim().split('\n');
  const col = head.split('\t');
  const at = (name: string) => col.indexOf(name);
  const iType = at('Product Type Identifier'), iUnits = at('Units'), iApp = at('Apple Identifier');

  const out = { downloads: 0, redownloads: 0, updates: 0 };
  for (const line of lines) {
    const c = line.split('\t');
    if (c[iApp] !== APP_ID) continue;
    const units = Number(c[iUnits]) || 0;
    const kind = c[iType]?.[0];
    if (kind === '1') out.downloads += units;
    else if (kind === '3') out.redownloads += units;
    else if (kind === '7') out.updates += units;
  }
  return out;
}

/** 直近 days 日を取り直す（遅れて出る日や、後から直る日があるので毎回まとめて上書きする）。 */
export async function collectAppStore(today: string, days = 7): Promise<StoreResult> {
  const vendor = process.env.ASC_VENDOR_NUMBER;
  const token = ascToken();
  if (!token || !vendor) return { ok: false, detail: 'ASC_KEY_ID / ASC_ISSUER_ID / ASC_PRIVATE_KEY / ASC_VENDOR_NUMBER が未設定', rows: [] };

  const rows: StoreRow[] = [];
  const missing: string[] = [];
  for (let i = 1; i <= days; i++) {
    const day = addDays(today, -i);
    // 404 は「まだ出ていない」か「その日は1件も無かった」。Apple は売上ゼロの日のレポートを作らない。
    // 3日以上前なら出揃っているので 0 として入れる（入れないとグラフが歯抜けになる）
    const got = await ascDay(token, vendor, day) ?? (i >= 3 ? { downloads: 0, redownloads: 0, updates: 0 } : null);
    if (!got) { missing.push(day); continue; }
    for (const [metric, value] of Object.entries(got)) rows.push({ day, source: 'asc', metric, value });
  }
  return { ok: true, detail: { saved: rows.length, notYet: missing }, rows };
}

// ── Google Play ──────────────────────────────────────────

let gcsToken: { value: string; expiresAt: number } | null = null;

async function googleToken(): Promise<string | null> {
  if (gcsToken && gcsToken.expiresAt > Date.now() + 60_000) return gcsToken.value;
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const key = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) return null;
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: email, scope: 'https://www.googleapis.com/auth/devstorage.read_only',
    aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
  })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  if (!r.ok) throw new Error(`Google token ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  gcsToken = { value: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return gcsToken.value;
}

/** CSV を「列名→値」の行に。先頭の BOM で UTF-16 か UTF-8 かを見分ける。 */
async function playCsv(token: string, bucket: string, object: string): Promise<Record<string, string>[] | null> {
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(object)}?alt=media`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GCS ${object} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const text = (buf[0] === 0xff && buf[1] === 0xfe ? buf.subarray(2).toString('utf16le') : buf.toString('utf8'))
    .replace(/^﻿/, '');
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const col = head.split(',');
  return lines.map((l) => {
    const c = l.split(',');
    return Object.fromEntries(col.map((name, i) => [name.trim(), (c[i] ?? '').trim()]));
  });
}

const PLAY_INSTALLS: Record<string, string> = {
  'Daily User Installs': 'installs',        // その日に初めて入れた人（端末ではなくアカウント単位）
  'Daily User Uninstalls': 'uninstalls',
  'Active Device Installs': 'active_devices', // その日に入っていた端末数
  'Total User Installs': 'total_user_installs', // これまでに入れた人の累計（消した人も含む）
};

/** 今月と先月のファイルを読んで、直近 days 日ぶんの行にする。 */
export async function collectPlay(today: string, days = 7): Promise<StoreResult> {
  const bucket = process.env.PLAY_REPORTS_BUCKET?.replace(/^gs:\/\//, '').split('/')[0];
  if (!bucket) return { ok: false, detail: 'PLAY_REPORTS_BUCKET が未設定', rows: [] };
  const token = await googleToken();
  if (!token) return { ok: false, detail: 'FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY が未設定', rows: [] };

  const since = [addDays(today, -days), START].sort()[1];
  const months: string[] = [];
  for (let d = `${since.slice(0, 7)}-01`; d <= today; ) {
    months.push(d.slice(0, 7).replace('-', ''));
    const n = new Date(`${d}T00:00:00Z`);
    n.setUTCMonth(n.getUTCMonth() + 1);
    d = n.toISOString().slice(0, 10);
  }

  const rows: StoreRow[] = [];
  const missing: string[] = [];
  for (const ym of months) {
    const installs = await playCsv(token, bucket, `stats/installs/installs_${PACKAGE}_${ym}_overview.csv`);
    if (!installs) { missing.push(`installs ${ym}`); continue; }
    for (const r of installs) {
      const day = r['Date'];
      if (!day || day < since) continue;
      for (const [csvName, metric] of Object.entries(PLAY_INSTALLS)) {
        const v = Number(r[csvName]);
        if (Number.isFinite(v) && r[csvName] !== '') rows.push({ day, source: 'play', metric, value: v });
      }
    }
  }
  return { ok: true, detail: { saved: rows.length, notYet: missing }, rows };
}
