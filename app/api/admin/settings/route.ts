import { isAdmin, unauthorized } from '@/lib/auth';
import { getSettings, publicSettings, saveSettings } from '@/lib/settings';

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  return Response.json(publicSettings(await getSettings()));
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const patch = await req.json();
  const saved = await saveSettings(patch);
  return Response.json(publicSettings(saved));
}
