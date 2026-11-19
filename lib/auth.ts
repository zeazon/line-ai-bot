import crypto from 'crypto';
import { cookies } from 'next/headers';

const COOKIE = 'admin_session';

function token(password: string) {
  return crypto.createHmac('sha256', password).update('line-ai-bot-admin').digest('hex');
}

export function adminConfigured() {
  return !!process.env.ADMIN_PASSWORD || process.env.NODE_ENV !== 'production';
}

export function checkPassword(pw: string) {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) return process.env.NODE_ENV !== 'production'; // ตอนพัฒนาในเครื่อง ไม่ต้องมีรหัส
  const a = Buffer.from(token(pw));
  const b = Buffer.from(token(real));
  return crypto.timingSafeEqual(a, b);
}

export async function isAdmin() {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) return process.env.NODE_ENV !== 'production';
  const c = (await cookies()).get(COOKIE)?.value;
  return c === token(real);
}

export async function setAdminCookie() {
  const real = process.env.ADMIN_PASSWORD || '';
  (await cookies()).set(COOKIE, token(real), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearAdminCookie() {
  (await cookies()).delete(COOKIE);
}

export function unauthorized() {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}
