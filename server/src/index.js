require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const uploadRouter   = require('./routes/upload');
const uploadsRouter  = require('./routes/uploads');
const roomsRouter    = require('./routes/rooms');
const messagesRouter = require('./routes/messages');
const { initSocket } = require('./socket');

const app    = express();
const server = http.createServer(app);

const helmet = require('helmet');
app.use(helmet());

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:5173',
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.some(o => origin === o || origin.startsWith(o))) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true },
});
initSocket(io);
app.set('io', io);

// ── Health (Fix 5 — server wake-up ping target) ───────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/upload',                uploadRouter);
app.use('/api/uploads',               uploadsRouter);
app.use('/api/rooms',                 roomsRouter);
app.use('/api/rooms/:token/messages', messagesRouter); // Fix 2/3

// ── Error handler ──────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 SnapVault API → http://localhost:${PORT}`));
