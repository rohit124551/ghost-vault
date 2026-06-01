# 👻 GhostVault | SecOps Console

GhostVault is a premium, secure, and ephemeral DevSecOps terminal designed for maximum speed and privacy. Whether you're pasting a quick screenshot to share with a client or creating a temporary "dead-drop" room for sensitive documents, GhostVault handles it with style and real-time precision.

![Theme Preview](https://img.shields.io/badge/Theme-Cyber_Midnight-6366f1?style=for-the-badge&logo=ghost)
![PWA Ready](https://img.shields.io/badge/PWA-Installable-success?style=for-the-badge&logo=pwa)
![Tech Stack](https://img.shields.io/badge/Stack-React_|_Supabase_|_Socket.io-blue?style=for-the-badge)

---

## ✨ Key Features

- **🚀 Instant Paste Sharing**: Press `Ctrl+V` anywhere on the dashboard to immediately upload a screenshot. The URL is automatically copied to your clipboard.
- **📂 Native File System Access**: Bypass the browser's "Save As" dialogue completely. GhostVault can save pasted images directly to a chosen folder on your hard drive using the Native File System Access API.
- **🔥 Burn After Reading**: Share ultra-sensitive credentials or images using Burn-After-Reading links. The server instantly purges the file from the cloud and database the moment the recipient views it.
- **⏱️ Self-Destruct Messages**: Snapchat-style ephemeral chat messages. Set a custom countdown timer (e.g. 5s, 10s, 1m). Once viewed by the recipient, the message automatically hollows out into a "Viewed" tombstone and is permanently purged from the database and cloud storage.
- **🗂️ In-Browser Folder Zipping**: Drag and drop an entire folder onto the dashboard. GhostVault will recursively zip the folder locally in your browser and upload it securely as a single `.zip` asset.
- **📝 Markdown & Code Parsing**: Paste raw JSON, Python, JS, or use inline Markdown (`*bold*`, `_italics_`, `` `code` ``). GhostVault detects code and shares it using a built-in viewer with beautiful syntax highlighting.
- **📥 Chat Export**: Instantly download your entire secure chat history as a cleanly formatted `.md` Markdown file before revoking a tunnel.
- **🛰️ Secure Tunnels**: Orchestrate persistent, ephemeral connections with split-pane management. Perfect for real-time data drops.
- **⏸️ True Pause/Resume**: Temporarily suspend tunnel access with a single click. Pausing instantly kicks active guests, displays a custom 404 page, and physically freezes the tunnel's countdown timer in the database until resumed!
- **⚡ Timer Auto-Reset**: Safety-first messaging! Burn timers automatically reset to zero after each ephemeral payload is delivered, preventing accidental leaks of future messages.
- **📱 In-Chat Command Menu**: Kebab menu natively built into the chat header. Pause/resume tunnels, copy links, view QR codes, and edit node times without ever leaving the chat view!
- **📟 Dynamic Command Center**: A centralized dashboard featuring a live UTC clock, node status monitoring, and real-time activity metrics.
- **💬 Premium Chat Interactions**: WhatsApp/Telegram-style messaging with floating timestamps, indigo-violet gradients, and pro-grade typography.
  - **📌 Pinned Messages**: Pin important messages to a sticky, highly visible banner at the top of the chat thread.
  - **🔄 Swipe-to-Reply**: Intuitively swipe right on any message (especially on mobile) to instantly quote and reply to it.
  - **In-Line Media Players**: Video and audio clips (`.mp4`, `.webm`, `.mp3`) are instantly playable inside chat bubbles.
  - **PDF Previews**: First-page thumbnails for uploaded PDFs generated dynamically via Cloudinary.
  - **Voice Notes**: Quick-record microphone button for instant, Telegram-style audio voice notes.
  - **Emoji Reactions**: React to messages instantly. Admins have superpower capabilities to override and remove any reactions.
  - **📊 Live Upload Progress**: Precision upload tracking. Attached files instantly turn into visual progress bars showing real-time network transmission percentages `0% -> 100%`.
- **📱 Mobile-First Optimizations**: Uses modern CSS (`100dvh`) to prevent double scrollbars and ensures the UI feels native on iOS/Android, complete with a dedicated touch-friendly context menu button.
- **🐛 Built-in Bug Reporting**: A dedicated floating action button for guests and owners to report UI/UX bugs, logging them directly to the admin dashboard's 'Bugs' tab.
- **🌗 Dynamic Theme Toggling**: Effortlessly switch between Cyber Midnight (Dark) and Light mode with a single click, instantly adapting all glassmorphic UI elements.
- **🗑️ 2-Step Secure Deletion**: Prevent accidental data loss with safety-first deletion workflows and pulsing visual confirmations.
- **📱 Responsive Sidebar**: Intelligent navigation with auto-collapse on chat, click-outside-to-close behavior, and persistent toggles for maximum workspace focus.
- **👁️ View-Once Mode**: Specialized tunnels that automatically revoke themselves the moment the first file is received.
- **🚨 Panic Mode**: Press `Esc` twice quickly to hide your vault instantly. Restore with a hidden trigger.
- **🔍 SEO Optimized**: Server-side robots.txt, sitemap.xml, and dynamic meta tags ensure public landing pages are perfectly indexed while vaults remain hidden.

---

## 🛠️ Technology Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | React (Vite) | High-performance SPA with modern aesthetics |
| **Backend** | Node.js (Express) | API layer and real-time socket coordination |
| **Real-time** | Socket.IO | Bi-directional communication for live updates |
| **Database** | Supabase | PostgreSQL storage for rooms and message history |
| **Auth** | Supabase Auth | Secure Email & Password authentication |
| **File Storage** | Cloudinary | Global CDN storage for images and raw documents |
| **Styling** | Vanilla CSS | Custom design system with dynamic CSS variables |

---

## 📂 Project Structure

```text
ghost-vault/
├── client/                 # React + Vite Frontend
│   ├── public/             # Static assets (Manifest, Icons, Service Worker)
│   └── src/
│       ├── components/     # Reusable UI (ChatWindow, ServerWakeUp, ThemeToggle)
│       ├── contexts/       # State providers (Auth, Socket, Theme)
│       ├── hooks/          # Custom logic (useServerHealth, useTheme)
│       ├── lib/            # Utilities (api, supabase)
│       └── pages/          # Full-page components
│           ├── LoginPage       # Secure entry for Vault Owner
│           ├── DashboardPage   # Real-time Command Center & Tunnels Orchestrator
│           ├── LandingPage     # Public-facing system information (About System)
│           ├── GuestRoomPage   # Public interface for ephemeral tunnel guests (/r/:token)
│           └── NotFoundPage    # Friendly 404 feedback for invalid/expired tunnels
│
├── server/                 # Node.js + Express + Socket.io Backend
│   └── src/
│       ├── lib/            # Integrations
│       │   ├── cloudinary.js   # Multi-format storage & transformations
│       │   ├── supabase.js     # DB client & real-time subscriptions
│       │   └── token.js        # 4-character secure token generator
│       ├── middleware/     # Security
│       │   └── auth.js         # JWT validation & Room-token authorization
│       ├── routes/         # API Layer
│       │   ├── rooms.js        # Room lifecycle (CRUD + Validation)
│       │   ├── roomMessages.js # Real-time chat & ephemeral file exchange
│       │   ├── upload.js       # Screenshot processing & metadata storage
│       │   └── uploads.js      # Vault management & bulk deletion
│       ├── socket/         # Event management
│       │   └── index.js        # Real-time message broadcasting & revocation
│       └── index.js        # Server entry point & Middleware config
│
├── supabase-schema.sql     # PostgreSQL database structure
└── package.json            # Workspace & dependency management
```

---

## 🚀 Setup & Deployment

### 1. Database & Auth (Supabase)
- Run `supabase-schema.sql` in the Supabase SQL Editor.
- Enable **Email & Password** authentication in the Supabase Dashboard.
- Disable **Confirm Email** if you want instant account creation/login.

### 2. Environment Configuration

**Server (`server/.env`)**
```env
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_ROLE_KEY=your_secret_service_key
CLOUDINARY_CLOUD_NAME=your_name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret
PORT=4000
FRONTEND_URL=https://your-app.vercel.app
```

**Client (`client/.env`)**
```env
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_public_anon_key
VITE_API_URL=https://your-api.onrender.com
VITE_SOCKET_URL=https://your-api.onrender.com
```

### 3. Local Development
```bash
# Install root, client, and server dependencies
npm install

# Run everything concurrently
npm run dev

# Or run separately
cd server && npm run dev   # port 4000
cd client && npm run dev   # port 5173
```

---

## 📸 Usage & Workflow

### The Owner Flow
1. **Login**: Enter your authorized **Email and Password**.
2. **Vaulting**: Drag & drop or **Paste screenshots** directly with `Ctrl+V`. Set an expiry time if needed.
3. **Tunneling**: Initialize a **Secure Tunnel** for guests. Use the QR icon to show a scannable share-modal or copy the direct URL.
4. **Monitoring**: Access the **SecOps Terminal** for any active tunnel to see guest interactions and file transfers in real-time.

### The Guest Experience
1. **Secure Entry**: Guests simply open your shared `/r/:token` tunnel link.
2. **Data Drop**: They can drop files or send messages immediately via the encrypted connection.
3. **Auto-Cleanup**: Once the tunnel expires or you revoke it, the connection is instantly severed and the guest is redirected to a secure 404 page.


### 🚨 Panic Mode
- Press `Esc` twice quickly → The entire UI instantly vanishes.
- Click the small hidden grey dot in the bottom-right corner → The UI restores.

---

## 🔒 Security & Privacy
- **Direct Auth**: Secure Email & Password login for the owner.
- **Tokenized Access**: Guests only have access to specific rooms via unique 4-character tokens.
- **Auto-Cleanup**: Expired data is automatically purged from Supabase and Cloudinary.
- **Redirection**: Invalid, revoked, or expired links immediately redirect guests to a secure 404 page.

---

*GhostVault — Built with ❤️ for speed and privacy.*

---

## 📱 PWA Testing Checklist
To verify that the PWA is working correctly:

1. **Open Chrome DevTools → Application → Manifest**
   - Should show all icons and manifest details with no errors.
2. **Application → Service Workers**
   - Should show `sw.js` as activated and running.
3. **Lighthouse audit → PWA category**
   - Should score high on all PWA checks.
4. **On Android Chrome → Three dot menu → "Add to Home Screen"**
   - Should show GhostVault name and icon, not generic.
5. **On iOS Safari → Share button → "Add to Home Screen"**
   - Should show GhostVault name and icon.
6. **After Install → Open from Home Screen**
   - Should open in standalone mode with no browser chrome.
   - URL bar should be hidden.
   - Status bar should be dark matching app theme.
   - Safe areas (notch/home indicator) should be respected with appropriate padding.

