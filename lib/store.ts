/**
 * ที่เก็บข้อมูลแบบ key-value
 * - บน Vercel: ใช้ Upstash Redis (ติดตั้งจาก Vercel Marketplace แล้วจะได้ env ให้อัตโนมัติ)
 * - เครื่องตัวเอง: ถ้าไม่ได้ตั้ง Redis จะเก็บลงไฟล์ .data/store.json
 */
import { promises as fs } from 'fs';
import path from 'path';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const PREFIX = process.env.STORE_PREFIX || 'linebot:';

export const storeMode: 'redis' | 'file' = REDIS_URL && REDIS_TOKEN ? 'redis' : 'file';

async function redis<T = unknown>(command: (string | number)[]): Promise<T> {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Redis error: ${data.error || res.status}`);
  return data.result as T;
}

// ---------- file fallback ----------
const FILE = path.join(process.cwd(), '.data', 'store.json');
let fileCache: Record<string, { v: string; exp?: number }> | null = null;

async function loadFile() {
  if (fileCache) return fileCache;
  try {
    fileCache = JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    fileCache = {};
  }
  return fileCache!;
}
async function saveFile() {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(fileCache));
}

// ---------- public API ----------
export async function getJSON<T>(key: string): Promise<T | null> {
  const k = PREFIX + key;
  let raw: string | null = null;
  if (storeMode === 'redis') {
    raw = await redis<string | null>(['GET', k]);
  } else {
    const db = await loadFile();
    const item = db[k];
    if (item && (!item.exp || item.exp > Date.now())) raw = item.v;
  }
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJSON(key: string, value: unknown, ttlSeconds?: number) {
  const k = PREFIX + key;
  const v = JSON.stringify(value);
  if (storeMode === 'redis') {
    await redis(ttlSeconds ? ['SET', k, v, 'EX', ttlSeconds] : ['SET', k, v]);
  } else {
    const db = await loadFile();
    db[k] = { v, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined };
    await saveFile();
  }
}

export async function del(key: string) {
  const k = PREFIX + key;
  if (storeMode === 'redis') {
    await redis(['DEL', k]);
  } else {
    const db = await loadFile();
    delete db[k];
    await saveFile();
  }
}
