import crypto from 'crypto';

const API = 'https://api.line.me/v2/bot';

export function lineConfig() {
  return {
    secret: process.env.LINE_CHANNEL_SECRET || '',
    token: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  };
}

export function verifySignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function call(path: string, body: unknown) {
  const { token } = lineConfig();
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LINE ${path} ${res.status}: ${await res.text()}`);
}

/** ตัดข้อความยาวเป็นหลายบับเบิล (LINE จำกัด 5,000 ตัวอักษร / 5 ข้อความต่อครั้ง) */
export function toMessages(text: string) {
  const parts: string[] = [];
  let rest = text.trim() || '...';
  while (rest.length && parts.length < 5) {
    if (rest.length <= 4900) {
      parts.push(rest);
      break;
    }
    let cut = rest.lastIndexOf('\n', 4900);
    if (cut < 2000) cut = 4900;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trim();
  }
  return parts.map((t) => ({ type: 'text', text: t }));
}

export async function reply(replyToken: string, text: string, fallbackTo?: string) {
  try {
    await call('/message/reply', { replyToken, messages: toMessages(text) });
  } catch (err) {
    // reply token หมดอายุ (เกิน ~1 นาที) → ส่งแบบ push แทน
    if (fallbackTo) await push(fallbackTo, text);
    else throw err;
  }
}

export async function push(to: string, text: string) {
  await call('/message/push', { to, messages: toMessages(text) });
}

/** แสดงจุดๆ "กำลังพิมพ์" (ใช้ได้เฉพาะแชท 1:1) */
export async function showLoading(chatId: string, seconds = 20) {
  try {
    await call('/chat/loading/start', { chatId, loadingSeconds: seconds });
  } catch {
    /* ไม่สำคัญ */
  }
}

export async function getBotInfo() {
  const { token } = lineConfig();
  if (!token) return null;
  try {
    const res = await fetch(API + '/info', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { error: `${res.status} ${await res.text()}` };
    return await res.json();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
