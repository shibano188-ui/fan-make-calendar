import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACT_PROMPT = `以下のイベント情報から、次のJSON形式でデータを抽出してください。
日本語で回答し、情報がない・不明な場合はnullを設定してください。
必ずJSONのみを返してください（余計な説明不要）。

{
  "title": "イベントのタイトル（必須、簡潔に）",
  "date": "YYYY-MM-DD形式の日付 or null",
  "time": "HH:mm形式の時刻 or null",
  "category": "単行本|グッズ|イベント|誕生日|配信 のいずれか or null",
  "prefecture": "日本の都道府県名（漢字）or null",
  "locationDetail": "詳細な会場名・住所 or null",
  "link": "公式URL or null",
  "memo": "補足情報・注意事項 or null"
}`;

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
    let userContent: Anthropic.MessageParam['content'];

    if (imageBase64) {
      userContent = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: (mimeType ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: imageBase64,
          },
        },
        { type: 'text', text: `この画像のイベント情報を抽出してください。\n\n${EXTRACT_PROMPT}` },
      ];
    } else {
      const pageText = await fetchPageText(url!);
      userContent = `${pageText}\n\n---\n${EXTRACT_PROMPT}`;
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: userContent }],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(422).json({ error: 'Could not parse response' });

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
