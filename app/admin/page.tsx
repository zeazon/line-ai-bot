'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

type Provider = 'openai' | 'anthropic' | 'gemini' | 'compatible';
type Settings = {
  botName: string; gender: 'female' | 'male' | 'neutral'; selfPronoun: string; customerPronoun: string;
  personality: string; tone: 'friendly' | 'formal' | 'playful' | 'concise'; useEmoji: boolean; language: 'th' | 'auto';
  businessInfo: string; extraRules: string; greeting: string; fallbackMessage: string; strictKnowledge: boolean;
  maxReplyChars: number; provider: Provider; model: string; baseUrl: string; temperature: number; maxTokens: number;
  apiKeys: Partial<Record<Provider, string>>; historyTurns: number; groupMode: 'mention' | 'always' | 'never';
  knowledgeTopK: number; fullContextChars: number;
  github: { repo: string; branch: string; path: string; token: string };
};
type Doc = { id: string; name: string; source: 'upload' | 'github' | 'repo'; size: number; chars: number; chunks: number; updatedAt: string };

const TABS = [
  ['overview', 'ภาพรวม & เชื่อมต่อ'],
  ['persona', 'บุคลิกบอท'],
  ['knowledge', 'ฐานข้อมูลตอบลูกค้า'],
  ['ai', 'AI ที่ใช้'],
  ['github', 'GitHub'],
  ['test', 'ทดสอบแชท'],
] as const;
type Tab = (typeof TABS)[number][0];

const MODELS: Record<Provider, string[]> = {
  openai: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'],
  anthropic: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
  compatible: [],
};
const COMPAT = [
  { name: 'Typhoon (ไทย)', url: 'https://api.opentyphoon.ai/v1', model: 'typhoon-v2.1-12b-instruct' },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1-mini' },
  { name: 'Groq', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { name: 'DeepSeek', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'Ollama', url: 'http://localhost:11434/v1', model: 'llama3.1' },
];
const PROVIDER_LABEL: Record<Provider, string> = { openai: 'OpenAI', anthropic: 'Claude', gemini: 'Gemini', compatible: 'อื่นๆ (OpenAI-compatible)' };
const ENV_NAME: Record<Provider, string> = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY', compatible: 'COMPATIBLE_API_KEY' };

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw Object.assign(new Error('unauthorized'), { status: 401 });
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export default function Admin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [s, setS] = useState<Settings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState('');

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const load = useCallback(async () => {
    try { setS(await api('/api/admin/settings')); setAuthed(true); setDirty(false); }
    catch (e: any) { if (e.status === 401) setAuthed(false); else flash(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => { setS((p) => (p ? { ...p, [k]: v } : p)); setDirty(true); };

  const save = async () => {
    if (!s) return;
    try {
      setS(await api('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }));
      setDirty(false); flash('บันทึกแล้ว ✓');
    } catch (e: any) { flash('บันทึกไม่สำเร็จ: ' + e.message); }
  };

  if (authed === false) return <Login onOk={load} />;
  if (!s) return <div className="login">กำลังโหลด…</div>;

  return (
    <div className="shell">
      <nav className="side">
        <h1><span className="dot" /> LINE AI Bot</h1>
        <small>{s.botName}</small>
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
        <button className="logout" onClick={async () => { await api('/api/admin/logout', { method: 'POST' }); setAuthed(false); }}>ออกจากระบบ</button>
      </nav>
      <main>
        {tab === 'overview' && <Overview />}
        {tab === 'persona' && <Persona s={s} set={set} />}
        {tab === 'knowledge' && <Knowledge s={s} set={set} flash={flash} />}
        {tab === 'ai' && <AI s={s} set={set} />}
        {tab === 'github' && <GitHub s={s} set={set} flash={flash} dirty={dirty} save={save} />}
        {tab === 'test' && <TestChat dirty={dirty} />}
      </main>
      {dirty && (
        <div className="savebar">
          <button className="btn" onClick={save}>บันทึกการตั้งค่า</button>
          <button className="btn ghost" onClick={load}>ยกเลิก</button>
          <span style={{ color: 'var(--muted)' }}>มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Login({ onOk }: { onOk: () => void }) {
  const [pw, setPw] = useState(''); const [err, setErr] = useState('');
  return (
    <div className="login">
      <form className="card" onSubmit={async (e) => {
        e.preventDefault();
        try { await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) }); onOk(); }
        catch (e: any) { setErr(e.message === 'unauthorized' ? 'รหัสผ่านไม่ถูกต้อง' : e.message); }
      }}>
        <h3>เข้าสู่ระบบแอดมิน</h3>
        <label className="f">รหัสผ่าน<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
        {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
        <p><button className="btn" style={{ width: '100%' }}>เข้าสู่ระบบ</button></p>
        <small style={{ color: 'var(--muted)' }}>ตั้งรหัสด้วย env <code>ADMIN_PASSWORD</code></small>
      </form>
    </div>
  );
}

type SP = { s: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void };

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg">{options.map(([v, l]) => <button type="button" key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

// ===================== ภาพรวม =====================
function Overview() {
  const [st, setSt] = useState<any>(null);
  useEffect(() => { api('/api/admin/status').then(setSt).catch(() => {}); }, []);
  if (!st) return <p>กำลังตรวจสอบ…</p>;
  const P = ({ ok, warn, children }: { ok: boolean; warn?: boolean; children: ReactNode }) =>
    <span className={`pill ${ok ? 'ok' : warn ? 'warn' : 'no'}`}>{children}</span>;
  const anyKey = Object.values(st.aiKeys).some((v) => v !== 'none');
  return (
    <>
      <h2>ภาพรวม & การเชื่อมต่อ</h2>
      <p className="lead">เช็กสถานะทุกส่วนก่อนเปิดใช้งานจริง</p>
      <div className="card">
        <h3>สถานะ</h3>
        <div className="row"><span>LINE Messaging API</span><P ok={st.line.secret && st.line.token}>{st.line.secret && st.line.token ? (st.line.bot?.displayName ? `เชื่อมแล้ว: ${st.line.bot.displayName}` : 'ตั้งค่าแล้ว') : 'ยังไม่ได้ตั้ง env'}</P></div>
        {st.line.bot?.error && <div className="row"><span>LINE error</span><code>{st.line.bot.error}</code></div>}
        <div className="row"><span>AI API key</span><P ok={anyKey}>{anyKey ? Object.entries(st.aiKeys).filter(([, v]) => v !== 'none').map(([k]) => k).join(', ') : 'ยังไม่มี'}</P></div>
        <div className="row"><span>ที่เก็บข้อมูล</span><P ok={st.store === 'redis'} warn={!st.onVercel}>{st.store === 'redis' ? 'Upstash Redis' : st.onVercel ? 'ไฟล์ชั่วคราว — ต้องเพิ่ม Redis!' : 'ไฟล์ในเครื่อง (.data)'}</P></div>
        <div className="row"><span>Vercel</span><P ok={!!st.onVercel} warn={!st.onVercel}>{st.onVercel ? `${st.vercel.env} · ${st.vercel.url}` : 'รันในเครื่อง'}</P></div>
        {st.vercel?.gitRepo && <div className="row"><span>Deploy จาก GitHub</span><span className="mono">{st.vercel.gitRepo}@{st.vercel.gitBranch} ({st.vercel.commit})</span></div>}
        <div className="row"><span>รหัสแอดมิน</span><P ok={st.adminPassword} warn={!st.onVercel}>{st.adminPassword ? 'ตั้งแล้ว' : 'ยังไม่ได้ตั้ง ADMIN_PASSWORD'}</P></div>
      </div>
      <div className="card">
        <h3>เชื่อมต่อ LINE</h3>
        <ol className="steps">
          <li>ไปที่ <a href="https://developers.line.biz/console/" target="_blank">LINE Developers Console</a> → สร้าง Provider → Messaging API channel</li>
          <li>คัดลอก <b>Channel secret</b> (แท็บ Basic settings) และออก <b>Channel access token (long-lived)</b> (แท็บ Messaging API)</li>
          <li>ใส่ใน Vercel → Project → Settings → Environment Variables: <code>LINE_CHANNEL_SECRET</code>, <code>LINE_CHANNEL_ACCESS_TOKEN</code> แล้ว Redeploy</li>
          <li>ตั้ง Webhook URL เป็น <code>{st.webhookUrl}</code> → กด Verify → เปิด <b>Use webhook</b></li>
          <li>ใน LINE Official Account Manager ปิด “ข้อความตอบกลับอัตโนมัติ” (Auto-reply) เพื่อไม่ให้ตอบซ้ำ</li>
        </ol>
      </div>
    </>
  );
}

// ===================== บุคลิก =====================
function Persona({ s, set }: SP) {
  const genderDefaults = (g: Settings['gender']) => {
    set('gender', g);
    if (g === 'male' && ['น้อง', 'ดิฉัน', 'หนู'].includes(s.selfPronoun)) set('selfPronoun', 'ผม');
    if (g === 'female' && ['ผม', 'เรา'].includes(s.selfPronoun)) set('selfPronoun', 'น้อง');
    if (g === 'neutral' && ['ผม', 'ดิฉัน', 'หนู'].includes(s.selfPronoun)) set('selfPronoun', 'เรา');
  };
  return (
    <>
      <h2>บุคลิกบอท</h2>
      <p className="lead">กำหนดชื่อ เพศ นิสัย และวิธีพูดของบอท</p>
      <div className="card grid2">
        <label className="f">ชื่อบอท<input type="text" value={s.botName} onChange={(e) => set('botName', e.target.value)} /></label>
        <div className="f"><b style={{ fontSize: 14 }}>เพศ</b>
          <Seg value={s.gender} onChange={genderDefaults} options={[['female', 'หญิง (ค่ะ)'], ['male', 'ชาย (ครับ)'], ['neutral', 'ไม่ระบุ']]} /></div>
        <label className="f">แทนตัวเองว่า<input type="text" value={s.selfPronoun} onChange={(e) => set('selfPronoun', e.target.value)} placeholder="น้อง / ดิฉัน / ผม / เรา" /></label>
        <label className="f">เรียกลูกค้าว่า<input type="text" value={s.customerPronoun} onChange={(e) => set('customerPronoun', e.target.value)} placeholder="คุณลูกค้า / พี่ / คุณ" /></label>
        <label className="f full">ลักษณะนิสัย<span className="h">อธิบายเหมือนกำลังบอกพนักงานใหม่ เช่น “ร่าเริง ชอบแนะนำสินค้าคู่กัน พูดภาษาใต้นิดๆ”</span>
          <textarea value={s.personality} onChange={(e) => set('personality', e.target.value)} /></label>
        <div className="f full"><b style={{ fontSize: 14 }}>โทนการพูด</b>
          <Seg value={s.tone} onChange={(v) => set('tone', v)} options={[['friendly', 'เป็นกันเอง'], ['formal', 'ทางการ'], ['playful', 'ขี้เล่น'], ['concise', 'สั้นกระชับ']]} /></div>
        <label className="check"><input type="checkbox" checked={s.useEmoji} onChange={(e) => set('useEmoji', e.target.checked)} /> ใช้อีโมจิ</label>
        <label className="f">ภาษาที่ตอบ<select value={s.language} onChange={(e) => set('language', e.target.value as any)}><option value="th">ไทยเสมอ</option><option value="auto">ตามภาษาลูกค้า</option></select></label>
      </div>
      <div className="card grid2">
        <label className="f full">ข้อมูลร้าน/ธุรกิจโดยย่อ<span className="h">ชื่อร้าน เวลาเปิด-ปิด ที่อยู่ ช่องทางติดต่อ — บอทจะรู้เสมอโดยไม่ต้องค้น</span>
          <textarea value={s.businessInfo} onChange={(e) => set('businessInfo', e.target.value)} /></label>
        <label className="f full">ข้อความทักทาย (เมื่อมีคนเพิ่มเพื่อน)<textarea value={s.greeting} onChange={(e) => set('greeting', e.target.value)} /></label>
        <label className="f full">เมื่อไม่มีข้อมูล ให้ตอบว่า<textarea value={s.fallbackMessage} onChange={(e) => set('fallbackMessage', e.target.value)} /></label>
        <label className="f full">กฎเพิ่มเติม<span className="h">เช่น “ห้ามให้ส่วนลดเอง” “ถ้าถามเรื่องเคลมให้ขอเลขบิล”</span>
          <textarea value={s.extraRules} onChange={(e) => set('extraRules', e.target.value)} /></label>
        <label className="f">ความยาวคำตอบสูงสุด (ตัวอักษร)<input type="number" value={s.maxReplyChars} onChange={(e) => set('maxReplyChars', +e.target.value)} /></label>
        <label className="f">ในกลุ่มแชท<select value={s.groupMode} onChange={(e) => set('groupMode', e.target.value as any)}>
          <option value="mention">ตอบเมื่อถูก @ หรือเรียกชื่อ</option><option value="always">ตอบทุกข้อความ</option><option value="never">ไม่ตอบในกลุ่ม</option></select></label>
      </div>
    </>
  );
}

// ===================== ฐานข้อมูล =====================
function Knowledge({ s, set, flash }: SP & { flash: (m: string) => void }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [preview, setPreview] = useState<{ name: string; chunks: string[] } | null>(null);
  const [q, setQ] = useState(''); const [qr, setQr] = useState<any>(null);
  const [text, setText] = useState(''); const [textName, setTextName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => api('/api/admin/knowledge').then((d) => setDocs(d.docs)).catch((e) => flash(e.message)), [flash]);
  useEffect(() => { refresh(); }, [refresh]);

  const upload = async (files: FileList | File[] | null, extra?: { text: string; name: string }) => {
    const fd = new FormData();
    for (const f of Array.from(files || [])) fd.append('files', f);
    if (extra) { fd.append('text', extra.text); fd.append('textName', extra.name || 'ข้อมูลเพิ่มเติม.txt'); }
    setBusy(true);
    try {
      const r = await api('/api/admin/knowledge', { method: 'POST', body: fd });
      const bad = r.results.filter((x: any) => !x.ok);
      flash(bad.length ? `ผิดพลาด: ${bad.map((b: any) => `${b.name} (${b.error})`).join(', ')}` : `เพิ่ม ${r.results.length} ไฟล์แล้ว ✓`);
      refresh();
    } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };
  const total = docs.reduce((n, d) => n + d.chars, 0);

  return (
    <>
      <h2>ฐานข้อมูลตอบลูกค้า</h2>
      <p className="lead">อัปโหลดไฟล์รายการสินค้า ราคา FAQ นโยบาย — บอทจะค้นจากไฟล์เหล่านี้ก่อนตอบ</p>
      <div className={`card drop ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
        <p style={{ margin: '0 0 10px' }}>ลากไฟล์มาวาง หรือ</p>
        <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'กำลังอัปโหลด…' : 'เลือกไฟล์'}</button>
        <input ref={fileRef} type="file" multiple hidden accept=".txt,.md,.csv,.tsv,.json,.xlsx,.pdf" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
        <p style={{ margin: '10px 0 0', fontSize: 13 }}>รองรับ .csv .xlsx .txt .md .json .pdf (สูงสุด ~4MB/ครั้ง) · ไฟล์ตาราง: แถวแรกต้องเป็นหัวคอลัมน์ · อัปโหลดชื่อเดิม = แทนที่ไฟล์เก่า</p>
      </div>

      <div className="card">
        <h3>ไฟล์ทั้งหมด ({docs.length}) · {total.toLocaleString()} ตัวอักษร</h3>
        {docs.length === 0 ? <p style={{ color: 'var(--muted)' }}>ยังไม่มีข้อมูล</p> : (
          <table><thead><tr><th>ไฟล์</th><th>ที่มา</th><th>ชิ้นข้อมูล</th><th>อัปเดต</th><th /></tr></thead><tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td><a href="#" onClick={async (e) => { e.preventDefault(); const r = await api(`/api/admin/knowledge?id=${encodeURIComponent(d.id)}`); setPreview({ name: d.name, chunks: r.chunks }); }}>{d.name}</a></td>
                <td><span className={`tag ${d.source}`}>{{ upload: 'อัปโหลด', github: 'GitHub', repo: 'knowledge/' }[d.source]}</span></td>
                <td>{d.chunks}</td>
                <td>{d.updatedAt ? new Date(d.updatedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : 'deploy'}</td>
                <td style={{ textAlign: 'right' }}>{d.source !== 'repo' && <button className="btn danger" onClick={async () => {
                  if (!confirm(`ลบ ${d.name}?`)) return; await api(`/api/admin/knowledge?id=${encodeURIComponent(d.id)}`, { method: 'DELETE' }); refresh(); }}>ลบ</button>}</td>
              </tr>))}
          </tbody></table>)}
        {preview && (
          <details open style={{ marginTop: 14 }}><summary>ตัวอย่างข้อมูลที่บอทเห็น: {preview.name} ({preview.chunks.length} ชิ้นแรก)</summary>
            <pre className="prompt">{preview.chunks.slice(0, 40).join('\n\n')}</pre></details>)}
      </div>

      <div className="card grid2">
        <h3 className="full" style={{ margin: 0 }}>พิมพ์/วางข้อมูลเอง</h3>
        <label className="f full">ชื่อ<input type="text" value={textName} onChange={(e) => setTextName(e.target.value)} placeholder="เช่น โปรโมชันเดือนนี้.txt" /></label>
        <label className="f full">เนื้อหา<textarea style={{ minHeight: 120 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="วางข้อความ หรือ CSV ก็ได้ (ตั้งชื่อลงท้าย .csv)" /></label>
        <div><button className="btn" disabled={!text.trim() || busy} onClick={async () => { await upload(null, { text, name: textName }); setText(''); setTextName(''); }}>เพิ่มข้อมูล</button></div>
      </div>

      <div className="card">
        <h3>ทดสอบการค้นหา</h3>
        <form style={{ display: 'flex', gap: 8 }} onSubmit={async (e) => { e.preventDefault(); setQr(await api(`/api/admin/knowledge?q=${encodeURIComponent(q)}`)); }}>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="เช่น ปูนเสือ ราคา" /><button className="btn">ค้นหา</button>
        </form>
        {qr && <><p style={{ fontSize: 13, color: 'var(--muted)' }}>โหมด: {qr.mode === 'full' ? 'ข้อมูลน้อย ส่งให้ AI ทั้งหมด' : qr.mode === 'search' ? `ค้นเจอ ${qr.hits} ชิ้น` : 'ไม่มีข้อมูล'}</p>
          <pre className="prompt">{qr.text || '(ไม่พบ)'}</pre></>}
      </div>

      <div className="card grid2">
        <h3 className="full" style={{ margin: 0 }}>ตั้งค่าการค้นหา</h3>
        <label className="check full"><input type="checkbox" checked={s.strictKnowledge} onChange={(e) => set('strictKnowledge', e.target.checked)} /> ตอบเฉพาะจากฐานข้อมูล (ห้าม AI เดาเรื่องสินค้า/ราคา)</label>
        <label className="f">จำนวนชิ้นข้อมูลที่ส่งให้ AI ต่อคำถาม<input type="number" value={s.knowledgeTopK} onChange={(e) => set('knowledgeTopK', +e.target.value)} /></label>
        <label className="f">ถ้าข้อมูลรวมน้อยกว่า (ตัวอักษร) ส่งทั้งหมด<input type="number" value={s.fullContextChars} onChange={(e) => set('fullContextChars', +e.target.value)} /></label>
      </div>
    </>
  );
}

// ===================== AI =====================
function AI({ s, set }: SP) {
  const [st, setSt] = useState<any>(null);
  useEffect(() => { api('/api/admin/status').then(setSt).catch(() => {}); }, []);
  const pick = (p: Provider) => { set('provider', p); if (MODELS[p][0]) set('model', MODELS[p][0]); else set('model', COMPAT[0].model); };
  const ks = st?.aiKeys?.[s.provider];
  return (
    <>
      <h2>AI ที่ใช้</h2>
      <p className="lead">เลือกผู้ให้บริการ AI และโมเดล — เปลี่ยนได้ทุกเมื่อโดยไม่ต้อง deploy ใหม่</p>
      <div className="card grid2">
        <div className="f full"><b style={{ fontSize: 14 }}>ผู้ให้บริการ</b>
          <Seg value={s.provider} onChange={pick} options={(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => [p, PROVIDER_LABEL[p]])} /></div>
        {s.provider === 'compatible' && (
          <div className="f full"><b style={{ fontSize: 14 }}>ตั้งค่าด่วน</b>
            <div className="seg">{COMPAT.map((c) => <button type="button" key={c.name} className={s.baseUrl === c.url ? 'on' : ''} onClick={() => { set('baseUrl', c.url); set('model', c.model); }}>{c.name}</button>)}</div>
          </div>)}
        {s.provider === 'compatible' && <label className="f full">Base URL<input type="text" value={s.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} /></label>}
        <label className="f">โมเดล<span className="h">พิมพ์ชื่อโมเดลอื่นได้</span>
          <input type="text" list="models" value={s.model} onChange={(e) => set('model', e.target.value)} />
          <datalist id="models">{MODELS[s.provider].map((m) => <option key={m} value={m} />)}</datalist></label>
        <label className="f">API key ของ {PROVIDER_LABEL[s.provider]}
          <span className="h">{ks === 'env' ? `✓ ใช้จาก env ${ENV_NAME[s.provider]} อยู่แล้ว (เว้นว่างได้)` : `แนะนำให้ใส่ใน Vercel env ${ENV_NAME[s.provider]} แทน`}</span>
          <input type="password" value={s.apiKeys[s.provider] || ''} placeholder={ks === 'env' ? 'ใช้ค่าจาก env' : 'sk-...'} onChange={(e) => set('apiKeys', { ...s.apiKeys, [s.provider]: e.target.value })} /></label>
        <label className="f">ความคิดสร้างสรรค์ (temperature): {s.temperature}
          <input type="range" min={0} max={1.2} step={0.1} value={s.temperature} onChange={(e) => set('temperature', +e.target.value)} /></label>
        <label className="f">โทเคนสูงสุดต่อคำตอบ<input type="number" value={s.maxTokens} onChange={(e) => set('maxTokens', +e.target.value)} /></label>
        <label className="f">จำบทสนทนาย้อนหลัง (รอบ)<span className="h">ลูกค้าพิมพ์ “เริ่มใหม่” เพื่อล้างได้</span>
          <input type="number" value={s.historyTurns} onChange={(e) => set('historyTurns', +e.target.value)} /></label>
      </div>
    </>
  );
}

// ===================== GitHub =====================
function GitHub({ s, set, flash, dirty, save }: SP & { flash: (m: string) => void; dirty: boolean; save: () => Promise<void> }) {
  const [st, setSt] = useState<any>(null);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/admin/status').then(setSt).catch(() => {}); }, []);
  const g = s.github;
  const setG = (k: keyof Settings['github'], v: string) => set('github', { ...g, [k]: v });
  return (
    <>
      <h2>GitHub</h2>
      <p className="lead">ใช้ GitHub ได้ 2 แบบ: (1) เก็บโค้ดโปรเจกต์นี้แล้วให้ Vercel deploy อัตโนมัติ (2) ซิงก์ไฟล์ฐานข้อมูลจากรีโป</p>

      <div className="card">
        <h3>1. Deploy อัตโนมัติ: GitHub → Vercel</h3>
        {st?.vercel?.gitRepo
          ? <p>✓ โปรเจกต์นี้ deploy จาก <code>{st.vercel.gitRepo}</code> branch <code>{st.vercel.gitBranch}</code> — push โค้ดเมื่อไหร่ Vercel จะ deploy ใหม่ให้เอง</p>
          : <ol className="steps">
              <li>สร้างรีโปบน GitHub แล้ว push โฟลเดอร์โปรเจกต์นี้ขึ้นไป</li>
              <li>ที่ <a href="https://vercel.com/new" target="_blank">vercel.com/new</a> เลือก Import รีโปนั้น → Deploy</li>
              <li>ไฟล์ในโฟลเดอร์ <code>knowledge/</code> ของรีโปจะถูกใช้เป็นฐานข้อมูลอัตโนมัติทุกครั้งที่ deploy</li>
            </ol>}
      </div>

      <div className="card grid2">
        <h3 className="full" style={{ margin: 0 }}>2. ซิงก์ฐานข้อมูลจากรีโป GitHub</h3>
        <label className="f">รีโป<span className="h">owner/repo หรือ URL</span><input type="text" value={g.repo} onChange={(e) => setG('repo', e.target.value)} placeholder="manoritdet/shop-data" /></label>
        <label className="f">Branch<input type="text" value={g.branch} onChange={(e) => setG('branch', e.target.value)} /></label>
        <label className="f">โฟลเดอร์<span className="h">เว้นว่าง = ทั้งรีโป</span><input type="text" value={g.path} onChange={(e) => setG('path', e.target.value)} /></label>
        <label className="f">Token (ถ้ารีโปเป็น private)<span className="h">{st?.githubToken && !g.token ? '✓ มี GITHUB_TOKEN ใน env แล้ว' : 'Fine-grained token สิทธิ์ Contents: Read'}</span>
          <input type="password" value={g.token} onChange={(e) => setG('token', e.target.value)} placeholder="github_pat_..." /></label>
        <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn" disabled={busy || !g.repo} onClick={async () => {
            if (dirty) await save();
            setBusy(true); setRes(null);
            try { setRes(await api('/api/admin/github-sync', { method: 'POST' })); flash('ซิงก์เสร็จแล้ว ✓'); }
            catch (e: any) { setRes({ error: e.message }); } finally { setBusy(false); }
          }}>{busy ? 'กำลังซิงก์…' : dirty ? 'บันทึก & ซิงก์ตอนนี้' : 'ซิงก์ตอนนี้'}</button>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>ไฟล์จาก GitHub เดิมจะถูกแทนที่ทั้งหมด</span>
        </div>
        {res && <div className="full">{res.error ? <p style={{ color: 'var(--danger)' }}>{res.error}</p> :
          <pre className="prompt">{`${res.repo}@${res.branch}\n` + res.files.map((f: any) => f.error ? `✗ ${f.name}: ${f.error}` : `✓ ${f.name} (${f.chunks} ชิ้น)`).join('\n')}</pre>}</div>}
      </div>

      <div className="card">
        <h3>ซิงก์อัตโนมัติเมื่อ push (ไม่บังคับ)</h3>
        <ol className="steps">
          <li>ตั้ง env <code>GITHUB_WEBHOOK_SECRET</code> ใน Vercel (สุ่มข้อความยาวๆ) {st && <span className={`pill ${st.githubWebhookSecret ? 'ok' : 'no'}`}>{st.githubWebhookSecret ? 'ตั้งแล้ว' : 'ยังไม่ได้ตั้ง'}</span>}</li>
          <li>ในรีโปข้อมูล → Settings → Webhooks → Add webhook</li>
          <li>Payload URL: <code>{st?.githubWebhookUrl || '/api/github/webhook'}</code> · Content type: <code>application/json</code> · Secret: ค่าเดียวกับ env · เลือก “Just the push event”</li>
        </ol>
      </div>
    </>
  );
}

// ===================== ทดสอบแชท =====================
function TestChat({ dirty }: { dirty: boolean }) {
  const [log, setLog] = useState<{ role: 'user' | 'bot' | 'err'; text: string; debug?: any }[]>([]);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [sid, setSid] = useState(() => Math.random().toString(36).slice(2));
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [log]);
  const send = async (e: FormEvent) => {
    e.preventDefault(); const text = msg.trim(); if (!text) return;
    setMsg(''); setLog((l) => [...l, { role: 'user', text }]); setBusy(true);
    try { const r = await api('/api/admin/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, sessionId: sid }) });
      setLog((l) => [...l, { role: 'bot', text: r.reply, debug: r.debug }]); }
    catch (err: any) { setLog((l) => [...l, { role: 'err', text: err.message }]); } finally { setBusy(false); }
  };
  const last = [...log].reverse().find((m) => m.debug)?.debug;
  return (
    <>
      <h2>ทดสอบแชท</h2>
      <p className="lead">คุยกับบอทแบบเดียวกับที่ลูกค้าเห็นใน LINE {dirty && <b style={{ color: 'var(--warn)' }}>· มีการตั้งค่าที่ยังไม่บันทึก (บอทยังใช้ค่าเดิม)</b>}</p>
      <div className="chat">
        <div className="log">
          {log.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.text}</div>)}
          {busy && <div className="meta">กำลังพิมพ์…</div>}
          <div ref={end} />
        </div>
        <form onSubmit={send}>
          <input type="text" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="พิมพ์ข้อความ…" autoFocus />
          <button className="btn" disabled={busy}>ส่ง</button>
          <button type="button" className="btn ghost" onClick={() => { setLog([]); setSid(Math.random().toString(36).slice(2)); }}>ล้าง</button>
        </form>
      </div>
      {last && <details style={{ marginTop: 14 }}><summary>ดู prompt ที่ส่งให้ AI (ค้นเจอ {last.kbHits} ชิ้น · โหมด {last.kbMode})</summary><pre className="prompt">{last.system}</pre></details>}
    </>
  );
}
