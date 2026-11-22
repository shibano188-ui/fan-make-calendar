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
// vercel env pull では「Sensitive」の変数が中身でなく [SENSITIVE] になる。そのまま Secrets に入っていたら無いものとして扱う。
// 楽天・Yahoo! のキーは無くても動く（店のリンク探しを飛ばすだけ。毎日の refresh-offers が Vercel で補う）。
// Supabase と Anthropic のキーは要るので、無ければ名前を出して止める
for (const k of Object.keys(process.env)) if (process.env[k] === '[SENSITIVE]') delete process.env[k];
const missing = ['SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error('Secrets に本物の値が入っていない:', missing.join(', '));
  process.exit(1);
}
const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
await runBot(client);
