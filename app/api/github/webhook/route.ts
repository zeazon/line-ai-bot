import { after } from 'next/server';
import { syncFromGitHub, verifyGitHubSignature } from '@/lib/github';
import { getSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** GitHub webhook (push) → ซิงก์ฐานความรู้อัตโนมัติ */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.GITHUB_WEBHOOK_SECRET || '';
  if (!verifyGitHubSignature(raw, req.headers.get('x-hub-signature-256'), secret)) {
    return Response.json({ error: 'invalid signature' }, { status: 401 });
  }
  const event = req.headers.get('x-github-event');
  if (event === 'ping') return Response.json({ ok: true, pong: true });
  if (event !== 'push') return Response.json({ ok: true, ignored: event });

  const payload = JSON.parse(raw);
  const s = await getSettings();
  const branch = String(payload.ref || '').replace('refs/heads/', '');
  const repo = payload.repository?.full_name;
  if (!s.github.repo || !s.github.repo.toLowerCase().endsWith(String(repo).toLowerCase()) || branch !== s.github.branch) {
    return Response.json({ ok: true, ignored: `${repo}@${branch}` });
  }
  after(async () => {
    try {
      const r = await syncFromGitHub(s);
      console.log('GitHub sync', r.files.length, 'files');
    } catch (err) {
      console.error('GitHub sync error', err);
    }
  });
  return Response.json({ ok: true, syncing: true });
}
