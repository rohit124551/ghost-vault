# Ghost Vault

Personal screenshot vault and temporary file-sharing tool.

**Live:** http://localhost:5173 (Local)

---

## Stack

| Layer | Tech | Host |
|---|---|---|
| Frontend | React + Vite | Vercel |
| Backend | Node.js + Express + Socket.IO | Render.com |
| Database | Supabase (PostgreSQL) | Supabase |
| File Storage | Cloudinary | Cloudinary |
| Auth | Supabase Magic Link | — |

## Features

- **Paste screenshots** from clipboard (`Ctrl+V`) or drag & drop
- **Auto-copy URL** to clipboard after every upload
- **Expiring uploads** — set 24h / 7d / 30d TTL
- **Temp share rooms** — 4-char token links, QR codes, countdown timers
- **View-once rooms** — auto-revoke after first file received
- **Real-time** — owner sees guest uploads live via Socket.IO
- **Panic mode** — press `Esc` twice quickly → blank page; click grey dot to restore
- **PWA** — installable on mobile
- **No password** — magic link email auth

## Project Structure

```
ghost-vault/
├── client/           React + Vite frontend
│   ├── public/
│   │   ├── manifest.json   PWA manifest
│   │   └── sw.js           Service worker
│   └── src/
│       ├── pages/
│       │   ├── LoginPage.jsx
│       │   ├── DashboardPage.jsx   (owner main view)
│       │   ├── GuestRoomPage.jsx   (/r/:token — no login)
│       │   └── NotFoundPage.jsx    (/404)
│       ├── contexts/
│       │   ├── AuthContext.jsx
│       │   └── SocketContext.jsx
│       └── lib/
│           ├── supabase.js
│           └── api.js
│
├── server/           Express + Socket.IO backend
│   └── src/
│       ├── index.js
│       ├── routes/
│       │   ├── upload.js     POST /api/upload
│       │   ├── uploads.js    GET/DELETE /api/uploads
│       │   └── rooms.js      CRUD + /api/rooms/:token/valid
│       ├── middleware/
│       │   ├── requireOwner.js
│       │   └── requireRoom.js
│       ├── socket/index.js
│       └── lib/
│           ├── supabase.js
│           ├── cloudinary.js
│           └── token.js      4-char token generator
│
└── supabase-schema.sql
```

## API

```
POST   /api/upload               Upload file (owner + guest)
GET    /api/uploads              List owner's uploads (paginated, 10/page)
DELETE /api/uploads/:id          Delete upload + Cloudinary asset
POST   /api/rooms                Create temp room
GET    /api/rooms                List all rooms
DELETE /api/rooms/:token         Revoke room
GET    /api/rooms/:token/valid   Validate token (public)
```

## Setup & Deployment

### 1. Supabase
1. Create project at [supabase.com](https://supabase.com)
2. SQL Editor → paste `supabase-schema.sql` → **Run**
3. Authentication → Providers → Email → enable **Magic Link**
4. Settings → API → copy:
   - `Project URL`
   - `anon public` key
   - `service_role` key (keep secret — server only)

### 2. Cloudinary
1. Create account at [cloudinary.com](https://cloudinary.com)
2. Dashboard → copy **Cloud Name**, **API Key**, **API Secret**

### 3. Backend → Render.com
1. New Web Service → connect GitHub repo
2. Root Directory: `server`
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Environment Variables:
   ```
   SUPABASE_URL=
   SUPABASE_SERVICE_ROLE_KEY=
   CLOUDINARY_CLOUD_NAME=
   CLOUDINARY_API_KEY=
   CLOUDINARY_API_SECRET=
   PORT=4000
   FRONTEND_URL=http://localhost:5173
   ```
6. Copy your Render URL (e.g. `https://ghost-vault-api.onrender.com`)

### 4. Frontend → Vercel
1. Import GitHub repo → Vercel
2. Root Directory: `client`
3. Environment Variables:
   ```
   VITE_SUPABASE_URL=
   VITE_SUPABASE_ANON_KEY=
   VITE_API_URL=https://ghost-vault-api.onrender.com
   VITE_SOCKET_URL=https://ghost-vault-api.onrender.com
   ```
4. Deploy → copy your Vercel URL

### 5. Custom Domain
In your domain registrar:
```
CNAME  chat  →  cname.vercel-dns.com        (frontend)
CNAME  api   →  your-app.onrender.com       (backend)
```
In Vercel → Domains → add your custom domain

### 6. Local Development
```bash
# Fill env files first
cp server/.env.example server/.env
cp client/.env.example client/.env

# From repo root — opens two terminal windows
npm run dev

# Or separately:
cd server && npm run dev   # port 4000
cd client && npm run dev   # port 5173
```

## Usage

### Owner
1. Visit `http://localhost:5173` → enter email → click magic link
2. **Paste** any screenshot with `Ctrl+V` anywhere on the dashboard
3. Name it → set optional expiry → Save (URL auto-copied to clipboard)
4. Create **temp rooms** → share QR code or link with friend
5. See guest messages and files appear **live** in the thread
6. **Revoke** room when done

### Guest
1. Open `http://localhost:5173/r/xxxx` (shared link or QR)
2. Drop a file or type a message → Send
3. Done — owner sees it instantly

### Panic Mode
- Press `Esc` twice quickly → entire UI hides
- Click the small grey dot (bottom-right corner) → UI restores
