import { checkPassword, setAdminCookie } from '@/lib/auth';

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: '' }));
  if (!checkPassword(String(password || ''))) {
    return Response.json({ error: 'รหัสผ่านไม่ถูกต้อง' }, { status: 401 });
  }
  await setAdminCookie();
  return Response.json({ ok: true });
}
