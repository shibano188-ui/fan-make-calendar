import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import ItemDetail from './ItemDetail';

// X などで共有された予定のページ（/e/:id）。中身はアプリの予定詳細と同じで、スマホの枠は付けない。
// アプリの中で開いた（今後アプリで直接開くようにしたとき）ら、いつもの詳細へ回す。
// 見た数は LP と同じ表（lp_daily・placement=share）に数える。匿名ログインしないので screen_views には入らない

const LP_TRACK = 'https://jsgidtwxhueqgtvshdku.supabase.co/rest/v1/rpc/lp_track';
const ANON_KEY = 'sb_publishable_LrqixF2NR51n00kWn6cxZg_vE3T_uhl';

export default function SharedItem() {
  const { id } = useParams<{ id: string }>();
  const native = Capacitor.isNativePlatform();

  useEffect(() => {
    if (native || !['fanhive.jp', 'www.fanhive.jp'].includes(location.hostname)) return;
    const src = (new URLSearchParams(location.search).get('src') || 'x').toLowerCase();
    fetch(LP_TRACK, {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({ p_metric: 'page_views', p_src: src, p_placement: 'share' }),
    }).catch(() => { /* 数えられなくても見せる */ });
  }, [native]);

  if (native) return <Navigate to={`/item/${id}`} replace />;
  return <ItemDetail shared />;
}
