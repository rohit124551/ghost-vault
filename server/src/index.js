require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const uploadRouter   = require('./routes/upload');
const uploadsRouter  = require('./routes/uploads');
const roomsRouter    = require('./routes/rooms');
const burnRouter     = require('./routes/burn');
const messagesRouter = require('./routes/messages');
const bugsRouter     = require('./routes/bugs');
const ingestRouter   = require('./routes/ingest');
const { initSocket } = require('./socket');

const app    = express();
const server = http.createServer(app);

const helmet = require('helmet');
app.use(helmet());

// ── Cyber Defense: Anti-Leak & Directory Traversal Protection ────────────────
const SENSITIVE_PROBE_REGEX = /\.(sql|env|git|md|yml|yaml|log|ts|tsx|jsx|sh|bat|cmd|conf|ini|bak)$/i;

app.use((req, res, next) => {
  try {
    const rawUrl = decodeURI(req.url).toLowerCase();
    // 1. Defend against path traversal / directory jumping
    if (rawUrl.includes('..') || rawUrl.includes('\\') || rawUrl.includes('%2e%2e')) {
      return res.status(403).json({ error: 'Access denied: Directory traversal sequence blocked.' });
    }

    // 2. Strict anti-leak: Block direct requests targeting schema, migrations, or source files
    if (SENSITIVE_PROBE_REGEX.test(req.path)) {
      return res.status(404).json({ error: 'Endpoint not found.' });
    }
  } catch {
    return res.status(400).json({ error: 'Malformed request path.' });
  }

  next();
});

// ── Ingestion Gateway (Strict 20KB cap, dynamic CORS per project) ─────────
app.use(
  '/api/ingest',
  express.json({ limit: '20kb' }),
  (err, _req, res, next) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
      return res.status(413).json({ error: 'Payload too large. Maximum allowed size is 20KB.' });
    }
    next(err);
  },
  ingestRouter
);

// ── Main App JSON Parser & Restrictive CORS for Private Routes ─────────────
app.use(express.json({ limit: '2mb' }));

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
app.use('/api/burn',                  burnRouter);
app.use('/api/rooms',                 roomsRouter);
app.use('/api/rooms/:token/messages', messagesRouter); // Fix 2/3
app.use('/api/bugs',                  bugsRouter);

// ── 404 Not Found Catch-All ──────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// ── Secure Global Error Handler (CWE-209 Anti-Leak) ──────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Log full error stack and message strictly to server console
  console.error('[Unhandled Server Error]', err.stack || err.message);

  // If status is a known safe client-side 4xx error (e.g. 400 Bad Request)
  const status = Number(err.status || err.statusCode) || 500;
  if (status >= 400 && status < 500) {
    const isSafeMessage = typeof err.message === 'string' 
      && !err.message.includes('relation') 
      && !err.message.includes('column') 
      && !err.message.includes('pg_')
      && !err.message.includes('SELECT')
      && !err.message.includes('INSERT');
    return res.status(status).json({
      error: isSafeMessage ? err.message : 'Invalid request.'
    });
  }

  // 5xx Server Errors: NEVER leak DB drivers, SQL statements, system paths, or stacks
  res.status(500).json({ error: 'Internal server error. Please try again later.' });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 SnapVault API → http://localhost:${PORT}`));
