/**
 * seed-test.mjs
 * テスト用「テスト」作品と5〜6月のリアルなイベントデータを投入するスクリプト
 *
 * 使い方: node scripts/seed-test.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jsgidtwxhueqgtvshdku.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzZ2lkdHd4aHVlcWd0dnNoZGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDc5MzIsImV4cCI6MjA5NTAyMzkzMn0.Psq-N3K7XrmJT655TOcZrPxSkdFo75UGiFYDxy0X5m0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── ログイン情報 ─────────────────────────────────────────────────────
// シードには認証済みユーザーが必要なため、env から読むか直接指定
const TEST_EMAIL = process.env.SEED_EMAIL ?? 'shisoh0501@gmail.com';
const TEST_PASSWORD = process.env.SEED_PASSWORD;

// ─── イベントデータ ─────────────────────────────────────────────────
// リアルな日本のファンイベント（マンガ・アニメ・配信・グッズ・誕生日）
const EVENTS = [
  // === 5月 残り ===
  {
    title: '第7巻 発売',
    event_date: '2026-05-28',
    start_time: '10:00',
    end_time: null,
    category: '単行本',
    prefecture: null,
    location_name: '全国書店',
    external_link: null,
    memo: '電子書籍同時発売。特典は書店別で異なります。',
  },
  {
    title: 'グッズ受注締切',
    event_date: '2026-05-29',
    start_time: '23:59',
    end_time: null,
    category: 'グッズ',
    prefecture: null,
    location_name: null,
    external_link: 'https://example.com/shop',
    memo: 'アクリルスタンド・缶バッジセットの受注締切日',
  },
  {
    title: '公式生配信 #23',
    event_date: '2026-05-30',
    start_time: '20:00',
    end_time: '22:00',
    category: '配信',
    prefecture: null,
    location_name: null,
    external_link: 'https://youtube.com',
    memo: 'キャラクター投票結果発表＋次回予告',
  },
  {
    title: '声優 田中葵 誕生日',
    event_date: '2026-05-31',
    start_time: null,
    end_time: null,
    category: '誕生日',
    prefecture: null,
    location_name: null,
    external_link: null,
    memo: 'メインキャラ「葵」担当声優の誕生日',
  },

  // === 6月 ===
  {
    title: 'アニメ第2期 放送開始',
    event_date: '2026-06-04',
    start_time: '23:00',
    end_time: '23:30',
    category: '配信',
    prefecture: null,
    location_name: 'MBS・TBS系列',
    external_link: null,
    memo: '第1話「始まりの日」。dアニメ・Netflixで翌日配信',
  },
  {
    title: 'ポップアップショップ 池袋',
    event_date: '2026-06-06',
    start_time: '11:00',
    end_time: '20:00',
    category: 'グッズ',
    prefecture: '東京都',
    location_name: 'サンシャインシティ アルタ B1',
    external_link: 'https://example.com/popup',
    memo: '6/6〜6/22開催。限定コラボアイテム多数',
  },
  {
    title: 'ポップアップショップ 池袋 最終日',
    event_date: '2026-06-22',
    start_time: '11:00',
    end_time: '18:00',
    category: 'グッズ',
    prefecture: '東京都',
    location_name: 'サンシャインシティ アルタ B1',
    external_link: 'https://example.com/popup',
    memo: '最終日は整理券配布あり',
  },
  {
    title: '第8巻 発売',
    event_date: '2026-06-10',
    start_time: '10:00',
    end_time: null,
    category: '単行本',
    prefecture: null,
    location_name: '全国書店・電子書籍',
    external_link: null,
    memo: 'アニメ第2期放映記念・描き下ろし特典付き',
  },
  {
    title: 'キャラクター誕生日「桜井凛」',
    event_date: '2026-06-12',
    start_time: null,
    end_time: null,
    category: '誕生日',
    prefecture: null,
    location_name: null,
    external_link: null,
    memo: 'ヒロイン桜井凛の誕生日。公式からサプライズ絵公開予定',
  },
  {
    title: 'ファンミーティング 東京',
    event_date: '2026-06-14',
    start_time: '13:00',
    end_time: '17:00',
    category: 'イベント',
    prefecture: '東京都',
    location_name: '品川プリンスホテル ステラボール',
    external_link: 'https://example.com/fanmeet',
    memo: 'キャスト4名登壇。昼の部・夜の部の2公演',
  },
  {
    title: 'ファンミーティング 東京（夜の部）',
    event_date: '2026-06-14',
    start_time: '18:30',
    end_time: '21:30',
    category: 'イベント',
    prefecture: '東京都',
    location_name: '品川プリンスホテル ステラボール',
    external_link: 'https://example.com/fanmeet',
    memo: 'LIVE配信あり（アーカイブ1週間）',
  },
  {
    title: '公式生配信 #24 アニメ振り返り',
    event_date: '2026-06-17',
    start_time: '21:00',
    end_time: '22:30',
    category: '配信',
    prefecture: null,
    location_name: null,
    external_link: 'https://youtube.com',
    memo: '第1〜3話の監督トーク＋視聴者Q&A',
  },
  {
    title: 'BD/DVD Vol.1 予約開始',
    event_date: '2026-06-18',
    start_time: '12:00',
    end_time: null,
    category: 'グッズ',
    prefecture: null,
    location_name: null,
    external_link: 'https://example.com/bd',
    memo: 'Amazon・楽天・Animate先着特典あり',
  },
  {
    title: 'コラボカフェ 大阪',
    event_date: '2026-06-20',
    start_time: '11:00',
    end_time: '21:00',
    category: 'イベント',
    prefecture: '大阪府',
    location_name: 'アニメイトカフェ 大阪日本橋',
    external_link: 'https://example.com/cafe',
    memo: '6/20〜7/6開催。入場特典カード全8種',
  },
  {
    title: '声優 早坂蓮 誕生日',
    event_date: '2026-06-25',
    start_time: null,
    end_time: null,
    category: '誕生日',
    prefecture: null,
    location_name: null,
    external_link: null,
    memo: 'サブキャラ「蓮」担当声優。誕生日配信予定あり',
  },
  {
    title: 'ファンミーティング 大阪',
    event_date: '2026-06-27',
    start_time: '13:00',
    end_time: '17:00',
    category: 'イベント',
    prefecture: '大阪府',
    location_name: 'オリックス劇場',
    external_link: 'https://example.com/fanmeet',
    memo: '東京公演と同内容。物販は12:00〜',
  },
  {
    title: '公式ラジオ 第50回記念放送',
    event_date: '2026-06-28',
    start_time: '22:00',
    end_time: '23:00',
    category: '配信',
    prefecture: null,
    location_name: null,
    external_link: null,
    memo: 'ニコニコ生放送にて同時視聴イベント開催',
  },
];

async function main() {
  console.log('=== テスト作品シード開始 ===\n');

  // ─── 1. 認証（パスワードが設定されている場合のみ） ────────────────
  let userId = null;
  if (TEST_PASSWORD) {
    const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    if (authErr) {
      console.warn('⚠ ログイン失敗:', authErr.message);
      console.warn('  認証なし（anon）でシードを試みます');
    } else {
      userId = auth.user?.id;
      console.log(`✓ ログイン成功: ${TEST_EMAIL} (${userId})`);
    }
  } else {
    console.log('ℹ SEED_PASSWORD 未設定 → 認証なしで実行（RLSが無効な場合のみ動作）');
  }

  // ─── 2. 「テスト」作品を取得 or 作成 ──────────────────────────────
  const { data: existingWorks } = await supabase
    .from('works')
    .select('id, name')
    .eq('name', 'テスト')
    .limit(1);

  let workId;
  if (existingWorks && existingWorks.length > 0) {
    workId = existingWorks[0].id;
    console.log(`✓ 既存の「テスト」作品を使用: ${workId}`);
  } else {
    const { data: newWork, error: workErr } = await supabase
      .from('works')
      .insert({ name: 'テスト', participant_count: 0 })
      .select('id')
      .single();

    if (workErr) {
      console.error('✗ 作品作成失敗:', workErr.message);
      process.exit(1);
    }
    workId = newWork.id;
    console.log(`✓ 「テスト」作品を作成: ${workId}`);
  }

  // ─── 3. 既存の「テスト」作品イベントを確認 ────────────────────────
  const { data: existingEvents } = await supabase
    .from('events')
    .select('id, title')
    .eq('work_id', workId);

  if (existingEvents && existingEvents.length > 0) {
    console.log(`\n既存イベント ${existingEvents.length} 件:`);
    existingEvents.forEach(e => console.log(`  - ${e.title}`));
    console.log('\n既存イベントを削除して再投入します...');

    const { error: delErr } = await supabase
      .from('events')
      .delete()
      .eq('work_id', workId);

    if (delErr) {
      console.error('✗ 削除失敗:', delErr.message);
      process.exit(1);
    }
    console.log('✓ 既存イベント削除完了\n');
  }

  // ─── 4. イベント投入 ───────────────────────────────────────────────
  const records = EVENTS.map(e => ({
    work_id: workId,
    author_id: userId,
    title: e.title,
    event_date: e.event_date,
    start_time: e.start_time,
    end_time: e.end_time,
    end_date: null,
    category: e.category,
    prefecture: e.prefecture,
    location_name: e.location_name,
    external_link: e.external_link,
    memo: e.memo,
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from('events')
    .insert(records)
    .select('id, title, event_date, category');

  if (insertErr) {
    console.error('✗ イベント投入失敗:', insertErr.message);
    process.exit(1);
  }

  console.log(`✓ ${inserted.length} 件のイベントを投入しました:\n`);
  inserted.forEach(e =>
    console.log(`  [${e.category.padEnd(6)}] ${e.event_date}  ${e.title}`)
  );

  // ─── 5. participant_count 更新 ─────────────────────────────────────
  await supabase
    .from('works')
    .update({ participant_count: 1 })
    .eq('id', workId);

  console.log('\n=== シード完了 ===');
  console.log(`作品ID: ${workId}`);
  console.log('アプリで「テスト」作品をフォローすると発見タブに表示されます');
}

main().catch(err => {
  console.error('予期しないエラー:', err);
  process.exit(1);
});
