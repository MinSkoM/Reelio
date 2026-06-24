<div align="center">
<img width="1200" height="475" alt="Reelio banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# Reelio

**AI video workflow for short-form creators**

[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite)](https://vite.dev)
[![Gemini](https://img.shields.io/badge/Gemini-API-4285f4?style=flat-square&logo=google)](https://ai.google.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)

</div>

---

Reelio ช่วยครีเอเตอร์คลิปสั้นวางแผน ถ่าย และ export งานให้ครบในที่เดียว โดยใช้ AI ช่วยคิดสคริปต์ แยกช็อต และบอกว่าแต่ละช็อตต้องถ่ายอะไร จากนั้นเชื่อมมือถือเข้ากับคอมผ่าน QR เพื่อถ่ายและส่งคลิปกลับมาพร้อม export ทันที

## Flow

```
1. Create  →  กรอก brief หรือวางสคริปต์เดิม → AI สร้างสคริปต์ + ช็อตลิสต์
2. Shoot   →  มือถือสแกน QR → เปิดกล้อง → ถ่ายตามช็อต → ส่งคลิปกลับเข้าคอม
3. Export  →  ดาวน์โหลด ZIP (MP4 ทุก take + ไฟล์ .srt subtitle)
```

## Features

- **AI Script & Shot List** — ใส่แค่ brief สั้น ๆ แล้วให้ Gemini สร้างสคริปต์ แยก A-Roll / B-Roll ระบุ visual ที่ต้องถ่าย และเขียน caption พร้อมโพสต์
- **Wireless Camera** — เชื่อมมือถือกับคอมผ่าน WebRTC (PeerJS) + QR code ไม่ต้องติดตั้ง app
- **One-device mode** — ถ่ายบนเครื่องเดียวโดยไม่ต้องสแกน QR สำหรับเครื่องที่มีกล้อง
- **Project Library** — บันทึกทุกงานลง localStorage พร้อมแสดงความคืบหน้าการถ่ายแต่ละช็อต
- **Export ZIP** — รวมคลิปทุก take เป็น MP4 (แปลงจาก WebM อัตโนมัติ) + `important-text.srt`
- **Rate limit handling** — แสดงสถานะ API แบบ real-time พร้อม auto-retry เมื่อเกิน RPM limit

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 · TypeScript · Vite 6 · Tailwind CSS v4 |
| AI | Google Gemini API (`@google/genai`) |
| Camera sync | PeerJS (WebRTC) |
| Video storage | IndexedDB (`idb`) |
| Export | JSZip · server-side WebM → MP4 |
| UI | shadcn/ui · lucide-react · motion |

## Run Locally

**Prerequisites:** Node.js, Gemini API key

```bash
# 1. Install dependencies
npm install

# 2. Set your Gemini API key
echo "GEMINI_API_KEY=your_key_here" > .env.local

# 3. Start dev server
npm run dev
```

App runs at `http://localhost:3000`  
Mobile camera page: `http://<your-local-ip>:3000/?mode=mobile&session=<id>`

## Project Structure

```
src/
├── components/
│   ├── PreProduction.tsx    # Script generation + shot list + library
│   ├── ProductionStudio.tsx # Desktop control center (PeerJS host)
│   └── MobileProduction.tsx # Mobile camera (PeerJS client)
├── services/
│   └── geminiService.ts     # Gemini API calls
└── lib/
    ├── db.ts                # IndexedDB video storage
    └── shotProgress.ts      # Shot completion tracking
api/
├── preproduction.js         # Gemini script generation endpoint
└── convert-video.js         # WebM → MP4 conversion endpoint
```
