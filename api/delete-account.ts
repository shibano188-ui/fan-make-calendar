import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { rateLimited } from './_ratelimit.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (await rateLimited('delete', req, res)) return;

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config error' });

  // ユーザーのトークンを検証
  const userClient = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY!);
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 削除前に参加作品IDを控える（人数再同期のため）
  const { data: parts } = await adminClient
    .from('participations')
    .select('work_id')
    .eq('user_id', user.id);
  const affectedWorkIds = [...new Set((parts ?? []).map(p => p.work_id as string))];

  // ユーザーデータを削除（reactions / likes / reports / participations / user_settings）
  await adminClient.from('reactions').delete().eq('user_id', user.id);
  await adminClient.from('likes').delete().eq('user_id', user.id);
  await adminClient.from('reports').delete().eq('reporter_id', user.id);
  await adminClient.from('participations').delete().eq('user_id', user.id);
  await adminClient.from('user_settings').delete().eq('user_id', user.id);

  // 抜けた作品の参加人数を実数に再同期
  for (const workId of affectedWorkIds) {
    const { count } = await adminClient
      .from('participations')
      .select('*', { count: 'exact', head: true })
      .eq('work_id', workId);
    await adminClient.from('works').update({ participant_count: count ?? 0 }).eq('id', workId);
  }

  // 認証アカウントを削除
  const { error } = await adminClient.auth.admin.deleteUser(user.id);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true });
}
