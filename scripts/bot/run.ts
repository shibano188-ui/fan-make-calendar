// 運営のボットを1回回す（GitHub Actions の .github/workflows/bot.yml から10分おき）。中身は api/_bot.ts。
// 手で回すとき: VITE_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/bot/run.ts
import { createClient } from '@supabase/supabase-js';
import { runBot } from '../../api/_bot.js';

// vercel env pull で取った値は、末尾に文字の「\n」や空白が付いていることがある（Vercel に入れたときの名残）。外してから使う
for (const k of Object.keys(process.env)) {
  const v = process.env[k];
  if (v !== undefined) process.env[k] = v.replace(/(\\n|\s)+$/, '');
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('VITE_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が要る');
  process.exit(1);
}
// 値の形が違うときは、中身を出さずに形だけ出す（Secrets の入れ間違いを見つけるため）
if (!/^https:\/\//.test(url)) {
  console.error('VITE_SUPABASE_URL の形が違う', { length: url.length, head: [...url.slice(0, 3)].map((c) => c.charCodeAt(0)) });
  process.exit(1);
}
const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
await runBot(client);
