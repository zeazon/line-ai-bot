import { getJSON, setJSON } from './store';

export type Gender = 'female' | 'male' | 'neutral';
export type Provider = 'openai' | 'anthropic' | 'gemini' | 'compatible';
export type GroupMode = 'mention' | 'always' | 'never';

export interface Settings {
  // ---- บุคลิกบอท ----
  botName: string;
  gender: Gender;
  selfPronoun: string; // สรรพนามแทนตัวเอง เช่น ดิฉัน / ผม / เรา / หนู
  customerPronoun: string; // เรียกลูกค้าว่า เช่น คุณลูกค้า / พี่ / คุณ
  personality: string; // ลักษณะนิสัย (ข้อความอิสระ)
  tone: 'friendly' | 'formal' | 'playful' | 'concise';
  useEmoji: boolean;
  language: 'th' | 'auto';
  businessInfo: string; // ข้อมูลร้าน/ธุรกิจแบบสั้น
  extraRules: string; // กฎเพิ่มเติม
  greeting: string; // ข้อความทักทายเมื่อมีคนเพิ่มเพื่อน
  fallbackMessage: string; // เมื่อไม่มีข้อมูลในฐานข้อมูล
  strictKnowledge: boolean; // ตอบเฉพาะจากฐานข้อมูลเท่านั้น
  maxReplyChars: number;

  // ---- AI ----
  provider: Provider;
  model: string;
  baseUrl: string; // ใช้กับ provider = compatible
  temperature: number;
  maxTokens: number;
  apiKeys: Partial<Record<Provider, string>>; // ไม่บังคับ (แนะนำให้ใส่ใน env)

  // ---- แชท ----
  historyTurns: number;
  groupMode: GroupMode;
  knowledgeTopK: number;
  fullContextChars: number; // ถ้าฐานข้อมูลรวมน้อยกว่านี้ จะส่งทั้งหมดให้ AI

  // ---- GitHub ----
  github: {
    repo: string; // owner/repo
    branch: string;
    path: string; // โฟลเดอร์ในรีโป เช่น knowledge
    token: string; // ไม่บังคับ (ต้องใช้ถ้ารีโปเป็น private) แนะนำใส่ env GITHUB_TOKEN
  };
}

export const DEFAULT_MODELS: Record<Provider, string> = {
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-haiku-5-5',
  gemini: 'gemini-2.5-flash',
  compatible: 'typhoon-v2.1-12b-instruct',
};

export const defaultSettings: Settings = {
  botName: 'น้องมโน',
  gender: 'female',
  selfPronoun: 'น้อง',
  customerPronoun: 'คุณลูกค้า',
  personality: 'ร่าเริง ใจดี ใส่ใจลูกค้า ตอบตรงประเด็น ไม่เยิ่นเย้อ',
  tone: 'friendly',
  useEmoji: true,
  language: 'th',
  businessInfo: '',
  extraRules: '',
  greeting: 'สวัสดีค่ะ ยินดีต้อนรับนะคะ 😊 สอบถามสินค้า ราคา หรือข้อมูลร้านได้เลยค่ะ',
  fallbackMessage: 'ขออภัยค่ะ ตอนนี้ยังไม่มีข้อมูลเรื่องนี้ เดี๋ยวแอดมินจะติดต่อกลับนะคะ',
  strictKnowledge: true,
  maxReplyChars: 1500,

  provider: 'openai',
  model: DEFAULT_MODELS.openai,
  baseUrl: 'https://api.opentyphoon.ai/v1',
  temperature: 0.5,
  maxTokens: 800,
  apiKeys: {},

  historyTurns: 6,
  groupMode: 'mention',
  knowledgeTopK: 8,
  fullContextChars: 12000,

  github: { repo: '', branch: 'main', path: 'knowledge', token: '' },
};

export async function getSettings(): Promise<Settings> {
  const saved = await getJSON<Partial<Settings>>('settings');
  return {
    ...defaultSettings,
    ...saved,
    apiKeys: { ...(saved?.apiKeys || {}) },
    github: { ...defaultSettings.github, ...(saved?.github || {}) },
  };
}

export async function saveSettings(patch: Partial<Settings>) {
  const current = await getSettings();
  const next: Settings = {
    ...current,
    ...patch,
    apiKeys: mergeSecrets(current.apiKeys, patch.apiKeys),
    github: {
      ...current.github,
      ...(patch.github || {}),
      token: keepSecret(current.github.token, patch.github?.token),
    },
  };
  await setJSON('settings', next);
  return next;
}

/** ค่าลับที่ส่งมาเป็น "••••" แปลว่าไม่เปลี่ยน */
function keepSecret(oldVal: string, newVal?: string) {
  if (newVal === undefined || newVal.startsWith('••••')) return oldVal;
  return newVal.trim();
}
function mergeSecrets(oldKeys: Settings['apiKeys'], newKeys?: Settings['apiKeys']) {
  const out = { ...oldKeys };
  if (!newKeys) return out;
  for (const [k, v] of Object.entries(newKeys)) {
    out[k as Provider] = keepSecret(oldKeys[k as Provider] || '', v);
  }
  return out;
}

export function mask(v?: string) {
  if (!v) return '';
  return '••••' + v.slice(-4);
}

/** สำหรับส่งไปหน้าแอดมิน (ซ่อนคีย์) */
export function publicSettings(s: Settings): Settings {
  const keys: Settings['apiKeys'] = {};
  for (const [k, v] of Object.entries(s.apiKeys)) keys[k as Provider] = mask(v);
  return { ...s, apiKeys: keys, github: { ...s.github, token: mask(s.github.token) } };
}
