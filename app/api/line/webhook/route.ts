import { after } from 'next/server';
import { handleMessage } from '@/lib/bot';
import { lineConfig, reply, showLoading, verifySignature } from '@/lib/line';
import { getSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  return Response.json({ ok: true, message: 'LINE webhook พร้อมใช้งาน (ใช้ POST)' });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const { secret, token } = lineConfig();
  if (!secret || !token) {
    return Response.json({ error: 'ยังไม่ได้ตั้ง LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN' }, { status: 500 });
  }
  if (!verifySignature(raw, req.headers.get('x-line-signature'), secret)) {
    return Response.json({ error: 'invalid signature' }, { status: 401 });
  }

  const body = JSON.parse(raw || '{}');
  const events: any[] = body.events || [];

  // ตอบ LINE กลับทันที (200) แล้วค่อยประมวลผลต่อเบื้องหลัง
  after(async () => {
    const settings = await getSettings();
    await Promise.all(
      events.map(async (ev) => {
        try {
          await handleEvent(ev, settings);
        } catch (err) {
          console.error('LINE event error', err);
        }
      })
    );
  });

  return Response.json({ ok: true });
}

async function handleEvent(ev: any, settings: Awaited<ReturnType<typeof getSettings>>) {
  const src = ev.source || {};
  const chatId: string = src.groupId || src.roomId || src.userId;
  const isGroup = src.type === 'group' || src.type === 'room';

  if (ev.type === 'follow' && ev.replyToken) {
    await reply(ev.replyToken, settings.greeting);
    return;
  }
  if (ev.type !== 'message' || !ev.replyToken) return;

  const msg = ev.message;
  if (msg.type !== 'text') {
    if (!isGroup && msg.type !== 'sticker') {
      await reply(
        ev.replyToken,
        settings.gender === 'male' ? 'ตอนนี้รับได้เฉพาะข้อความตัวอักษรนะครับ' : 'ตอนนี้รับได้เฉพาะข้อความตัวอักษรนะคะ'
      );
    }
    return;
  }

  let text: string = msg.text;
  if (isGroup) {
    if (settings.groupMode === 'never') return;
    if (settings.groupMode === 'mention') {
      const mentionees: any[] = msg.mention?.mentionees || [];
      const self = mentionees.find((m) => m.isSelf);
      const calledByName = text.includes(settings.botName);
      if (!self && !calledByName) return;
      if (self) text = (text.slice(0, self.index) + text.slice(self.index + self.length)).trim();
    }
  } else {
    await showLoading(src.userId);
  }

  // ประวัติแชทแยกตามห้อง (กลุ่ม) หรือตามผู้ใช้ (แชทเดี่ยว)
  const sessionId = `line:${chatId}`;
  const { reply: answer } = await handleMessage(sessionId, text || 'สวัสดี', { settings });
  await reply(ev.replyToken, answer, chatId);
}
