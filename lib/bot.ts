/** หัวใจของบอท: รับข้อความ → ค้นข้อมูล → สร้าง prompt ตามบุคลิก → ถาม AI → จำประวัติ */
import { generateReply, type ChatMessage } from './ai';
import { retrieve } from './knowledge';
import { buildSystemPrompt } from './persona';
import { getSettings, type Settings } from './settings';
import { del, getJSON, setJSON } from './store';

const RESET_WORDS = ['/reset', 'รีเซ็ต', 'เริ่มใหม่'];

export async function getHistory(sessionId: string) {
  return (await getJSON<ChatMessage[]>(`hist:${sessionId}`)) || [];
}

export async function handleMessage(sessionId: string, text: string, opts: { settings?: Settings; debug?: boolean } = {}) {
  const s = opts.settings || (await getSettings());
  const input = text.trim();

  if (RESET_WORDS.includes(input.toLowerCase())) {
    await del(`hist:${sessionId}`);
    return { reply: s.gender === 'male' ? 'เริ่มบทสนทนาใหม่แล้วครับ' : 'เริ่มบทสนทนาใหม่แล้วค่ะ' };
  }

  const history = (await getHistory(sessionId)).slice(-s.historyTurns * 2);
  // ใช้ข้อความก่อนหน้าของลูกค้าช่วยค้น (เช่น "แล้วสีดำล่ะ")
  const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content || '';
  const kb = await retrieve(`${input}\n${input}\n${lastUser}`, s.knowledgeTopK, s.fullContextChars);
  const system = buildSystemPrompt(s, kb.text);

  let reply: string;
  try {
    reply = await generateReply(s, system, [...history, { role: 'user', content: input }]);
  } catch (err) {
    console.error('AI error', err);
    if (opts.debug) throw err;
    return { reply: s.fallbackMessage, error: String(err) };
  }
  if (!reply) reply = s.fallbackMessage;
  reply = stripMarkdown(reply);

  const next = [...history, { role: 'user' as const, content: input }, { role: 'assistant' as const, content: reply }];
  await setJSON(`hist:${sessionId}`, next.slice(-s.historyTurns * 2), 60 * 60 * 24 * 7); // จำ 7 วัน

  return opts.debug ? { reply, debug: { kbMode: kb.mode, kbHits: kb.hits, system } } : { reply };
}

/** LINE แสดง Markdown ไม่ได้ */
function stripMarkdown(t: string) {
  return t
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}
