// チーム用ダッシュボードの中身。api/metrics.ts が返す。
// 依存なし（外部のグラフ用ライブラリを読まない）。グラフはSVGを自前で描く。
//
// 画面側から通信しない作りにしてある。パスワードは普通のHTMLフォームでPOSTし、
// データはサーバーが埋め込んだ状態で返す。Service Worker や sessionStorage の
// 状態に左右されず、JavaScriptが動かなくてもログインだけは必ず反応する。

const HEAD = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ダッシュボード</title>
<style>
  :root{
    --bg:#0e0e10; --card:#17171b; --line:#26262c; --ink:#eceef1;
    --sub:#9aa0a8; --dim:#6b7178;
    --up:#4ea87a; --down:#c96a5b; --accent:#7fb6d9; --warn:#d0a24a;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",system-ui,sans-serif;
    font-size:14px;line-height:1.7;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1180px;margin:0 auto;padding:0 20px 80px}

  /* パスワード */
  #gate{min-height:100vh;display:grid;place-items:center;padding:20px}
  #gate form{width:100%;max-width:320px;text-align:center}
  #gate h1{font-size:19px;margin:0 0 6px;font-weight:700}
  #gate p{color:var(--sub);font-size:13px;margin:0 0 22px}
  #gate input{width:100%;padding:12px 14px;border-radius:8px;border:1px solid var(--line);
    background:var(--card);color:var(--ink);font-size:15px;text-align:center}
  #gate input:focus{outline:2px solid var(--accent);outline-offset:-1px}
  #gate button{width:100%;margin-top:10px;padding:12px;border-radius:8px;border:0;
    background:var(--accent);color:#0e0e10;font-size:15px;font-weight:700;cursor:pointer}
  #gate .err{color:var(--down);font-size:13px;margin-top:12px;min-height:20px}

  /* 見出し */
  header{padding:34px 0 20px;display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;
    justify-content:space-between;border-bottom:1px solid var(--line);margin-bottom:26px}
  header h1{font-size:21px;margin:0;font-weight:700;letter-spacing:.01em}
  header .meta{color:var(--dim);font-size:12px;margin-top:3px}
  .range{display:flex;gap:6px}
  .range button{padding:7px 14px;border-radius:7px;border:1px solid var(--line);
    background:transparent;color:var(--sub);font-size:13px;cursor:pointer}
  .range button.on{background:var(--ink);color:var(--bg);border-color:var(--ink);font-weight:700}

  /* 数字のカード */
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(178px,1fr));gap:12px;margin-bottom:30px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:15px 17px}
  .card .k{color:var(--sub);font-size:12px}
  .card .v{font-size:26px;font-weight:700;margin-top:3px;letter-spacing:-.01em;
    font-variant-numeric:tabular-nums}
  .card .d{font-size:12px;color:var(--dim);margin-top:2px}
  .card .d b{font-weight:700}
  .card .d .u{color:var(--up)} .card .d .w{color:var(--down)}

  /* グラフ */
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:14px}
  .box{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px 10px}
  .box h2{font-size:15px;margin:0;font-weight:700}
  .box .note{color:var(--dim);font-size:12px;margin:3px 0 4px;line-height:1.6}
  .box .read{color:var(--sub);font-size:12px;min-height:20px;font-variant-numeric:tabular-nums}
  .box .read b{color:var(--ink)}
  .keys{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--sub);margin-top:2px}
  .keys i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:middle}
  svg{display:block;width:100%;height:auto;touch-action:none}
  .full{grid-column:1/-1}
  #err{color:var(--down);padding:20px 0}
</style>
</head>
`;

/** パスワード入力の画面。JavaScriptが動かなくても押せる普通のフォーム。 */
export function loginPage(error: string): string {
  return HEAD + `<body>
<div id="gate">
  <form method="post" action="/api/metrics">
    <h1>ダッシュボード</h1>
    <p>パスワードを入れてください</p>
    <input id="pw" name="pw" type="password" autocomplete="current-password" autofocus>
    <button type="submit">開く</button>
    <div class="err">${error}</div>
  </form>
</div>
</body>
</html>`;
}

/** データを埋め込んだダッシュボード本体。 */
export function dashboardPage(dataJson: string): string {
  return HEAD + `<body>
<div class="wrap" id="app">
  <header>
    <div>
      <h1>ダッシュボード</h1>
      <div class="meta" id="meta"></div>
    </div>
    <div class="range">
      <button data-d="30">30日</button>
      <button data-d="90" class="on">90日</button>
      <button data-d="0">全期間</button>
    </div>
  </header>
  <div class="cards" id="cards"></div>
  <div class="grid" id="grid"></div>
  <div id="err"></div>
</div>
<script>window.__DATA__ = ${dataJson};</script>
<script>
// データはサーバーが埋め込み済み。画面側から通信はしない。
var DATA = window.__DATA__;
var RANGE = 90;

// 「アプリを入れた人」はストアの数字だけで出す（アプリ側の記録は通知許可やWebが混ざってずれる）。
//   iPhone … App Store の新規ダウンロードを初日から足し上げたもの
//   Android … Play Console のその日にインストールされている数
// 全期間で積み上げてから表示範囲を切るので、30日表示にしても累計は変わらない。
var ANDROID_INSTALLED = 'play_active_devices';
(function(){
  var dl = DATA.series.asc_downloads || [], an = DATA.series[ANDROID_INSTALLED] || [];
  var ios = [], total = [], acc = 0, seen = false;
  for(var i = 0; i < DATA.days.length; i++){
    if(dl[i] != null){ acc += dl[i]; seen = true; }
    ios.push(seen ? acc : null);
    total.push(seen && an[i] != null ? acc + an[i] : null);
  }
  DATA.series.installed_ios = ios;
  DATA.series.installed_android = an.slice();
  DATA.series.installed_total = total;

  // iPhone の新規ダウンロードは、分析レポート（App Analytics と同じ数え方）がある日はそちらを使い、
  // 無い日（2026-08-22 より前と、まだ届いていない直近）は売上レポートの数字で埋める
  var an1 = DATA.series.asc_an_first_downloads || [];
  DATA.series.ios_first = DATA.days.map(function(_, i){ return an1[i] != null ? an1[i] : (dl[i] != null ? dl[i] : null); });

  // どこから入れたか（分析レポート）を、初日からの累計にする
  ['search','browse','app','web','other'].forEach(function(k){
    var a = DATA.series['asc_an_first_from_' + k] || [], out = [], sum = 0, on = false;
    for(var i = 0; i < DATA.days.length; i++){ if(a[i] != null){ sum += a[i]; on = true; } out.push(on ? sum : null); }
    DATA.series['ios_from_' + k] = out;
  });
})();

/* ---------- 見せ方の設定 ---------- */

var YEN = function(v){ return '¥' + Math.round(v).toLocaleString('ja-JP'); };
var USD = function(v){ return '$' + v.toLocaleString('ja-JP', { maximumFractionDigits: 2 }); };
var RATE = 155; // api/_aiusage.ts と同じ。円の概算に使うだけ
var USDJPY = function(v){ return USD(v) + '（約' + YEN(v * RATE) + '）'; };
var NUM = function(v){ return Math.round(v).toLocaleString('ja-JP'); };

var BOXES = [
  { title:'アプリを入れた人',
    note:'縦軸＝人数。横軸＝日付。ストアの数字だけで数えている。' +
         'iPhone＝App Storeの新規ダウンロードの累計、Android＝Play Consoleのその日にインストールされている数。' +
         '合計はAndroidの数字がある日だけ出る。',
    kind:'line', keys:[{k:'installed_total',   name:'合計', c:'#7fb6d9'},
                       {k:'installed_ios',     name:'iPhone', c:'#4ea87a'},
                       {k:'installed_android', name:'Android', c:'#d0a24a'}], fmt:NUM, zero:false },

  { title:'ストアからの新規ダウンロード',
    note:'縦軸＝その日に初めてアプリを入れた数。横軸＝日付。ストアの公式の数字で、' +
         'iPhoneはApp Store Connect の App Analytics の「初回ダウンロード」（8/22より前は売上レポートの新規ダウンロード）、' +
         'AndroidはPlay Console（アカウント単位）。入れ直し・アップデートは含まない。1〜2日遅れで入る。',
    kind:'bar', keys:[{k:'ios_first', name:'iPhone', c:'#4ea87a'},
                      {k:'play_installs', name:'Android', c:'#d0a24a'}], fmt:NUM },

  { title:'iPhoneはどこから入れたか',
    note:'縦軸＝初回ダウンロードの累計（App Store Connect の App Analytics）。横軸＝日付。' +
         '検索＝App Storeの検索から、ブラウズ＝App Storeのおすすめ・ランキングなどから、' +
         '他のアプリ＝XなどのアプリのリンクからApp Storeへ来た、Web＝ブラウザのリンクから。2026-08-22以降のみ。',
    kind:'line', keys:[{k:'ios_from_search', name:'検索', c:'#4ea87a'},
                       {k:'ios_from_browse', name:'ブラウズ', c:'#7fb6d9'},
                       {k:'ios_from_app',    name:'他のアプリ', c:'#d0a24a'},
                       {k:'ios_from_web',    name:'Web', c:'#b58ad0'}], fmt:NUM },

  { title:'Androidで入っている端末',
    note:'縦軸＝その日にアプリが入っていた端末の数（Play Console）。横軸＝日付。' +
         '消した人は減るので、「残っている人」の目安になる。',
    kind:'line', keys:[{k:'play_active_devices', name:'入っている端末', c:'#d0a24a'}], fmt:NUM, zero:false },

  { title:'実際に使った人',
    note:'縦軸＝投稿・いいね・保存のどれかを1回でもした人の数（累計）。横軸＝日付。' +
         'ふらっと開いただけの訪問者は入らない。',
    kind:'line', keys:[{k:'users_engaged', name:'使った人', c:'#4ea87a'},
                       {k:'users_registered', name:'登録した人', c:'#7fb6d9'}], fmt:NUM, zero:false },

  { title:'のべ訪問端末（Web含む）',
    note:'縦軸＝これまでに開かれた端末・ブラウザの延べ数。横軸＝日付。' +
         '⚠️ 利用者数ではない。同じ人でもブラウザを変えれば別に数えられ、Webのふらっと訪問も全部入る。',
    kind:'line', keys:[{k:'users_total', name:'のべ訪問端末', c:'#5b7f96'}], fmt:NUM, zero:false },

  { title:'新しく開かれた数',
    note:'縦軸＝その日に新しく開かれた端末・ブラウザの数。横軸＝日付。棒が高い日は何かが当たった日。' +
         'これも利用者数ではなく、増減の勢いを見るためのもの。',
    kind:'bar', keys:[{k:'signups', name:'新しく開かれた数', c:'#5b7f96'}], fmt:NUM },

  { title:'動いた人',
    note:'縦軸＝その日に投稿・いいね・保存・閲覧・検索のどれかをした人の数。横軸＝日付。',
    kind:'line', keys:[{k:'active_users', name:'動いた人', c:'#4ea87a'}], fmt:NUM },

  { title:'有料会員',
    note:'縦軸＝その日時点で課金中の人数（累計）。横軸＝日付。薄い線は無料お試し中の人。',
    kind:'line', keys:[{k:'paid_active', name:'課金中', c:'#d0a24a'},
                       {k:'paid_trial',  name:'お試し中', c:'#8a7a4e'}], fmt:NUM, zero:false },

  { title:'投稿といいね',
    note:'縦軸＝その日1日の件数。横軸＝日付。中身が増え続けているかを見る。',
    kind:'bar', keys:[{k:'events_created', name:'投稿', c:'#7fb6d9'},
                      {k:'likes',          name:'いいね', c:'#4ea87a'}], fmt:NUM },

  { title:'買う気配',
    note:'縦軸＝その日1日の回数。横軸＝日付。購入リンクが押された回数と、作品を検索された回数。',
    kind:'bar', keys:[{k:'buy_clicks', name:'購入リンクを押した', c:'#d0a24a'},
                      {k:'searches',   name:'検索した', c:'#5b7f96'}], fmt:NUM },

  { title:'課金の人数（RevenueCat）',
    note:'縦軸＝その日時点の人数。横軸＝日付。iPhoneとAndroidを合わせた数。' +
         '過去にさかのぼれないので、記録を始めた日から伸びる。',
    kind:'line', keys:[{k:'rc_active_subscriptions', name:'課金中', c:'#d0a24a'},
                       {k:'rc_active_trials', name:'無料お試し中', c:'#8a7a4e'}], fmt:NUM, zero:false },

  { title:'入ってくるお金（RevenueCat）',
    note:'縦軸＝ドル。横軸＝日付。継続収入は「いまの契約が続いた場合の月あたり」、' +
         '売上は「直近28日の実績」。どちらもRevenueCatの集計で、iPhoneとAndroidの合計。',
    kind:'line', keys:[{k:'rc_mrr', name:'継続収入（月）', c:'#4ea87a'},
                       {k:'rc_revenue', name:'売上（28日）', c:'#7fb6d9'}], fmt:USD, zero:false },

  { title:'AIにかかったお金',
    note:'縦軸＝その日1日にAIへ払った金額（円）。横軸＝日付。出ていく側の数字。',
    kind:'bar', keys:[{k:'ai_cost_jpy', name:'AI費用', c:'#c96a5b'}], fmt:YEN },

  { title:'たまっている中身',
    note:'縦軸＝その日までに投稿された予定の合計（累計）。横軸＝日付。',
    kind:'line', keys:[{k:'events_total', name:'総投稿数', c:'#4ea87a'}], fmt:NUM, zero:false }
];

/* ---------- 描画 ---------- */

function slice(arr, n){ return n > 0 ? arr.slice(Math.max(0, arr.length - n)) : arr.slice(); }
function sum(a){ var t = 0; for(var i=0;i<a.length;i++){ if(a[i]!=null) t += a[i]; } return t; }
function last(a){ for(var i=a.length-1;i>=0;i--){ if(a[i]!=null) return a[i]; } return null; }
function mmdd(d){ return d.slice(5).replace('-','/'); }

function render(){
  var days = slice(DATA.days, RANGE);
  var S = {};
  for(var k in DATA.series){ S[k] = slice(DATA.series[k], RANGE); }

  var u = new Date(DATA.updatedAt);
  document.getElementById('meta').textContent =
    DATA.days[0] + ' 〜 ' + DATA.days[DATA.days.length-1] +
    '（全' + DATA.days.length + '日）　読み込み ' +
    u.getHours() + ':' + ('0' + u.getMinutes()).slice(-2);

  cards(S);

  var g = document.getElementById('grid');
  g.innerHTML = '';
  BOXES.forEach(function(b){
    var el = document.createElement('div');
    el.className = 'box' + (b.keys.length > 1 ? ' full' : '');
    var keys = b.keys.map(function(s){
      return '<span><i style="background:' + s.c + '"></i>' + s.name + '</span>';
    }).join('');
    el.innerHTML = '<h2>' + b.title + '</h2><div class="note">' + b.note + '</div>' +
                   '<div class="keys">' + keys + '</div>' +
                   '<div class="read"></div><div class="svg"></div>';
    g.appendChild(el);
    draw(el, days, b, S);
  });
}

function cards(S){
  var d7  = function(k){ return sum(slice(S[k] || [], 7)); };
  var d30 = function(k){ return sum(slice(S[k] || [], 30)); };
  var ut  = S.users_total, pa = S.paid_active;

  function delta(arr, back){
    var now = last(arr);
    var before = arr.length > back ? arr[arr.length - 1 - back] : null;
    if(now == null || before == null) return '';
    var d = now - before;
    if(d === 0) return '<span>7日前と同じ</span>';
    var cls = d > 0 ? 'u' : 'w';
    return '<span class="' + cls + '">' + (d > 0 ? '+' : '') + NUM(d) + '</span> 7日前から';
  }

  var ue = S.users_engaged;
  var ni = last(DATA.series.installed_ios), nd = last(DATA.series.installed_android);
  var mrr = last(S.rc_mrr || []), rev = last(S.rc_revenue || []);
  var items = [
    ['アプリを入れた人', ni == null ? '—' : NUM((ni || 0) + (nd || 0)),
      'iPhone ' + (ni == null ? '—' : NUM(ni)) + ' / Android ' + (nd == null ? '取り込み待ち' : NUM(nd))],
    ['新規ダウンロード（直近7日）', NUM(d7('ios_first') + d7('play_installs')),
      'iPhone ' + NUM(d7('ios_first')) + ' / Android ' + NUM(d7('play_installs'))],
    ['実際に使った人', NUM(last(ue) || 0), delta(ue, 7)],
    ['有料会員', NUM(last(pa) || 0), delta(pa, 7)],
    ['動いた人（1日平均・7日）', NUM(d7('active_users') / 7), ''],
    ['AI費用（直近30日）', YEN(d30('ai_cost_jpy')), '1日あたり ' + YEN(d30('ai_cost_jpy') / 30)],
    ['継続収入（月あたり）', mrr == null ? '—' : USD(mrr),
      mrr == null ? '記録はこれから' : '約' + YEN(mrr * RATE) + '（1ドル' + RATE + '円で計算）'],
    ['売上（直近28日）', rev == null ? '—' : USD(rev),
      rev == null ? '記録はこれから' : '約' + YEN(rev * RATE)],
    ['のべ訪問端末', NUM(last(ut) || 0), 'Web含む・利用者数ではない']
  ];

  document.getElementById('cards').innerHTML = items.map(function(it){
    return '<div class="card"><div class="k">' + it[0] + '</div>' +
           '<div class="v">' + it[1] + '</div>' +
           '<div class="d">' + it[2] + '</div></div>';
  }).join('');
}

function draw(el, days, b, S){
  var W = 720, H = 190, PL = 58, PR = 12, PT = 12, PB = 26;
  var n = days.length;
  if(n === 0) return;

  var vals = [];
  b.keys.forEach(function(s){
    (S[s.k] || []).forEach(function(v){ if(v != null) vals.push(v); });
  });
  var hi = vals.length ? Math.max.apply(null, vals) : 1;
  var lo = 0;
  if(b.zero === false && vals.length){
    lo = Math.min.apply(null, vals);
    var pad = (hi - lo) * 0.12 || 1;
    lo = Math.max(0, lo - pad);
  }
  if(hi <= lo) hi = lo + 1;

  var iw = W - PL - PR, ih = H - PT - PB;
  var X = function(i){ return PL + (n <= 1 ? iw / 2 : iw * i / (n - 1)); };
  var Y = function(v){ return PT + ih * (1 - (v - lo) / (hi - lo)); };

  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img">';

  // 横の目盛り
  for(var t = 0; t <= 3; t++){
    var v = lo + (hi - lo) * t / 3, y = Y(v);
    svg += '<line x1="' + PL + '" y1="' + y + '" x2="' + (W - PR) + '" y2="' + y +
           '" stroke="#26262c" stroke-width="1" vector-effect="non-scaling-stroke"/>';
    svg += '<text x="' + (PL - 8) + '" y="' + (y + 4) + '" fill="#6b7178" font-size="11" ' +
           'text-anchor="end">' + b.fmt(v) + '</text>';
  }

  // 日付
  [0, Math.floor((n - 1) / 2), n - 1].forEach(function(i, k){
    if(i < 0 || (k === 1 && n < 4)) return;
    svg += '<text x="' + X(i) + '" y="' + (H - 8) + '" fill="#6b7178" font-size="11" ' +
           'text-anchor="' + (k === 0 ? 'start' : k === 2 ? 'end' : 'middle') + '">' +
           mmdd(days[i]) + '</text>';
  });

  b.keys.forEach(function(s, si){
    var a = S[s.k] || [];
    if(b.kind === 'bar'){
      var bw = Math.max(1, (iw / n) * 0.68 / b.keys.length);
      for(var i = 0; i < n; i++){
        if(a[i] == null || a[i] <= lo) continue;
        var h = Math.max(0.5, Y(lo) - Y(a[i]));
        var x = X(i) - (bw * b.keys.length) / 2 + bw * si;
        svg += '<rect x="' + x + '" y="' + Y(a[i]) + '" width="' + bw + '" height="' + h +
               '" fill="' + s.c + '" opacity="' + (si ? 0.6 : 0.85) + '"/>';
      }
    } else {
      var pts = [];
      for(var j = 0; j < n; j++){ if(a[j] != null) pts.push(X(j) + ',' + Y(a[j])); }
      if(!pts.length) return;
      if(si === 0){
        svg += '<polygon points="' + PL + ',' + Y(lo) + ' ' + pts.join(' ') + ' ' +
               X(n - 1) + ',' + Y(lo) + '" fill="' + s.c + '" opacity="0.10"/>';
      }
      svg += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + s.c +
             '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ' +
             'vector-effect="non-scaling-stroke"/>';
      var lv = last(a);
      if(lv != null){
        svg += '<circle cx="' + X(n - 1) + '" cy="' + Y(lv) + '" r="3" fill="' + s.c + '"/>';
      }
    }
  });

  svg += '<line class="cur" x1="0" y1="' + PT + '" x2="0" y2="' + (H - PB) +
         '" stroke="#eceef1" stroke-width="1" opacity="0" vector-effect="non-scaling-stroke"/>';
  svg += '<rect x="' + PL + '" y="0" width="' + iw + '" height="' + H +
         '" fill="transparent" class="hit"/></svg>';

  el.querySelector('.svg').innerHTML = svg;

  // なぞると日付と数字を出す
  var node = el.querySelector('svg');
  var read = el.querySelector('.read');
  var cur = node.querySelector('.cur');
  function show(ev){
    var r = node.getBoundingClientRect();
    var px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    var i = Math.round(((px / r.width) * W - PL) / (iw / Math.max(1, n - 1)));
    i = Math.min(n - 1, Math.max(0, i));
    cur.setAttribute('x1', X(i)); cur.setAttribute('x2', X(i));
    cur.setAttribute('opacity', '0.35');
    read.innerHTML = days[i] + '　' + b.keys.map(function(s){
      var v = (S[s.k] || [])[i];
      return s.name + ' <b>' + (v == null ? '—' : b.fmt(v)) + '</b>';
    }).join('　');
  }
  function hide(){ cur.setAttribute('opacity', '0'); read.innerHTML = ''; }
  node.addEventListener('mousemove', show);
  node.addEventListener('mouseleave', hide);
  node.addEventListener('touchmove', show, { passive: true });
  node.addEventListener('touchend', hide);
}

document.querySelectorAll('.range button').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('.range button').forEach(function(b){ b.classList.remove('on'); });
    btn.classList.add('on');
    RANGE = Number(btn.dataset.d);
    render();
  });
});

render();
</script>
</body>
</html>`;
}

/** 投稿済みのグッズの手直し（/api/metrics?enrich=1）。下見 → 選ぶ → 書き込む。
 *  このページだけは画面から通信する（下見は1回で全件回すと時間切れになるので、12件ずつ呼ぶ）。
 *  予定のタイトルは利用者が書いたものなので、必ず textContent で入れる（HTMLとして解釈させない）。 */
export function enrichPage(): string {
  return HEAD + `<body>
<div class="wrap">
  <header>
    <div>
      <h1>投稿済みグッズの手直し</h1>
      <div class="meta">値段・在庫の取り直し／販売先・検索結果リンクの追加／リンクの名前／発売日・予約期間。下見では書き込みません</div>
    </div>
    <div class="range">
      <button id="plan">下見を作る</button>
      <button id="nodate">日付の変更を外す</button>
      <button id="apply" disabled>書き込む</button>
    </div>
  </header>
  <div class="read" id="status"></div>
  <div id="list"></div>
  <div id="err"></div>
</div>
<style>
  .row{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:0 0 10px;display:flex;gap:12px}
  .row input{margin-top:5px;width:18px;height:18px;flex-shrink:0}
  .row .t{font-weight:700} .row .w{color:var(--dim);font-size:12px}
  .row ul{margin:6px 0 0;padding-left:18px;color:var(--sub);font-size:13px}
  .row .date{color:var(--warn)}
  .tag{display:inline-block;font-size:11px;padding:0 6px;border-radius:4px;background:var(--warn);color:#0e0e10;margin-left:6px}
  a{color:var(--accent)}
</style>
<script>
(function(){
  var proposals = [];
  var $ = function(id){ return document.getElementById(id); };
  function el(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function download(name, data){
    var a = el('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function render(){
    var list = $('list'); list.textContent = '';
    proposals.forEach(function(p, i){
      var row = el('label', 'row');
      var cb = el('input'); cb.type = 'checkbox'; cb.checked = p.on; cb.onchange = function(){ p.on = cb.checked; count(); };
      var body = el('div');
      var t = el('div', 't', p.title); if (p.dateChange) t.appendChild(el('span', 'tag', '日付'));
      var w = el('div', 'w', p.work + ' ・ '); var link = el('a', null, '予定を開く'); link.href = 'https://fanhive.jp/item/' + encodeURIComponent(p.id); link.target = '_blank'; w.appendChild(link);
      var ul = el('ul'); p.notes.forEach(function(n){ ul.appendChild(el('li', /^(発売日|予約)/.test(n) ? 'date' : null, n)); });
      body.appendChild(t); body.appendChild(w); body.appendChild(ul);
      row.appendChild(cb); row.appendChild(body); list.appendChild(row);
    });
    count();
  }
  function count(){
    var n = proposals.filter(function(p){ return p.on; }).length;
    $('apply').disabled = !n; $('apply').textContent = n ? '選んだ' + n + '件を書き込む' : '書き込む';
  }
  $('plan').onclick = async function(){
    $('plan').disabled = true; proposals = []; render();
    var offset = 0, total = '?';
    try {
      while (offset != null) {
        $('status').textContent = '下見中… ' + offset + ' / ' + total + ' 件（1件あたり数秒かかります）';
        var r = await fetch('/api/metrics?enrich=plan&limit=12&offset=' + offset, {credentials:'same-origin'});
        if (!r.ok) throw new Error('下見に失敗しました (' + r.status + ')');
        var d = await r.json(); total = d.total;
        d.proposals.forEach(function(p){ p.on = true; proposals.push(p); });
        render(); offset = d.next;
      }
      $('status').textContent = '下見が終わりました。変更案 ' + proposals.length + ' 件（グッズ ' + total + ' 件中）。外したいものはチェックを外してください';
      download('enrich-plan-' + new Date().toISOString().slice(0,10) + '.json', proposals);
    } catch (e) { $('err').textContent = String(e && e.message || e); }
    $('plan').disabled = false;
  };
  $('nodate').onclick = function(){ proposals.forEach(function(p){ if (p.dateChange) p.on = false; }); render(); };
  $('apply').onclick = async function(){
    var chosen = proposals.filter(function(p){ return p.on; });
    if (!chosen.length || !confirm(chosen.length + '件の予定を書き換えます。よいですか？')) return;
    $('apply').disabled = true;
    var applied = 0, skipped = [], backup = [];
    try {
      for (var i = 0; i < chosen.length; i += 20) {
        $('status').textContent = '書き込み中… ' + i + ' / ' + chosen.length;
        var body = { changes: chosen.slice(i, i + 20).map(function(p){ return { id: p.id, hash: p.hash, set: p.set }; }) };
        var r = await fetch('/api/metrics?enrich=apply', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
        if (!r.ok) throw new Error('書き込みに失敗しました (' + r.status + ')');
        var d = await r.json(); applied += d.applied; skipped = skipped.concat(d.skipped); backup = backup.concat(d.backup);
      }
    } catch (e) { $('err').textContent = String(e && e.message || e); }
    // 書く前の値は必ず手元に残す（戻すとき用）
    download('enrich-backup-' + new Date().toISOString().slice(0,19).replace(/:/g,'') + '.json', backup);
    $('status').textContent = applied + '件を書き込みました。飛ばした ' + skipped.length + ' 件' + (skipped.length ? '：' + skipped.map(function(s){ return s.reason; }).filter(function(v, i, a){ return a.indexOf(v) === i; }).join('／') : '') + '。書く前の値は enrich-backup の JSON に保存しました';
    var done = {}; backup.forEach(function(b){ done[b.id] = true; });
    proposals = proposals.filter(function(p){ return !done[p.id]; }); render();
  };
})();
</script>
</body>
</html>`;
}
