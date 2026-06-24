<div align="center">
<img width="1200" height="475" alt="Reelio" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Reelio

An AI-powered video production workflow for short-form creators. Generates a script and shot list from a brief, then syncs a phone camera to the desktop over WebRTC so clips are recorded shot-by-shot and collected for export.

---

## How it works

| Step | Where | What happens |
|---|---|---|
| **1 — Create** | Desktop | Fill in a brief (topic, platform, audience, tone, CTA) or paste an existing script. Gemini generates a full script broken into A-Roll / B-Roll shots with dialogue, on-screen text, and a visual description per shot. |
| **2 — Shoot** | Desktop + Phone | Desktop generates a QR code. Phone scans it, opens the camera, records each shot, and streams the video back to the desktop over WebRTC. Multiple takes per shot are supported. |
| **3 — Export** | Desktop | Download a ZIP containing all takes as MP4 files (`shot-01-take-01.mp4`, …) plus an `important-text.srt` subtitle file derived from each shot's on-screen text. |

---

## Architecture

```
Browser — Desktop (React + TypeScript + Vite)
  ├── PreProduction          — brief form, AI generation, shot list editor, project library
  ├── ProductionStudio       — PeerJS host, QR display, shot selector, received-clip list
  └── IndexedDB (idb)        — local video blob storage

Browser — Phone
  └── MobileProduction       — PeerJS client, camera capture, shot-by-shot recording UI

API Routes (Express / Vite dev server)
  ├── POST /api/preproduction — Gemini script generation (brief → shots, or script → shots)
  └── POST /api/convert-video — server-side WebM → MP4 conversion for non-Safari browsers

AI
  └── Google Gemini           — structured JSON output: title, caption, shots[]
                                each shot: type, script_text, on_screen_text,
                                visual_description, duration_seconds
```

---

## Setup

**Prerequisites:** Node.js, a [Gemini API key](https://aistudio.google.com/apikey)

```bash
npm install
```

Set your API key in `.env.local`:

```
GEMINI_API_KEY=your_key_here
```

Start the dev server:

```bash
npm run dev
```

App runs at `http://localhost:3000`.
For the phone camera flow, open `http://<local-ip>:3000` on the same Wi-Fi network and scan the QR shown on the desktop.

---

## Tech stack

- **React 19** + **TypeScript** + **Vite 6** + **Tailwind CSS v4**
- **Google Gemini API** (`@google/genai`) — script and shot list generation
- **PeerJS** (WebRTC) — peer-to-peer video transfer between phone and desktop
- **idb** — IndexedDB wrapper for local video blob storage
- **JSZip** — client-side ZIP packaging for export
- **shadcn/ui** + **lucide-react** — UI components and icons

---

## Notes

- All project data (scripts, shot progress, video blobs) is stored locally in the browser — no cloud storage.
- When the phone records in WebM (non-Safari), the desktop converts it to MP4 server-side via `/api/convert-video` before packaging the ZIP.
- The Gemini free tier allows 10 RPM and 250 requests per day. The app classifies rate limit errors (RPM vs. daily quota) and auto-retries with a countdown when the limit is temporary.
- On small screens or with `?mode=one-device` in the URL, the app runs in single-device mode — camera and shot list on the same screen, no QR required.
