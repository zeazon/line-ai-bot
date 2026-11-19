/**
 * เชื่อมต่อ AI หลายเจ้า ผ่าน fetch ตรง (ไม่ต้องลง SDK)
 * - openai     : OpenAI
 * - anthropic  : Claude
 * - gemini     : Google Gemini
 * - compatible : ทุกเจ้าที่ใช้ API แบบ OpenAI (OpenRouter, Groq, DeepSeek, Typhoon, Ollama, LM Studio ...)
 */
import type { Provider, Settings } from './settings';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const PROVIDER_PRESETS = {
  openai: { label: 'OpenAI', models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'] },
  anthropic: { label: 'Anthropic Claude', models: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] },
  gemini: { label: 'Google Gemini', models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'] },
  compatible: {
    label: 'OpenAI-compatible',
    models: [],
    bases: [
      { name: 'Typhoon (ภาษาไทย)', url: 'https://api.opentyphoon.ai/v1', model: 'typhoon-v2.1-12b-instruct' },
      { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1-mini' },
      { name: 'Groq', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
      { name: 'DeepSeek', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
      { name: 'Ollama (เครื่องตัวเอง)', url: 'http://localhost:11434/v1', model: 'llama3.1' },
    ],
  },
} as const;

const ENV_KEYS: Record<Provider, string[]> = {
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  compatible: ['COMPATIBLE_API_KEY', 'OPENROUTER_API_KEY', 'TYPHOON_API_KEY', 'GROQ_API_KEY'],
};

export function resolveApiKey(s: Settings, provider: Provider = s.provider) {
  const fromUi = s.apiKeys[provider];
  if (fromUi) return fromUi;
  for (const name of ENV_KEYS[provider]) if (process.env[name]) return process.env[name]!;
  return '';
}

export function keyStatus(s: Settings) {
  const out: Record<string, 'ui' | 'env' | 'none'> = {};
  for (const p of Object.keys(ENV_KEYS) as Provider[]) {
    out[p] = s.apiKeys[p] ? 'ui' : ENV_KEYS[p].some((n) => process.env[n]) ? 'env' : 'none';
  }
  return out;
}

async function postJSON(url: string, headers: Record<string, string>, body: unknown) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 50_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const msg = data?.error?.message || data?.error || data?.message || text.slice(0, 300);
      throw new Error(`AI ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateReply(s: Settings, system: string, messages: ChatMessage[]): Promise<string> {
  const key = resolveApiKey(s);
  const model = s.model.trim();
  if (!key && !(s.provider === 'compatible' && /localhost|127\.0\.0\.1/.test(s.baseUrl))) {
    throw new Error(`ยังไม่ได้ใส่ API key ของ ${s.provider}`);
  }

  switch (s.provider) {
    case 'openai': {
      const data = await postJSON(
        'https://api.openai.com/v1/chat/completions',
        { Authorization: `Bearer ${key}` },
        {
          model,
          messages: [{ role: 'system', content: system }, ...messages],
          temperature: s.temperature,
          max_completion_tokens: s.maxTokens,
        }
      );
      return data.choices?.[0]?.message?.content?.trim() || '';
    }

    case 'compatible': {
      const base = s.baseUrl.replace(/\/+$/, '');
      const headers: Record<string, string> = {};
      if (key) headers.Authorization = `Bearer ${key}`;
      if (base.includes('openrouter.ai')) {
        headers['HTTP-Referer'] = process.env.APP_URL || 'https://vercel.app';
        // HTTP header ใส่ได้แค่ตัวอักษรภาษาอังกฤษ — ชื่อบอทภาษาไทยจะทำให้ error
        headers['X-Title'] = /^[\x20-\x7E]+$/.test(s.botName) ? s.botName : 'LINE AI Bot';
      }
      const data = await postJSON(`${base}/chat/completions`, headers, {
        model,
        messages: [{ role: 'system', content: system }, ...messages],
        temperature: s.temperature,
        max_tokens: s.maxTokens,
      });
      return data.choices?.[0]?.message?.content?.trim() || '';
    }

    case 'anthropic': {
      const data = await postJSON(
        'https://api.anthropic.com/v1/messages',
        { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        {
          model,
          system,
          messages: mergeSameRole(messages),
          temperature: s.temperature,
          max_tokens: s.maxTokens,
        }
      );
      return (data.content || [])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('')
        .trim();
    }

    case 'gemini': {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const data = await postJSON(
        url,
        { 'x-goog-api-key': key },
        {
          systemInstruction: { parts: [{ text: system }] },
          contents: mergeSameRole(messages).map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: { temperature: s.temperature, maxOutputTokens: s.maxTokens },
        }
      );
      const parts = data.candidates?.[0]?.content?.parts || [];
      return parts.map((p: any) => p.text || '').join('').trim();
    }
  }
}

/** Claude/Gemini ต้องสลับ user/assistant และเริ่มด้วย user */
function mergeSameRole(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += '\n' + m.content;
    else out.push({ ...m });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}
