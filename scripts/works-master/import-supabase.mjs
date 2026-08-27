// 作った辞書を Supabase の work_master / work_master_alias に取り込む。
// 先に sql/2026-08-27-work-master.sql を流しておくこと。
//
//   node scripts/works-master/import-supabase.mjs
//   （.env.local の SUPABASE_SERVICE_ROLE_KEY を読む。環境変数が優先）
//
// 照合キー（name_norm / alias_norm / reading_norm）はDB側の生成列が作るので送らない。
// ただし鍵は先着1件しか入らないので、知名度の高い順に入れ、重複はこちらで落としてから送る。
// 途中で止めても再実行で続きから入る。

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { nameNorm } from './norm.mjs';

function fromEnvFile(key) {
  try {
    const line = readFileSync('.env.local', 'utf8').split('\n').find(l => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim().replace(/^"|"$/g, '') : undefined;
  } catch { return undefined; }
}

const URL = process.env.VITE_SUPABASE_URL ?? fromEnvFile('VITE_SUPABASE_URL') ?? 'https://jsgidtwxhueqgtvshdku.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fromEnvFile('SUPABASE_SERVICE_ROLE_KEY');
if (!KEY) { console.error('✗ SUPABASE_SERVICE_ROLE_KEY が見つからない'); process.exit(1); }
const db = createClient(URL, KEY, { auth: { persistSession: false } });

/** 1000件ずつ全部読む */
async function selectAll(table, cols, onRow) {
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(cols).range(from, from + 999);
    if (error) throw error;
    data.forEach(onRow);
    if (data.length < 1000) return;
  }
}

async function insertAll(table, records, label) {
  let ok = 0, skipped = 0;
  for (let i = 0; i < records.length; i += 1000) {
    const chunk = records.slice(i, i + 1000);
    const { error } = await db.from(table).insert(chunk);
    if (error) {
      // 想定外の衝突だけ1件ずつ拾い直す（事前に重複は落としてあるので、ここは基本通らない）
      for (const r of chunk) {
        const { error: e2 } = await db.from(table).insert(r);
        if (e2) skipped++; else ok++;
      }
    } else ok += chunk.length;
    process.stderr.write(`  ${label} ${i + chunk.length}/${records.length}\n`);
  }
  return { ok, skipped };
}

const rows = readFileSync('scripts/.works-master/master.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l));
rows.sort((a, b) => (b.sitelinks - a.sitelinks) || (b.aliases.length - a.aliases.length));

// ── マスタ ──────────────────────────────────────────
const haveQid = new Set();
await selectAll('work_master', 'qid', r => haveQid.add(r.qid));
const takenNorm = new Set();
await selectAll('work_master', 'name_norm', r => takenNorm.add(r.name_norm));
console.log(`辞書 ${rows.length} 件 / 取り込み済み ${haveQid.size} 件`);

const master = [];
for (const r of rows) {
  if (haveQid.has(r.qid)) continue;
  const k = nameNorm(r.title);
  if (!k || takenNorm.has(k)) continue;   // 鍵がぶつかる行は知名度の低い方なので捨てる
  takenNorm.add(k);
  master.push({ qid: r.qid, name: r.title, reading: r.kana, kinds: r.kinds, popularity: r.sitelinks });
}
if (master.length) {
  const m = await insertAll('work_master', master, 'マスタ');
  console.log(`work_master: +${m.ok} 件 / 見送り ${m.skipped} 件`);
} else console.log('work_master: 追加なし');

// ── 別名 ────────────────────────────────────────────
const idOf = new Map();
await selectAll('work_master', 'id, qid', r => idOf.set(r.qid, r.id));
const takenAlias = new Set(takenNorm);   // 正式名と同じ鍵の別名は入れても引けないので最初から除く
await selectAll('work_master_alias', 'alias_norm', r => takenAlias.add(r.alias_norm));
console.log(`別名の取り込み済み鍵 ${takenAlias.size} 件`);

const aliases = [];
for (const r of rows) {
  const id = idOf.get(r.qid);
  if (!id) continue;
  for (const a of r.aliases) {
    const k = nameNorm(a);
    if (k.length < 2 || takenAlias.has(k)) continue;
    takenAlias.add(k);
    aliases.push({ master_id: id, alias: a });
  }
}
if (aliases.length) {
  const a = await insertAll('work_master_alias', aliases, '別名');
  console.log(`work_master_alias: +${a.ok} 件 / 見送り ${a.skipped} 件`);
} else console.log('work_master_alias: 追加なし');
