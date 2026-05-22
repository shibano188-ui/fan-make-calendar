import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  ?? 'https://jsgidtwxhueqgtvshdku.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzZ2lkdHd4aHVlcWd0dnNoZGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDc5MzIsImV4cCI6MjA5NTAyMzkzMn0.Psq-N3K7XrmJT655TOcZrPxSkdFo75UGiFYDxy0X5m0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
