# GhostVault Engineering & DevSecOps Architecture Roadmap

*Author: Senior Systems & Cybersecurity Engineer*  
*Date: November 2026*  
*Project: GhostVault (SnapVault)*

---

## Executive Summary

This document establishes the architecture for two core capability expansions for GhostVault:
1. **GhostVault Ingestion Gateway & Webhook Proxy:** A zero-backend notification and bug-reporting hub for all your frontend side projects, eliminating client-side Discord webhook exposure and third-party SaaS limits.
2. **Cybersecurity & Systems Engineering Tooling:** Terminal dead-drops (`curl` pipe), client-side EXIF/metadata anti-forensics, offline JWT/Base64 analyzers, zero-knowledge client-side E2EE, and session auto-lock.

---

## 1. Universal Ingestion Gateway & Webhook Proxy

### 1.1 The Problem in Frontend Side Projects
When building frontend web apps, tools, or landing pages (e.g. portfolio, side projects like `dodo`):
- **Discord Webhook Security Hole:** Putting a Discord webhook directly in frontend JavaScript is dangerous. Anyone inspecting DevTools can extract the URL, spam or raid the Discord server, or issue HTTP `DELETE` requests to permanently destroy the webhook channel. Furthermore, Discord often blocks direct browser calls due to CORS.
- **Third-Party Limitations:** Formspree, Formkeep, and EmailJS impose strict monthly submission caps (e.g. 50/month), inject third-party branding, and create external data dependencies.
- **Google Forms Friction:** Forces users into a new browser tab with an unbranded, clunky interface that damages conversion.
- **Backend Fatigue:** Building and hosting a dedicated backend for every small static tool or landing page is wasteful and tedious to maintain.

### 1.2 Architecture Solution: GhostVault as the Ingestion Hub
GhostVault already has an Express server, Supabase persistence, CORS middleware, and real-time WebSockets. It can act as a **Universal Ingestion Proxy**:

```
[Your Side Projects: Portfolio, Dodo, Tools]
                    │
                    │  POST https://your-vault.domain/api/ingest/:projectSlug
                    │  Headers: { 'Content-Type': 'application/json' }
                    │  Body: { name, email, query, bug, logs, ...any payload }
                    ▼
          [GhostVault Backend]
                    │
       ┌────────────┴────────────┐
       ▼                         ▼
[GhostVault Room: "dodo"]   [Your Private Discord Webhook]
Pushes live message into     (Optional) Forwards a Discord Embed.
your project chat in real    The Discord Webhook URL stays 100%
time on phone & desktop.     hidden on the server.
```

### 1.3 Key Technical Specifications
1. **Permissive CORS (`/api/ingest/*`):**  
   Accepts requests from any origin (`*`) so your GitHub Pages, Vercel apps, Netlify sites, or localhost apps can send data without CORS blocks.
2. **Schema-less JSON & Form-Data:**  
   No rigid database columns required. Whether project A sends `{ feedback: "Great UI" }` or project B sends `{ error: "500", stackTrace: "...", browser: "Firefox" }`, GhostVault parses the keys and renders a clean Markdown bubble.
3. **Automatic Project Routing:**  
   Sending to `/api/ingest/dodo` routes to the room tagged with note/token `dodo`. If the room does not exist, GhostVault can automatically create it in your Personal Notes tab.
4. **Discord Relay (Zero Exposure):**  
   Configure a Discord Webhook URL inside the room's settings in GhostVault. The backend formats and sends a Discord Rich Embed server-side.
5. **Anti-Spam & Rate Limiting:**  
   IP-based sliding-window rate limit (e.g., maximum 10 requests per minute per IP) to prevent malicious flood attacks.

### 1.4 Side-Project Client Snippet (5 Lines of Code)
In any frontend side project, sending feedback or error reports is as simple as:

```javascript
// Example: In your "dodo" side project
async function sendFeedback(data) {
  try {
    await fetch('https://your-vault.domain/api/ingest/dodo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      })
    });
  } catch (err) {
    console.error('Feedback delivery failed:', err);
  }
}
```

---

## 2. Recommended Features for Computer & Cybersecurity Engineers

### 2.1 Terminal / CLI Dead-Drop (Headless Linux & SSH Support)
When administering remote servers, virtual machines, or air-gapped terminal environments, opening a web browser is impossible.

* **Direct Pipeline Endpoint:**
  ```bash
  # 1. Fetch private bash script or notes straight into a remote terminal:
  curl -s https://your-vault.domain/api/raw/x9k2 | bash

  # 2. Upload system diagnostics or audit logs straight into your GhostVault room:
  curl -F "file=@/var/log/auth.log" https://your-vault.domain/api/drop/x9k2
  ```
* **Security Control:** Requires the 4-character token or an optional authorization header token (`X-Vault-Key`).

### 2.2 Client-Side EXIF / Metadata Stripping (Anti-Forensics)
Images captured on modern smartphones or desktop capture tools carry embedded metadata:
- GPS coordinates (latitude, longitude, altitude)
- Device serial numbers and manufacturer signatures
- Timestamps and software build info

* **Implementation:**  
  Before an image file is uploaded to Cloudinary, run an in-browser canvas sanitization step:
  ```javascript
  // Read into an HTML5 Canvas and re-export as clean blob
  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((cleanBlob) => {
      // cleanBlob is 100% stripped of all EXIF, GPS, and device metadata
      uploadToServer(cleanBlob);
    }, file.type);
  };
  ```
                                                              
### 2.3 In-Chat Cyber Tooling (Offline Decoder & Formatter)
Developers and security analysts constantly handle encoded payloads:
* **Offline JWT Inspector:** Clicking a JWT string in chat opens a drawer showing decoded claims, issuance/expiry dates, and signature headers without sending credentials to external sites like `jwt.io`.
* **Hex / Base64 / Hash Quick-Action:** Highlight text or enter slash commands (`/b64`, `/hex`, `/sha256`) to decode or generate hashes locally.
* **Code Formatting:** Auto-detect and syntax-highlight Bash, SQL, JSON, YAML, and PEM certificates.

### 2.4 Zero-Knowledge Client-Side E2EE (Web Crypto API)
To ensure complete zero-trust confidentiality:
* Messages and filenames are encrypted client-side using `AES-GCM-256` before hitting the database.
* The encryption key is derived using `PBKDF2` from the URL fragment identifier (e.g. `https://your-vault.domain/r/x9k2#k=SecretKey123`).
* Because URL fragments (`#...`) are never transmitted to the server in HTTP requests, the backend and database store only encrypted ciphertext.

### 2.5 Silent Intrusion Alerts (Out-of-Band Webhooks)
* Connect a Discord, Telegram bot, or self-hosted NTFY webhook directly to GhostVault room access logs.
* When a guest opens a public tunnel or triggers a download, a push notification alerts your device:
  > *`[GhostVault] Tunnel [x9k2] accessed from IP 198.51.100.24 (curl/7.88.1)`*

### 2.6 Session Auto-Lock (Zero-Trust Inactivity Timer)
* If no cursor or keyboard interaction occurs for 5 minutes:
  - The UI applies a privacy blur (`backdrop-filter: blur(25px)`).
  - Sensitive decrypted data in React state is wiped from memory until you re-authenticate.

---

## 3. Implementation Phasing

| Phase | Feature | Complexity | Key Benefit |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Ingestion Gateway (`/api/ingest/:slug`)** | Low (1-2 hours) | Instant bug reports & feedback across all side projects without backend overhead. |
| **Phase 2** | **Client-Side EXIF Stripping** | Low (30 mins) | Anonymizes all screenshot and photo uploads automatically. |
| **Phase 3** | **Terminal CLI Pipe (`/api/raw` & `/api/drop`)** | Medium (1 hour) | Dead-drop file transfers directly from SSH and bash terminals. |
| **Phase 4** | **In-Chat Cyber Decoders (JWT/Base64)** | Medium (2 hours) | Inspect payloads and hashes directly inside chat. |
| **Phase 5** | **Zero-Knowledge E2EE (Web Crypto API)** | High (1 day) | True zero-trust data protection on Supabase. |

---

## 4. Next Steps
To begin Phase 1 (Universal Ingestion Gateway):
1. Add `server/src/routes/ingest.js` mounted at `/api/ingest`.
2. Add an optional `discord_webhook_url` column to the `rooms` table in Supabase.
3. Add a "Discord Webhook" field to the room edit dialog in the frontend.
4. Mount CORS on the ingest route.
