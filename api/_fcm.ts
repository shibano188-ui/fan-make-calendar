import crypto from 'node:crypto';

// FCM HTTP v1 でプッシュを送る最小実装。
//
// firebase-admin を入れない理由: 必要なのは「サービスアカウントでアクセストークンを取って
// messages:send を叩く」だけで、SDKを足すとVercelの関数サイズと起動時間だけが増える。
// 署名は node:crypto でできる（RS256のJWT）。
//
// 環境変数（Firebaseコンソール → プロジェクトの設定 → サービスアカウント → 新しい秘密鍵を生成）:
//   FIREBASE_PROJECT_ID   … 例: fanhive-xxxxx
//   FIREBASE_CLIENT_EMAIL … firebase-adminsdk-xxxxx@<project>.iam.gserviceaccount.com
//   FIREBASE_PRIVATE_KEY  … -----BEGIN PRIVATE KEY----- から始まる文字列（改行は \n のままでよい）

export type PushMessage = {
  token: string;
  title: string;
  body: string;
  /** 通知タップ時にアプリが読む。値はFCMの仕様で**文字列だけ**。 */
  data?: Record<string, string>;
};

type ServiceAccount = { projectId: string; clientEmail: string; privateKey: string };

export function fcmConfigured(): boolean {
  return !!serviceAccount();
}

function serviceAccount(): ServiceAccount | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Vercelの環境変数に貼ると改行が \n の2文字になることが多いので、両方の形を受ける
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

// アクセストークンは1時間有効。関数インスタンスが使い回される間はキャッシュする。
let cachedToken: { value: string; expiresAt: number } | null = null;

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

async function accessToken(sa: ServiceAccount): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
    iss: sa.clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  })}`;
  let assertion: string;
  try {
    const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.privateKey).toString('base64url');
    assertion = `${unsigned}.${sig}`;
  } catch {
    return null; // 鍵の形が壊れている（改行の入れ違いなど）
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

/** 1通送る。戻り値の `dead` が true なら、そのトークンは**もう存在しない**ので宛先から消す。 */
async function sendOne(sa: ServiceAccount, auth: string, m: PushMessage): Promise<{ ok: boolean; dead: boolean }> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.projectId}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: m.token,
        notification: { title: m.title, body: m.body },
        data: m.data,
        android: {
          priority: 'HIGH',
          // 同じ予定の通知が積み上がらないようにまとめる（値下げが続いた日に通知欄が埋まらない）
          collapse_key: m.data?.eventId ?? 'fanhive',
          notification: { default_sound: true },
        },
      },
    }),
  });
  if (res.ok) return { ok: true, dead: false };
  // 404 UNREGISTERED = アンインストール・データ削除でトークンが失効。
  // 400 INVALID_ARGUMENT = そもそも形が違う。どちらも保存し続ける意味がない。
  const dead = res.status === 404 || res.status === 400;
  return { ok: false, dead };
}

/** まとめて送る。同時実行は控えめ（Cronの中で回すので、他の処理の邪魔をしない程度）。 */
export async function sendPushes(messages: PushMessage[]): Promise<{ sent: number; failed: number; deadTokens: string[] }> {
  const sa = serviceAccount();
  if (!sa || !messages.length) return { sent: 0, failed: 0, deadTokens: [] };
  const auth = await accessToken(sa);
  if (!auth) return { sent: 0, failed: messages.length, deadTokens: [] };

  let sent = 0, failed = 0;
  const deadTokens: string[] = [];
  const CONCURRENCY = 8;
  for (let i = 0; i < messages.length; i += CONCURRENCY) {
    const chunk = messages.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(async (m) => {
      try { return await sendOne(sa, auth, m); } catch { return { ok: false, dead: false }; }
    }));
    results.forEach((r, j) => {
      if (r.ok) sent++; else failed++;
      if (r.dead) deadTokens.push(chunk[j].token);
    });
  }
  return { sent, failed, deadTokens };
}
