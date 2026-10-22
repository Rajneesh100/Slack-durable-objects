# Durable Chat 💬

A real-time Slack-style group chat application built with **Cloudflare Workers**, **Durable Objects (DO)**, **Embedded SQLite**, and a **Functional Programming (FP)** architecture.

---

## 🏗️ Architecture Overview

```
chat_room_durable_objects/
├── backend/                       # Cloudflare Workers & Durable Objects
│   ├── src/
│   │   ├── domain/                # PURE FUNCTIONAL CORE
│   │   │   ├── types.ts           # Readonly domain models & WS protocol
│   │   │   ├── room-reducer.ts    # Deterministic State Machine: (State, Event) => [NextState, Effects]
│   │   │   ├── auth-crypto.ts     # Pure Web Crypto PBKDF2 hashing & HMAC session tokens
│   │   │   └── invite.ts          # Pure invite code generators & slugifiers
│   │   ├── storage/               # SQL SCHEMAS & PURE QUERY MAPPERS
│   │   │   ├── user-queries.ts    # UserDO SQLite schema & record converters
│   │   │   └── room-queries.ts    # RoomDO SQLite schema & message converters
│   │   ├── objects/               # IMPERATIVE SHELL (Durable Objects)
│   │   │   ├── UserDO.ts          # Auth, SQLite user accounts & channel registry
│   │   │   └── RoomDO.ts          # WebSocket Hibernation, SQLite messages & effect interpreter
│   │   └── index.ts               # Worker router & DO gateway
│   ├── wrangler.jsonc             # Cloudflare DO bindings with embedded SQLite migrations
│   └── package.json
│
└── ui/                            # Frontend SPA (Slack layout)
    ├── src/
    │   ├── main.ts                # Functional UI state machine & real-time WS client
    │   └── style.css              # Dark-mode Slack/Linear design system with CSS tokens
    ├── vite.config.ts             # Dev server with proxy to backend port 8787
    └── index.html                 # Semantic HTML5 layout
```

---

## 🚀 Running Locally

### 1. Start the Backend (Cloudflare Worker & Durable Objects)
```bash
cd backend
npm install
npm run dev
# Starts on http://localhost:8787
```

### 2. Start the Frontend (Vite SPA)
```bash
cd ui
npm install
npm run dev
# Starts on http://localhost:5173
```

Open **`http://localhost:5173`** in your browser.

---

## ✨ Features Implemented

1. **Authentication Without External Bloat**:
   - Simple `username` + `password` (PBKDF2 SHA-256 + salt, signed HMAC session tokens).
   - Each user's joined channel list is stored in `UserDO` SQLite and synchronizes seamlessly across sessions.

2. **Slack-Style Layout**:
   - **Left Sidebar**: Workspace header, user profile with active status badge, channel list (`#general`, `#random`, + custom channels), and quick action buttons.
   - **Main Chat Feed**: WhatsApp/Slack-style continuous chronological message stream with deterministic avatar gradients, timestamps, and smooth auto-scroll.
   - **Real-Time Presence & Typing Indicators**: Live member count and animated typing indicators (`"Alice is typing..."`).
   - **Composer**: Slack-style rounded input box with keyboard shortcuts (`Enter` to send, `Shift + Enter` for new lines).

3. **Invite Code & Link Sharing**:
   - Channel creators can click **"Copy Invite Link"** in the top bar (`http://localhost:5173/#invite=XYZ`).
   - Any user can join either by opening the invite link directly or clicking **"Join with Invite Code"** in the sidebar.

4. **Pure Functional Core, Imperative Shell**:
   - The state machine (`room-reducer.ts`) is a 100% pure function: `(State, Event) => [NextState, Effects]`.
   - The Durable Object (`RoomDO.ts`) only executes the effects returned by the reducer (writing to SQLite, broadcasting to WebSockets).
