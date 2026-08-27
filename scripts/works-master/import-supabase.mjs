// 作った辞書を Supabase の work_master / work_master_alias に取り込む。
// 先に sql/2026-08-27-work-master.sql を流しておくこと。
//
//   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/works-master/import-supabase.mjs
//
// 照合キー（name_norm / alias_norm / reading_norm）はDB側の生成列が作るので、ここでは送らない。
// ただし「どの行が鍵を取るか」は入れる順で決まるので、知名度の高い順に入れる。

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const URL = process.env.VITE_SUPABASE_URL ?? 'https://jsgidtwxhueqgtvshdku.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('✗ SUPABASE_SERVICE_ROLE_KEY が未設定'); process.exit(1); }
const db = createClient(URL, KEY, { auth: { persistSession: false } });

const rows = readFileSync('scripts/.works-master/master.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l));
rows.sort((a, b) => (b.sitelinks - a.sitelinks) || (b.aliases.length - a.aliases.length));
console.log(`辞書 ${rows.length} 件を知名度の高い順に取り込む`);

/** 1000件ずつ入れる。鍵がぶつかった行だけ落としたいので、失敗したら1件ずつやり直す */
async function insertAll(table, records, label) {
  let ok = 0, skipped = 0;
  for (let i = 0; i < records.length; i += 1000) {
    const chunk = records.slice(i, i + 1000);
    const { error } = await db.from(table).insert(chunk);
    if (!error) { ok += chunk.length; }
    else {
      for (const r of chunk) {
        const { error: e2 } = await db.from(table).insert(r);
        if (e2) skipped++; else ok++;
      }
    }
    if ((i / 1000) % 10 === 0) process.stderr.write(`  ${label} ${i + chunk.length}/${records.length}\n`);
  }
  return { ok, skipped };
}

const master = rows.map(r => ({ qid: r.qid, name: r.title, reading: r.kana, kinds: r.kinds, popularity: r.sitelinks }));
const m = await insertAll('work_master', master, 'マスタ');
console.log(`work_master: ${m.ok} 件 / 鍵の衝突で見送り ${m.skipped} 件`);

// qid → id の対応表を作る（別名を紐づけるため）
const idOf = new Map();
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('work_master').select('id, qid').range(from, from + 999);
  if (error) throw error;
  if (!data.length) break;
  for (const d of data) idOf.set(d.qid, d.id);
  if (data.length < 1000) break;
}
console.log(`id を引けた作品: ${idOf.size} 件`);

const aliases = [];
for (const r of rows) {
  const id = idOf.get(r.qid);
  if (!id) continue;
  for (const a of r.aliases) aliases.push({ master_id: id, alias: a });
}
const a = await insertAll('work_master_alias', aliases, '別名');
console.log(`work_master_alias: ${a.ok} 件 / 鍵の衝突で見送り ${a.skipped} 件`);
