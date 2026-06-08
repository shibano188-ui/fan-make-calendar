import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jsgidtwxhueqgtvshdku.supabase.co';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return res.status(500).json({ error: 'Service role key not configured' });

  const { user_ids } = req.body as { user_ids?: string[] };
  if (!Array.isArray(user_ids) || user_ids.length === 0) return res.json([]);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await admin
    .from('user_settings')
    .select('user_id, display_name')
    .in('user_id', user_ids);

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data ?? []);
}
