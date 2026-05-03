# 👻 GhostVault | SecOps Console

GhostVault is a premium, secure, and ephemeral DevSecOps terminal designed for maximum speed and privacy. Whether you're pasting a quick screenshot to share with a client or creating a temporary "dead-drop" room for sensitive documents, GhostVault handles it with style and real-time precision.

![Theme Preview](https://img.shields.io/badge/Theme-Cyber_Midnight-6366f1?style=for-the-badge&logo=ghost)
![PWA Ready](https://img.shields.io/badge/PWA-Installable-success?style=for-the-badge&logo=pwa)
![Tech Stack](https://img.shields.io/badge/Stack-React_|_Supabase_|_Socket.io-blue?style=for-the-badge)

---

## ✨ Key Features

- **🚀 Instant Paste Sharing**: Press `Ctrl+V` anywhere on the dashboard to immediately upload a screenshot. The URL is automatically copied to your clipboard.
- **🛰️ Secure Tunnels**: Orchestrate persistent, ephemeral connections with split-pane management. Perfect for real-time data drops.
- **📟 Dynamic Command Center**: A centralized dashboard featuring a live UTC clock, node status monitoring, and real-time activity metrics.
- **💬 Premium Chat Interactions**: WhatsApp/Telegram-style messaging with floating timestamps, indigo-violet gradients, and pro-grade typography.
- **🗑️ 2-Step Secure Deletion**: Prevent accidental data loss with safety-first deletion workflows and pulsing visual confirmations.
- **📱 Responsive Sidebar**: Intelligent navigation with auto-collapse on chat, click-outside-to-close behavior, and persistent toggles for maximum workspace focus.
- **📂 Universal File Support**: Share images, docs, and raw payloads with intelligent `auto-detect` Cloudinary storage and one-click link copying.
- **👁️ View-Once Mode**: Specialized tunnels that automatically revoke themselves the moment the first file is received.
- **🚨 Panic Mode**: Press `Esc` twice quickly to hide your vault instantly. Restore with a hidden trigger.


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

