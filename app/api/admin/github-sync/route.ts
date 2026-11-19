import { isAdmin, unauthorized } from '@/lib/auth';
import { syncFromGitHub } from '@/lib/github';
import { getSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST() {
  if (!(await isAdmin())) return unauthorized();
  try {
    const s = await getSettings();
    if (!s.github.repo) return Response.json({ error: 'ยังไม่ได้ตั้งค่ารีโป GitHub' }, { status: 400 });
    return Response.json(await syncFromGitHub(s));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
