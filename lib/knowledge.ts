/**
 * ฐานความรู้สำหรับตอบลูกค้า
 * แหล่งข้อมูล 3 แบบ:
 *  1. upload  — อัปโหลดไฟล์จากหน้าแอดมิน (เก็บใน Redis)
 *  2. repo    — ไฟล์ในโฟลเดอร์ knowledge/ ของโปรเจกต์นี้ (push ขึ้น GitHub แล้ว Vercel deploy ให้อัตโนมัติ)
 *  3. github  — ซิงก์จากรีโป GitHub อื่น (ผ่าน GitHub API / webhook)
 *
 * รองรับไฟล์: .txt .md .csv .tsv .json .xlsx .pdf
 * ค้นหาแบบ keyword + bigram ภาษาไทย (ไม่ต้องใช้ embedding / ไม่มีค่าใช้จ่ายเพิ่ม)
 */
import { promises as fs } from 'fs';
import path from 'path';
import { del, getJSON, setJSON } from './store';

export type Source = 'upload' | 'github' | 'repo';

export interface DocMeta {
  id: string;
  name: string;
  source: Source;
  size: number;
  chars: number;
  chunks: number;
  updatedAt: string;
}

export const SUPPORTED_EXT = ['.txt', '.md', '.csv', '.tsv', '.json', '.xlsx', '.pdf'];

// =============== Parsing ===============

export async function parseFile(name: string, buf: Buffer): Promise<string[]> {
  const ext = path.extname(name).toLowerCase();
  switch (ext) {
    case '.csv':
    case '.tsv':
      return rowsToChunks(parseCSV(stripBom(buf.toString('utf8')), ext === '.tsv' ? '\t' : undefined), name);
    case '.json':
      return jsonToChunks(stripBom(buf.toString('utf8')), name);
    case '.xlsx':
      return xlsxToChunks(buf, name);
    case '.pdf':
      return textToChunks(await pdfToText(buf), name);
    case '.txt':
    case '.md':
      return textToChunks(stripBom(buf.toString('utf8')), name);
    default:
      throw new Error(`ไม่รองรับไฟล์ ${ext} (รองรับ ${SUPPORTED_EXT.join(' ')})`);
  }
}

function stripBom(s: string) {
  return s.replace(/^﻿/, '');
}

function parseCSV(text: string, forcedDelim?: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delim =
    forcedDelim ||
    [',', ';', '\t', '|'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** ตาราง: 1 แถว = 1 ชิ้นข้อมูล เขียนเป็น "หัวคอลัมน์: ค่า" เพื่อให้ AI เข้าใจ */
function rowsToChunks(rows: unknown[][], source: string): string[] {
  if (!rows.length) return [];
  const header = rows[0].map((h, i) => String(h ?? '').trim() || `คอลัมน์${i + 1}`);
  return rows.slice(1).map((r) => {
    const parts = header
      .map((h, i) => {
        const v = cellToString(r[i]);
        return v ? `${h}: ${v}` : '';
      })
      .filter(Boolean);
    return `[${source}] ${parts.join(' | ')}`;
  }).filter((c) => c.length > source.length + 4);
}

function cellToString(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, ' ').trim();
}

function jsonToChunks(text: string, source: string): string[] {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : null;
  if (arr && arr.length && typeof arr[0] === 'object') {
    const keys = Array.from(new Set(arr.flatMap((o: object) => Object.keys(o || {})))) as string[];
    return rowsToChunks([keys, ...arr.map((o: any) => keys.map((k) => flat(o?.[k])))], source);
  }
  return textToChunks(JSON.stringify(data, null, 2), source);
}
function flat(v: unknown) {
  return v && typeof v === 'object' ? JSON.stringify(v) : v;
}

async function xlsxToChunks(buf: Buffer, source: string): Promise<string[]> {
  const mod: any = await import('read-excel-file/node');
  const readXlsxFile = mod.default || mod;
  const result: any = await readXlsxFile(buf);
  // v9 คืนค่าเป็น [{ sheet, data }] ส่วนเวอร์ชันเก่าคืนเป็นแถวของชีตแรก
  const sheets: { sheet: string; data: unknown[][] }[] =
    Array.isArray(result) && result[0] && 'sheet' in result[0] ? result : [{ sheet: 'Sheet1', data: result }];
  return sheets.flatMap((s) => rowsToChunks(s.data, sheets.length > 1 ? `${source}/${s.sheet}` : source));
}

async function pdfToText(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n\n') : text;
}

/** ข้อความยาว: ตัดเป็นช่วงละ ~700 ตัวอักษร ตามย่อหน้า/หัวข้อ */
function textToChunks(text: string, source: string, size = 700): string[] {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  const paras = clean.split(/\n\s*\n|(?=\n#{1,6} )/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = '';
  let heading = '';
  for (const p of paras) {
    const h = p.match(/^#{1,6} (.+)/);
    if (h) heading = h[1].trim();
    if ((cur + '\n\n' + p).length > size && cur) {
      chunks.push(cur);
      cur = heading && !h ? `(${heading})\n${p}` : p;
    } else cur = cur ? cur + '\n\n' + p : p;
    while (cur.length > size * 1.6) {
      chunks.push(cur.slice(0, size));
      cur = cur.slice(size - 80);
    }
  }
  if (cur) chunks.push(cur);
  return chunks.map((c) => `[${source}] ${c}`);
}

// =============== Storage ===============

const INDEX_KEY = 'kb:index';
const VERSION_KEY = 'kb:version';

export async function listDocs(): Promise<DocMeta[]> {
  const stored = (await getJSON<DocMeta[]>(INDEX_KEY)) || [];
  const repo = (await loadRepoFolder()).map((d) => d.meta);
  return [...stored, ...repo];
}

export async function addDoc(name: string, buf: Buffer, source: Source = 'upload') {
  const chunks = await parseFile(name, buf);
  if (!chunks.length) throw new Error(`ไม่พบข้อความในไฟล์ ${name}`);
  const index = (await getJSON<DocMeta[]>(INDEX_KEY)) || [];
  // ไฟล์ชื่อเดิม + แหล่งเดิม = แทนที่
  const existing = index.find((d) => d.name === name && d.source === source);
  const id = existing?.id || `${source}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const meta: DocMeta = {
    id,
    name,
    source,
    size: buf.length,
    chars: chunks.reduce((n, c) => n + c.length, 0),
    chunks: chunks.length,
    updatedAt: new Date().toISOString(),
  };
  await setJSON(`kb:doc:${id}`, chunks);
  await setJSON(INDEX_KEY, [...index.filter((d) => d.id !== id), meta]);
  await bumpVersion();
  return meta;
}

export async function removeDoc(id: string) {
  const index = (await getJSON<DocMeta[]>(INDEX_KEY)) || [];
  await del(`kb:doc:${id}`);
  await setJSON(INDEX_KEY, index.filter((d) => d.id !== id));
  await bumpVersion();
}

export async function removeBySource(source: Source) {
  const index = (await getJSON<DocMeta[]>(INDEX_KEY)) || [];
  for (const d of index.filter((d) => d.source === source)) await del(`kb:doc:${d.id}`);
  await setJSON(INDEX_KEY, index.filter((d) => d.source !== source));
  await bumpVersion();
}

export async function getDocChunks(id: string): Promise<string[]> {
  const repo = (await loadRepoFolder()).find((d) => d.meta.id === id);
  if (repo) return repo.chunks;
  return (await getJSON<string[]>(`kb:doc:${id}`)) || [];
}

async function bumpVersion() {
  await setJSON(VERSION_KEY, Date.now());
}

// ---- โฟลเดอร์ knowledge/ ในโปรเจกต์ ----
let repoCache: { meta: DocMeta; chunks: string[] }[] | null = null;

async function loadRepoFolder() {
  if (repoCache) return repoCache;
  const dir = path.join(process.cwd(), 'knowledge');
  const out: { meta: DocMeta; chunks: string[] }[] = [];
  const walk = async (d: string) => {
    let entries: import('fs').Dirent[] = [];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (SUPPORTED_EXT.includes(path.extname(e.name).toLowerCase()) && !/^readme/i.test(e.name)) {
        try {
          const rel = path.relative(dir, full).split(path.sep).join('/');
          const buf = await fs.readFile(full);
          const chunks = await parseFile(rel, buf);
          out.push({
            meta: {
              id: `repo-${rel}`,
              name: rel,
              source: 'repo',
              size: buf.length,
              chars: chunks.reduce((n, c) => n + c.length, 0),
              chunks: chunks.length,
              updatedAt: '',
            },
            chunks,
          });
        } catch (err) {
          console.error('knowledge/ parse error', e.name, err);
        }
      }
    }
  };
  await walk(dir);
  repoCache = out;
  return out;
}

// =============== Retrieval ===============

interface Indexed {
  version: number;
  chunks: string[];
  tokens: Set<string>[];
  df: Map<string, number>;
  totalChars: number;
}
let cache: Indexed | null = null;

async function loadAll(): Promise<Indexed> {
  const version = (await getJSON<number>(VERSION_KEY)) || 0;
  if (cache && cache.version === version) return cache;
  const index = (await getJSON<DocMeta[]>(INDEX_KEY)) || [];
  const stored = await Promise.all(index.map((d) => getJSON<string[]>(`kb:doc:${d.id}`)));
  const repo = await loadRepoFolder();
  const chunks = [...repo.flatMap((r) => r.chunks), ...stored.flatMap((c) => c || [])];
  const tokens = chunks.map((c) => new Set(tokenize(c)));
  const df = new Map<string, number>();
  for (const set of tokens) for (const t of set) df.set(t, (df.get(t) || 0) + 1);
  cache = { version, chunks, tokens, df, totalChars: chunks.reduce((n, c) => n + c.length, 0) };
  return cache;
}

const THAI = /[฀-๿]+/g;
const LATIN = /[a-z0-9]+(?:[.\-/][a-z0-9]+)*/g;
const THAI_MARKS = /[ัิ-ฺ็-๎]/g; // สระบน/ล่าง/วรรณยุกต์

/** ภาษาไทยไม่มีช่องว่าง → ใช้ bigram ของพยัญชนะ+สระหลัก ส่วนภาษาอังกฤษ/ตัวเลขใช้ทั้งคำ */
export function tokenize(text: string): string[] {
  const s = text.toLowerCase();
  const out: string[] = [];
  for (const m of s.match(LATIN) || []) {
    out.push(m);
    if (m.includes('-') || m.includes('.') || m.includes('/')) out.push(...m.split(/[.\-/]/).filter((x) => x.length > 1));
  }
  for (const m of s.match(THAI) || []) {
    const base = m.replace(THAI_MARKS, '');
    if (base.length === 1) out.push('ท:' + base);
    for (let i = 0; i < base.length - 1; i++) out.push('ท:' + base.slice(i, i + 2));
  }
  return out;
}

const STOP = new Set(
  ['ครับ', 'ค่ะ', 'คะ', 'นะ', 'ไหม', 'มั้ย', 'หน่อย', 'อยาก', 'ขอ', 'สอบถาม', 'ถาม', 'เท่าไหร่', 'เท่าไร', 'ยังไง', 'อะไร', 'บ้าง', 'มี']
    .flatMap((w) => tokenize(w))
);

export async function retrieve(query: string, topK = 8, fullContextChars = 12000) {
  const kb = await loadAll();
  if (!kb.chunks.length) return { text: '', mode: 'empty' as const, hits: 0 };
  if (kb.totalChars <= fullContextChars) {
    return { text: kb.chunks.join('\n'), mode: 'full' as const, hits: kb.chunks.length };
  }
  const q = Array.from(new Set(tokenize(query))).filter((t) => !STOP.has(t));
  const N = kb.chunks.length;
  const scored: { i: number; score: number }[] = [];
  kb.tokens.forEach((set, i) => {
    let score = 0;
    for (const t of q) {
      if (!set.has(t)) continue;
      const df = kb.df.get(t) || 1;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      score += t.startsWith('ท:') ? idf : idf * 2.5; // คำอังกฤษ/รหัสสินค้าตรงตัว ให้น้ำหนักมากกว่า
    }
    if (score > 0) scored.push({ i, score: score / (1 + Math.log(1 + set.size / 80)) });
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.score || 0;
  const picked = scored.filter((s) => s.score >= best * 0.35).slice(0, topK);
  return { text: picked.map((p) => kb.chunks[p.i]).join('\n'), mode: 'search' as const, hits: picked.length };
}

export function invalidateRepoCache() {
  repoCache = null;
  cache = null;
}
