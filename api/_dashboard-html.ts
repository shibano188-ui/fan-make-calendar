// チーム用ダッシュボードの中身。api/dashboard.ts がこれをそのまま返す。
// 依存なし（外部のグラフ用ライブラリを読まない）。グラフはSVGを自前で描く。
export const PAGE = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>FanHive 指標</title>
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

  /* 合言葉 */
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
<body>

<div id="gate">
  <form onsubmit="return enter(event)">
    <h1>FanHive 指標</h1>
    <p>合言葉を入れてください</p>
    <input id="pw" type="password" autocomplete="current-password" autofocus>
    <button type="submit">開く</button>
    <div class="err" id="gerr"></div>
  </form>
</div>

<div class="wrap" id="app" hidden>
  <header>
    <div>
      <h1>FanHive 指標</h1>
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

<script>
var DATA = null, RANGE = 90;

function tok(){ try{ return sessionStorage.getItem('fh_metrics') || ''; }catch(e){ return ''; } }
function setTok(v){ try{ sessionStorage.setItem('fh_metrics', v); }catch(e){} }

function enter(e){
  e.preventDefault();
  setTok(document.getElementById('pw').value);
  load();
  return false;
}

function load(){
  if(!tok()){ return; }
  fetch('/api/metrics-data?token=' + encodeURIComponent(tok()))
    .then(function(r){
      if(r.status === 401){
        try{ sessionStorage.removeItem('fh_metrics'); }catch(e){}
        document.getElementById('gerr').textContent = '合言葉が違います';
        throw new Error('401');
      }
      if(!r.ok){ throw new Error('読み込みに失敗しました (' + r.status + ')'); }
      return r.json();
    })
    .then(function(j){
      DATA = j;
      document.getElementById('gate').hidden = true;
      document.getElementById('app').hidden = false;
      render();
    })
    .catch(function(err){
      if(err.message !== '401'){
        document.getElementById('err').textContent = err.message;
      }
    });
}

/* ---------- 見せ方の設定 ---------- */

var YEN = function(v){ return '¥' + Math.round(v).toLocaleString('ja-JP'); };
var NUM = function(v){ return Math.round(v).toLocaleString('ja-JP'); };

var BOXES = [
  { title:'総ユーザー数',
    note:'縦軸＝その日までに登録された人の合計（累計）。横軸＝日付。右上がりなら増えている。',
    kind:'line', keys:[{k:'users_total', name:'総ユーザー数', c:'#7fb6d9'}], fmt:NUM, zero:false },

  { title:'新規登録',
    note:'縦軸＝その日1日に新しく登録した人の数。横軸＝日付。棒が高い日は何かが当たった日。',
    kind:'bar', keys:[{k:'signups', name:'新規登録', c:'#7fb6d9'}], fmt:NUM },

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
  var d7  = function(k){ return sum(slice(S[k], 7)); };
  var d30 = function(k){ return sum(slice(S[k], 30)); };
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

  var items = [
    ['総ユーザー数', NUM(last(ut) || 0), delta(ut, 7)],
    ['有料会員', NUM(last(pa) || 0), delta(pa, 7)],
    ['新規登録（直近7日）', NUM(d7('signups')), '1日あたり ' + NUM(d7('signups') / 7)],
    ['動いた人（1日平均・7日）', NUM(d7('active_users') / 7), ''],
    ['AI費用（直近30日）', YEN(d30('ai_cost_jpy')), '1日あたり ' + YEN(d30('ai_cost_jpy') / 30)]
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

if(tok()) load();
</script>
</body>
</html>`;
