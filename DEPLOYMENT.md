# 🚀 SnapVault Deployment & Setup Guide

This guide explains exactly how to set up your external services (Supabase, Cloudinary, Render, Vercel) to get SnapVault running.

---

## 1. Supabase Setup (Database & Auth)

### A. Create Project
1. Go to [Supabase](https://supabase.com/) and create a new project called `snapvault`.
2. Save your **Database Password** somewhere safe.

### B. Initialize Database
1. Go to the **SQL Editor** in the left sidebar.
2. Click **New Query**.
3. Copy everything from your local [supabase-schema.sql](file:///d:/snapvault/supabase-schema.sql).
4. Paste it and click **Run**. You should see "Success".

### C. Configure Authentication
1. Go to **Auth -> Providers -> Email**.
2. Ensure **Enable Email provider** is ON.
3. **CRITICAL**: Turn **OFF** "Confirm Email" (this allows Magic Links to work instantly).
4. Go to **Auth -> URL Configuration**.
5. Add `http://localhost:5173/auth/callback` to the **Redirect URLs**.
6. (Once live) Add `https://chat.rohitkumarranjan.in/auth/callback` to the **Redirect URLs**.

---

## 2. Cloudinary Setup (Image Storage)

1. Sign up for a free account at [Cloudinary](https://cloudinary.com/).
2. On your **Dashboard**, look for "Product Environment Credentials".
3. You will need: **Cloud Name**, **API Key**, and **API Secret**.

---

## 3. Local Environment Configuration

You must create two `.env` files.

### Server Env
Create `server/.env`:
```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
PORT=4000
FRONTEND_URL=http://localhost:5173
```

### Client Env
Create `client/.env`:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_anon_public_key
VITE_API_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4000
```

---

## 4. Deployment to the Web

### A. Backend (Render.com)
1. Push your code to a GitHub repository.
2. Create a **New Web Service** on Render.
3. Select your repository.
4. Set **Root Directory** to `server`.
5. **Build Command**: `npm install`
6. **Start Command**: `npm start`
7. Add all variables from your `server/.env` to the **Environment** tab on Render.

### B. Frontend (Vercel)
1. Create a new project on Vercel and import the same GitHub repo.
2. Set **Root Directory** to `client`.
3. Framework Preset: **Vite**.
4. Add your `client/.env` variables.
5. **IMPORTANT**: For `VITE_API_URL`, use your Render URL (e.g., `https://api.onrender.com`).

---

## 5. Custom Domain (DNS)

Go to your domain provider (e.g., GoDaddy, Cloudflare) and add these records:

| Type | Name | Value | Purpose |
| :--- | :--- | :--- | :--- |
| **CNAME** | `chat` | `cname.vercel-dns.com` | Links chat.rohit... to Vercel |
| **CNAME** | `api` | `your-render-app.onrender.com` | Links api.rohit... to Backend |

---

## 6. How to Use SnapVault

1. **Owner Login**: Visit the site, enter your email. You'll get an email with a link. Click it.
2. **Dashboard**: 
   - Press `Ctrl+V` anywhere to upload a screenshot from your clipboard.
   - Use the "Temp Link" button to create a room for a friend.
3. **Guest Room**: Give the short link (or QR code) to a friend. They can send you files without logging in.
4. **Panic Mode**: If someone walks in, press `Esc` twice quickly. The UI will disappear. Click the tiny grey dot in the bottom right to bring it back.
