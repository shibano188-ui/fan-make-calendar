import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jsgidtwxhueqgtvshdku.supabase.co';

// 都道府県名（都/府/県を除いた正規形。クライアントの normalizePrefecture と一致）
const PREFECTURES = [
  '北海道','青森','岩手','宮城','秋田','山形','福島','茨城','栃木','群馬','埼玉','千葉','東京','神奈川',
  '新潟','富山','石川','福井','山梨','長野','岐阜','静岡','愛知','三重','滋賀','京都','大阪','兵庫','奈良','和歌山',
  '鳥取','島根','岡山','広島','山口','徳島','香川','愛媛','高知','福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄',
];

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
  const nextTitle = title.trim();

  // 現在のタイトルを取得し、「既存タイトル + 半角スペース + 都道府県名」の地名付与のみ許可する。
  // （このエンドポイントは重複予定の地名サフィックス付与専用。任意の書き換えは拒否）
  const { data: current, error: fetchError } = await admin
    .from('events')
    .select('title')
    .eq('id', event_id)
    .single();
  if (fetchError || !current) return res.status(404).json({ error: 'event not found' });

  const currentTitle = (current.title as string).trim();
  const isPrefectureSuffix = PREFECTURES.some(p => nextTitle === `${currentTitle} ${p}`);
  if (!isPrefectureSuffix) {
    return res.status(403).json({ error: 'only prefecture suffix is allowed' });
  }

  const { error } = await admin
    .from('events')
    .update({ title: nextTitle })
    .eq('id', event_id);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}
