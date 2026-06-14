/**
 * backup-supabase.mjs
 * Supabase の全テーブルを JSON で吸い出し、backups/<timestamp>/ に保存する。
 *
 * 使い方:
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/backup-supabase.mjs
 *   （VITE_SUPABASE_URL も env にあれば自動使用。無ければ下の既定値）
 *
 * service role キーを使うため RLS をバイパスして全件取得する。
 * 出力先 backups/ は .gitignore 済み。
 */

import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? 'https://jsgidtwxhueqgtvshdku.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('✗ SUPABASE_SERVICE_ROLE_KEY が未設定です。');
  console.error('  例: SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/backup-supabase.mjs');
  process.exit(1);
}

// バックアップ対象テーブル
const TABLES = ['works', 'events', 'participations', 'likes', 'reactions', 'reports'];

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// 1000件ずつページングして全件取得
async function fetchAll(table) {
  const PAGE = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join('backups', stamp);
  mkdirSync(dir, { recursive: true });

  console.log(`=== Supabase バックアップ開始 → ${dir} ===\n`);

  const summary = {};
  for (const table of TABLES) {
    try {
      const rows = await fetchAll(table);
      writeFileSync(join(dir, `${table}.json`), JSON.stringify(rows, null, 2));
      summary[table] = rows.length;
      console.log(`✓ ${table.padEnd(14)} ${rows.length} 件`);
    } catch (e) {
      summary[table] = `ERROR: ${e.message}`;
      console.warn(`⚠ ${table.padEnd(14)} スキップ (${e.message})`);
    }
  }

  writeFileSync(
    join(dir, '_manifest.json'),
    JSON.stringify({ created_at: new Date().toISOString(), url: SUPABASE_URL, tables: summary }, null, 2)
  );

  console.log(`\n=== 完了: ${dir} ===`);
}

main().catch((err) => {
  console.error('予期しないエラー:', err);
  process.exit(1);
});
