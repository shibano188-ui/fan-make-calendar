// Google ドライブへの同期（予定表の画像）。
//
// 権限は drive.file（**このスクリプトが作ったファイルだけ**読み書きできる）。柴野さんのドライブのほかのファイルは見えない。
// マイドライブ（個人の Gmail）なので、サービスアカウントは使えない（保存容量を持てず、アップロードが失敗する）。
// 代わりに柴野さんの Google アカウントで一度許可して得た refresh token を使う（scripts/sns-schedule/drive-auth.mjs）。
//
// ドライブの中の形:
//   FanHive 予定表/            ← 最初の実行で作る。できたら共有したいフォルダの中へ手で移してよい（移しても書ける）
//     manifest.json            ← 作品ごとの「前回の中身の指紋」。変化が無い作品は作り直さない
//     僕のヒーローアカデミア/  2026-10-1.png …
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const ROOT_NAME = 'FanHive 予定表';
const FOLDER = 'application/vnd.google-apps.folder';

export async function connect({ clientId, clientSecret, refreshToken }) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  const tok = await r.json();
  if (!tok.access_token) throw new Error(`Google の認証に失敗: ${JSON.stringify(tok)}`);
  const H = { Authorization: `Bearer ${tok.access_token}` };

  const call = async (url, init = {}) => {
    const res = await fetch(url, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
    if (!res.ok) throw new Error(`Drive ${init.method ?? 'GET'} ${url.split('?')[0]}: ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };
  const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const list = async (query) => (await call(`${API}/files?${new URLSearchParams({ q: `${query} and trashed=false`, fields: 'files(id,name,mimeType)', pageSize: '1000' })}`)).files;

  const folder = async (name, parent) => {
    const hit = (await list(`name='${q(name)}' and mimeType='${FOLDER}'${parent ? ` and '${parent}' in parents` : ''}`))[0];
    if (hit) return hit.id;
    return (await call(`${API}/files?fields=id`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) }),
    })).id;
  };

  // 同じ名前のファイルがあれば中身を差し替える（ファイルのIDとリンクが変わらない）。無ければ作る
  const put = async (parent, name, body, mime) => {
    const hit = (await list(`name='${q(name)}' and '${parent}' in parents`))[0];
    const meta = hit ? {} : { name, parents: [parent] };
    const boundary = 'fanhive' + Math.random().toString(36).slice(2);
    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
    const payload = Buffer.concat([Buffer.from(head), Buffer.from(body), Buffer.from(`\r\n--${boundary}--`)]);
    return call(`${UPLOAD}/files${hit ? `/${hit.id}` : ''}?uploadType=multipart&fields=id`, {
      method: hit ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: payload,
    });
  };

  const root = await folder(ROOT_NAME);
  return {
    async readManifest() {
      const hit = (await list(`name='manifest.json' and '${root}' in parents`))[0];
      if (!hit) return {};
      const res = await fetch(`${API}/files/${hit.id}?alt=media`, { headers: H });
      return res.ok ? res.json() : {};
    },
    writeManifest: (m) => put(root, 'manifest.json', JSON.stringify(m, null, 2), 'application/json'),
    /** 作品のフォルダを、files（{名前: PNGのBuffer}）と同じ中身にする。要らなくなった月の画像はゴミ箱へ */
    async syncWork(work, files) {
      const dir = await folder(work, root);
      for (const [name, buf] of Object.entries(files)) await put(dir, name, buf, 'image/png');
      for (const f of await list(`'${dir}' in parents`)) {
        if (!(f.name in files)) await call(`${API}/files/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
      }
    },
  };
}
