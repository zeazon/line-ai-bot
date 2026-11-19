# LINE AI Bot

แชทบอท LINE ที่ตอบลูกค้าด้วย AI — ตั้งเพศ/นิสัยบอทได้, ตอบจากไฟล์ข้อมูลของร้าน, เลือก AI ได้หลายเจ้า, deploy บน Vercel และเชื่อม GitHub

## ความสามารถ

| ส่วน | รายละเอียด |
|---|---|
| **LINE** | Webhook `/api/line/webhook` ตรวจลายเซ็น, แสดง “กำลังพิมพ์…”, ทักทายเมื่อเพิ่มเพื่อน, ตอบในกลุ่มเมื่อถูก @, จำบทสนทนา 7 วัน (พิมพ์ “เริ่มใหม่” เพื่อล้าง) |
| **บุคลิกบอท** | ชื่อ, เพศ (ค่ะ/ครับ/ไม่ระบุ), สรรพนาม, นิสัย, โทน, อีโมจิ, ข้อมูลร้าน, กฎเพิ่มเติม, ข้อความเมื่อไม่มีข้อมูล |
| **ฐานข้อมูล** | อัปโหลด `.csv .xlsx .txt .md .json .pdf` หรือพิมพ์เอง · ไฟล์ตาราง 1 แถว = 1 รายการ · ค้นหาภาษาไทยได้ (ไม่ต้องใช้ embedding) · โหมด “ตอบจากข้อมูลเท่านั้น” กันบอทแต่งราคา |
| **AI** | OpenAI, Claude, Gemini และทุกเจ้าที่ใช้ API แบบ OpenAI (Typhoon, OpenRouter, Groq, DeepSeek, Ollama) — สลับได้จากหน้าแอดมินทันที |
| **Vercel** | Deploy ได้ทันที, ใช้ Upstash Redis เก็บข้อมูล, หน้าแอดมินแสดงสถานะ/URL ของ deployment |
| **GitHub** | (1) push โค้ด → Vercel deploy อัตโนมัติ (2) ไฟล์ในโฟลเดอร์ `knowledge/` ใช้เป็นฐานข้อมูล (3) ซิงก์ฐานข้อมูลจากรีโปอื่น + webhook ซิงก์อัตโนมัติเมื่อ push (4) GitHub Actions เช็ก build |

## ติดตั้งบน Vercel (ประมาณ 15 นาที)

1. **ขึ้น GitHub**
   ```bash
   cd line-ai-bot
   git init && git add . && git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<ชื่อคุณ>/line-ai-bot.git
   git push -u origin main
   ```
2. **Import ใน Vercel** — ไปที่ https://vercel.com/new → เลือกรีโป → Deploy
3. **เพิ่มที่เก็บข้อมูล** — Project → Storage (หรือ Marketplace) → **Upstash for Redis** → Create → Connect กับโปรเจกต์ (env จะถูกใส่ให้เอง)
4. **ใส่ Environment Variables** (Project → Settings → Environment Variables) ดู `.env.example`
   - `ADMIN_PASSWORD`
   - `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`
   - API key ของ AI ที่จะใช้ เช่น `OPENAI_API_KEY`
5. **Redeploy** (Deployments → ⋯ → Redeploy)
6. **ตั้ง LINE** — LINE Developers Console → Messaging API → Webhook URL = `https://<โดเมน>.vercel.app/api/line/webhook` → Verify → เปิด Use webhook → ปิด Auto-reply ใน LINE OA Manager
7. เปิด `https://<โดเมน>.vercel.app/admin` → ตั้งบุคลิก, อัปโหลดข้อมูล, เลือก AI → แท็บ “ทดสอบแชท”

> ถ้าไม่ได้ต่อ Redis บน Vercel การตั้งค่าและไฟล์ที่อัปโหลดจะหายเมื่อ function รีสตาร์ต (หน้าแอดมินจะเตือน)

## รันในเครื่อง

```bash
npm install
cp .env.example .env.local   # ใส่ค่า
npm run dev                  # http://localhost:3000/admin
```
ในเครื่องไม่ต้องมี Redis (เก็บใน `.data/store.json`) และถ้าไม่ตั้ง `ADMIN_PASSWORD` จะเข้าแอดมินได้เลย
ทดสอบกับ LINE จริงในเครื่อง: ใช้ `ngrok http 3000` แล้วเอา URL ไปใส่ใน Webhook

## ฐานข้อมูลตอบลูกค้า — เคล็ดลับ

- **ตารางสินค้า**: แถวแรกเป็นหัวคอลัมน์ ตั้งชื่อคอลัมน์ให้สื่อความ เช่น `รหัสสินค้า, ชื่อสินค้า, ราคา (บาท), หน่วย, คงเหลือ`
- ถ้าข้อมูลรวม < 12,000 ตัวอักษร บอทจะได้เห็นทั้งหมดทุกครั้ง ถ้ามากกว่านั้นจะค้นเฉพาะส่วนที่เกี่ยวข้อง (ปรับได้ในหน้าแอดมิน)
- อัปโหลดไฟล์ชื่อเดิม = แทนที่ของเก่า → ใช้กับไฟล์ CSV ที่ export จากระบบ POS ได้ทุกวัน
- ใช้แท็บ “ทดสอบการค้นหา” ดูว่าคำถามแบบไหนค้นเจออะไร
- ต้องการอัปเดตอัตโนมัติจากระบบอื่น: เรียก API อัปโหลดด้วย cookie แอดมิน หรือ push CSV ขึ้นรีโป GitHub แล้วใช้ webhook ซิงก์

## โครงสร้าง

```
app/admin/page.tsx            หน้าแอดมิน
app/api/line/webhook          รับข้อความจาก LINE
app/api/github/webhook        รับ push จาก GitHub → ซิงก์ฐานข้อมูล
app/api/admin/*               API ของหน้าแอดมิน
lib/bot.ts                    ขั้นตอนตอบ: ค้นข้อมูล → prompt → AI → จำประวัติ
lib/persona.ts                สร้าง system prompt จากบุคลิก
lib/ai.ts                     ตัวเชื่อม AI แต่ละเจ้า
lib/knowledge.ts              อ่านไฟล์ + ค้นหา
lib/github.ts                 ซิงก์จาก GitHub
lib/store.ts                  Redis / ไฟล์
knowledge/                    ไฟล์ฐานข้อมูลที่มากับรีโป (มีตัวอย่าง — ลบได้)
```

## หมายเหตุ

- ชื่อโมเดลเปลี่ยนบ่อย ถ้า AI ตอบ error ว่าไม่พบโมเดล ให้เช็กชื่อล่าสุดจากเว็บผู้ให้บริการแล้วพิมพ์ในช่อง “โมเดล”
- Vercel Hobby: ฟังก์ชันรันได้สูงสุด 60 วินาที เพียงพอสำหรับการตอบแชท
- API key ใส่ใน env ปลอดภัยกว่าใส่ในหน้าแอดมิน (หน้าแอดมินเก็บใน Redis)
