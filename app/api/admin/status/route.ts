import { headers } from 'next/headers';
import { keyStatus } from '@/lib/ai';
import { isAdmin, unauthorized } from '@/lib/auth';
import { githubToken } from '@/lib/github';
import { getBotInfo, lineConfig } from '@/lib/line';
import { getSettings } from '@/lib/settings';
import { storeMode } from '@/lib/store';

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  const s = await getSettings();
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  const base = `${proto}://${host}`;
  const { secret, token } = lineConfig();
  return Response.json({
    store: storeMode,
    onVercel: !!process.env.VERCEL,
    vercel: process.env.VERCEL
      ? {
          env: process.env.VERCEL_ENV,
          url: process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL,
          gitRepo: process.env.VERCEL_GIT_REPO_OWNER
            ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
            : null,
          gitBranch: process.env.VERCEL_GIT_COMMIT_REF || null,
          commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
        }
      : null,
    line: { secret: !!secret, token: !!token, bot: token ? await getBotInfo() : null },
    webhookUrl: `${base}/api/line/webhook`,
    githubWebhookUrl: `${base}/api/github/webhook`,
    githubWebhookSecret: !!process.env.GITHUB_WEBHOOK_SECRET,
    githubToken: !!githubToken(s),
    aiKeys: keyStatus(s),
    adminPassword: !!process.env.ADMIN_PASSWORD,
  });
}
