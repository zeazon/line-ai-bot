import { isAdmin, unauthorized } from '@/lib/auth';
import { addDoc, getDocChunks, listDocs, removeDoc, retrieve } from '@/lib/knowledge';
import { getSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const maxDuration = 60;

// GET            → รายการไฟล์
// GET ?id=...    → ดูเนื้อหาที่แยกแล้วของไฟล์
// GET ?q=...     → ทดสอบค้นหา
export async function GET(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const q = url.searchParams.get('q');
  if (id) return Response.json({ chunks: (await getDocChunks(id)).slice(0, 300) });
  if (q) {
    const s = await getSettings();
    return Response.json(await retrieve(q, s.knowledgeTopK, s.fullContextChars));
  }
  return Response.json({ docs: await listDocs() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const form = await req.formData();
  const results = [];
  for (const f of form.getAll('files')) {
    if (typeof f === 'string') continue;
    try {
      const meta = await addDoc(f.name, Buffer.from(await f.arrayBuffer()), 'upload');
      results.push({ name: f.name, ok: true, chunks: meta.chunks });
    } catch (err) {
      results.push({ name: f.name, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  // รองรับวางข้อความตรงๆ
  const text = form.get('text');
  const textName = String(form.get('textName') || 'ข้อมูลเพิ่มเติม.txt');
  if (typeof text === 'string' && text.trim()) {
    const name = /\.(txt|md|csv)$/i.test(textName) ? textName : textName + '.txt';
    const meta = await addDoc(name, Buffer.from(text, 'utf8'), 'upload');
    results.push({ name, ok: true, chunks: meta.chunks });
  }
  return Response.json({ results });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'missing id' }, { status: 400 });
  if (id.startsWith('repo-')) {
    return Response.json({ error: 'ไฟล์จากโฟลเดอร์ knowledge/ ต้องลบในรีโปแล้ว deploy ใหม่' }, { status: 400 });
  }
  await removeDoc(id);
  return Response.json({ ok: true });
}
