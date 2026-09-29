// 最初に一度だけ: 柴野さんの Google アカウントで「FanHive 予定表」を書き込む許可を取り、GitHub の Secrets に入れる。
//
//   node scripts/sns-schedule/drive-auth.mjs <Google Cloud から落とした client_secret_….json>
//
// ブラウザが開くので、ドライブの共有フォルダを持っているアカウントで「許可」を押す。
// 許可の範囲は drive.file（このスクリプトが作ったファイルだけ）。取れた refresh token は画面に出さず、
// そのまま gh secret set で GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET / GDRIVE_REFRESH_TOKEN に入れる。
// 取り消すときは Google アカウント → セキュリティ → サードパーティのアクセス から外す。
import fs from 'node:fs';
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error('usage: drive-auth.mjs <client_secret_….json>'); process.exit(1); }
const c = JSON.parse(fs.readFileSync(file, 'utf8')).installed;
if (!c) { console.error('「デスクトップ アプリ」の OAuth クライアントの JSON を渡してください'); process.exit(1); }

const server = http.createServer();
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const redirect = `http://127.0.0.1:${server.address().port}`;
const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: c.client_id, redirect_uri: redirect, response_type: 'code',
  scope: 'https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent',
});
console.log('ブラウザで許可してください（開かなければこのURLを開く）:\n' + url);
execFileSync('open', [url]);

const code = await new Promise((ok, ng) => server.on('request', (req, res) => {
  const q = new URL(req.url, redirect).searchParams;
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(q.get('code') ? '許可を受け取りました。このタブは閉じてかまいません。' : `失敗しました: ${q.get('error')}`);
  server.close();
  q.get('code') ? ok(q.get('code')) : ng(new Error(q.get('error')));
}));

const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ code, client_id: c.client_id, client_secret: c.client_secret, redirect_uri: redirect, grant_type: 'authorization_code' }),
})).json();
if (!tok.refresh_token) { console.error('refresh token が取れませんでした:', tok.error ?? tok); process.exit(1); }

for (const [name, value] of [['GDRIVE_CLIENT_ID', c.client_id], ['GDRIVE_CLIENT_SECRET', c.client_secret], ['GDRIVE_REFRESH_TOKEN', tok.refresh_token]]) {
  execFileSync('gh', ['secret', 'set', name], { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
}
console.log('GitHub の Secrets に3つ入れました。Actions の「SNS 予定表」を手で1回動かすと、ドライブに「FanHive 予定表」ができます。');
