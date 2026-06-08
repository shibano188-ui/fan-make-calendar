import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jsgidtwxhueqgtvshdku.supabase.co';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return res.status(500).json({ error: 'Not configured' });

  // JWTで呼び出し元がログイン済みであることを検証
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.slice(7);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { event_id, title } = req.body as { event_id?: string; title?: string };
  if (!event_id || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'event_id and title required' });
  }

  const { error } = await admin
    .from('events')
    .update({ title: title.trim() })
    .eq('id', event_id);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}
