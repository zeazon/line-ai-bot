import { isAdmin, unauthorized } from '@/lib/auth';
import { handleMessage } from '@/lib/bot';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** ทดสอบคุยกับบอทจากหน้าแอดมิน (ใช้ตรรกะเดียวกับ LINE) */
export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const { message, sessionId } = await req.json();
  try {
    const out = await handleMessage(`test:${sessionId || 'admin'}`, String(message || ''), { debug: true });
    return Response.json(out);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
