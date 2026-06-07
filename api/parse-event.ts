import type { VercelRequest, VercelResponse } from '@vercel/node';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const EXTRACT_PROMPT = `以下の情報から、含まれるイベント・予定をすべて抽出してください。
1件のみの場合も必ず配列で返してください。
日本語で回答し、情報がない・不明な場合はnullを設定してください。
必ずJSON配列のみを返してください（余計な説明不要）。

[
  {
    "title": "イベントのタイトル（必須、簡潔に）",
    "date": "開始日をYYYY-MM-DD形式で or null",
    "time": "開始時刻をHH:mm形式で or null",
    "endDate": "終了日をYYYY-MM-DD形式で or null",
    "endTime": "終了時刻をHH:mm形式で or null",
    "category": "単行本|グッズ|イベント|誕生日|配信 のいずれか or null",
    "prefecture": "都道府県名（「都」「府」「県」を除いた形。例: 東京・大阪・神奈川・北海道）or null",
    "locationDetail": "詳細な会場名・住所 or null",
    "link": "公式URL or null",
    "memo": "補足情報・注意事項 or null"
  }
]`;

async function fetchPageText(url: string): Promise<string> {
  try {
    const isTwitter = /twitter\.com|x\.com/.test(url);
    if (isTwitter) {
      const oembed = await fetch(
        `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`,
      );
      if (oembed.ok) {
        const data = await oembed.json() as { html?: string; author_name?: string };
        const html = data.html ?? '';
        return `投稿者: ${data.author_name ?? ''}\n内容: ${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`;
      }
    }
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FanMakeCalendar/1.0)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return `URL: ${url}`;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
    return `URL: ${url}\n\n${text}`;
  } catch {
    return `URL: ${url}`;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { url, imageBase64, mimeType } = req.body as {
    url?: string;
    imageBase64?: string;
    mimeType?: string;
  };

  if (!url && !imageBase64) {
    return res.status(400).json({ error: 'url or imageBase64 is required' });
  }

  try {
    let rawText: string;

    if (imageBase64) {
      const completion = await groq.chat.completions.create({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType ?? 'image/jpeg'};base64,${imageBase64}` },
            },
            { type: 'text', text: `この画像のイベント情報を抽出してください。\n\n${EXTRACT_PROMPT}` },
          ],
        }],
      });
      rawText = completion.choices[0]?.message?.content ?? '';
    } else {
      const pageText = await fetchPageText(url!);
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `${pageText}\n\n---\n${EXTRACT_PROMPT}`,
        }],
      });
      rawText = completion.choices[0]?.message?.content ?? '';
    }

    const arrayMatch = rawText.match(/\[[\s\S]*\]/);
    const objectMatch = rawText.match(/\{[\s\S]*\}/);
    if (!arrayMatch && !objectMatch) return res.status(422).json({ error: 'Could not parse response' });

    let parsed: unknown[];
    if (arrayMatch) {
      const arr = JSON.parse(arrayMatch[0]);
      parsed = Array.isArray(arr) ? arr : [arr];
    } else {
      parsed = [JSON.parse(objectMatch![0])];
    }
    return res.status(200).json(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(err);
    return res.status(500).json({ error: 'Internal server error', detail: msg });
  }
}
