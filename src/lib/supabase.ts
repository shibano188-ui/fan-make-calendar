import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  ?? 'https://jsgidtwxhueqgtvshdku.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzZ2lkdHd4aHVlcWd0dnNoZGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDc5MzIsImV4cCI6MjA5NTAyMzkzMn0.Psq-N3K7XrmJT655TOcZrPxSkdFo75UGiFYDxy0X5m0';

// アプリがバックグラウンドに回った際などにfetchが永遠に解決しないことがあるため、
// 一定時間で強制的にabortして呼び出し元のcatchに処理を戻す。
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const callerSignal = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', () => controller.abort());
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithTimeout },
});
