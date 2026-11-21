// 運営のボットを1回回す（GitHub Actions の .github/workflows/bot.yml から10分おき）。中身は api/_bot.ts。
// 手で回すとき: VITE_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/bot/run.ts
import { createClient } from '@supabase/supabase-js';
import { runBot } from '../../api/_bot.js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('VITE_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が要る');
  process.exit(1);
}
const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
await runBot(client);
