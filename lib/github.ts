/**
 * ซิงก์ไฟล์ความรู้จากรีโป GitHub
 * - กดปุ่ม "ซิงก์" ในหน้าแอดมิน หรือ
 * - ตั้ง GitHub webhook (push) มาที่ /api/github/webhook ให้ซิงก์อัตโนมัติเมื่อแก้ไฟล์
 */
import crypto from 'crypto';
import path from 'path';
import { addDoc, removeBySource, SUPPORTED_EXT } from './knowledge';
import type { Settings } from './settings';

export function githubToken(s: Settings) {
  return s.github.token || process.env.GITHUB_TOKEN || '';
}

function parseRepo(input: string) {
  const m = input.trim().replace(/\.git$/, '').match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)$/);
  if (!m) throw new Error('รูปแบบรีโปไม่ถูกต้อง ใช้ owner/repo หรือ URL ของ GitHub');
  return { owner: m[1], repo: m[2] };
}

async function gh(url: string, token: string, accept = 'application/vnd.github+json') {
  const headers: Record<string, string> = { Accept: accept, 'User-Agent': 'line-ai-bot', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res = await fetch(url, { headers, cache: 'no-store' });
  if (res.status === 401 && token) {
    // token หมดอายุ/ผิด → ลองแบบไม่ใช้ token (ใช้ได้กับรีโป public)
    delete headers.Authorization;
    res = await fetch(url, { headers, cache: 'no-store' });
  }
  if (!res.ok) {
    const hint = res.status === 404 ? ' (ไม่พบรีโป/branch หรือรีโปเป็น private แต่ไม่ได้ใส่ token)' : '';
    throw new Error(`GitHub ${res.status}${hint}: ${(await res.text()).slice(0, 200)}`);
  }
  return res;
}

export async function syncFromGitHub(s: Settings) {
  const { owner, repo } = parseRepo(s.github.repo);
  const token = githubToken(s);
  const branch = s.github.branch || 'main';
  const prefix = s.github.path.replace(/^\/+|\/+$/g, '');

  const tree = await (
    await gh(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token)
  ).json();
  const files = (tree.tree as { path: string; type: string; size?: number }[]).filter(
    (f) =>
      f.type === 'blob' &&
      (!prefix || f.path === prefix || f.path.startsWith(prefix + '/')) &&
      SUPPORTED_EXT.includes(path.extname(f.path).toLowerCase()) &&
      !/(^|\/)readme\.md$/i.test(f.path) &&
      (f.size || 0) < 8 * 1024 * 1024
  );
  if (!files.length) throw new Error(`ไม่พบไฟล์ที่รองรับใน ${owner}/${repo}/${prefix || ''} (branch ${branch})`);

  await removeBySource('github');
  const results: { name: string; chunks?: number; error?: string }[] = [];
  for (const f of files.slice(0, 200)) {
    try {
      const res = await gh(
        `https://api.github.com/repos/${owner}/${repo}/contents/${f.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,
        token,
        'application/vnd.github.raw'
      );
      const buf = Buffer.from(await res.arrayBuffer());
      const name = prefix ? f.path.slice(prefix.length + 1) || f.path : f.path;
      const meta = await addDoc(name, buf, 'github');
      results.push({ name, chunks: meta.chunks });
    } catch (err) {
      results.push({ name: f.path, error: String(err instanceof Error ? err.message : err) });
    }
  }
  return { repo: `${owner}/${repo}`, branch, files: results };
}

export function verifyGitHubSignature(raw: string, sig: string | null, secret: string) {
  if (!sig || !secret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
