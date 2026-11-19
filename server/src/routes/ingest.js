/**
 * POST    /api/ingest/:slug — Universal Ingestion Gateway
 * OPTIONS /api/ingest/:slug — Per-project CORS Preflight Handler
 *
 * Security Controls:
 * 1. Per-Project CORS Whitelist: checks req.headers.origin against room.allowed_origins
 * 2. Payload Size Cap: Strict 20KB limit (enforced at route level)
 * 3. Rate Limiting: 10 req/min per IP with Retry-After header
 * 4. Input Sanitization: Prototype pollution & buffer exhaustion prevention
 * 5. Automatic Server Timestamps: Native database timestamp returned & relayed to Discord
 */
const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { generateToken } = require('../lib/token');
const { broadcastRoomEvent } = require('../lib/roomEvents');

// ── In-Memory Rate Limiter (per IP, 10 req/min) ──────────────────────────────
const hitMap = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_HITS = 10;

function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  const now = Date.now();
  const entry = hitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    hitMap.set(ip, { windowStart: now, count: 1 });
    res.setHeader('X-RateLimit-Limit', RATE_MAX_HITS);
    res.setHeader('X-RateLimit-Remaining', RATE_MAX_HITS - 1);
    return next();
  }

  entry.count++;
  const remaining = Math.max(0, RATE_MAX_HITS - entry.count);
  res.setHeader('X-RateLimit-Limit', RATE_MAX_HITS);
  res.setHeader('X-RateLimit-Remaining', remaining);

  if (entry.count > RATE_MAX_HITS) {
    res.setHeader('Retry-After', Math.ceil((entry.windowStart + RATE_WINDOW_MS - now) / 1000));
    return res.status(429).json({ error: 'Rate limit exceeded. Maximum 10 requests per minute.' });
  }

  return next();
}

// Periodic cleanup of stale entries (every 5 min)
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS * 2;
  for (const [ip, entry] of hitMap) {
    if (entry.windowStart < cutoff) hitMap.delete(ip);
  }
}, 5 * 60_000);

// ── Helper: Resolve Room by Token or Note (Slug) ─────────────────────────────
async function resolveRoom(slug) {
  try {
    // 1. Try exact token match (select * to be resilient against missing schema columns)
    const { data: byToken, error: tokenErr } = await supabase
      .from('rooms')
      .select('*')
      .eq('token', slug)
      .maybeSingle();

    if (!tokenErr && byToken) return byToken;

    // 2. Try note match (case-insensitive project slug)
    const { data: byNote, error: noteErr } = await supabase
      .from('rooms')
      .select('*')
      .ilike('note', slug)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!noteErr && byNote) return byNote;

    return null;
  } catch (err) {
    console.error('[Ingest] resolveRoom error:', err.message);
    return null;
  }
}

// ── Helper: CORS Origin Whitelist Checker ────────────────────────────────────
function isOriginAllowed(requestOrigin, allowedOriginsString) {
  // If project has no allowed_origins specified -> open to all (public mode)
  if (!allowedOriginsString || !allowedOriginsString.trim()) {
    return true;
  }

  // Non-browser callers (curl, postman, backend server-to-server) have no Origin header
  if (!requestOrigin) {
    return true;
  }

  const reqNorm = requestOrigin.trim().toLowerCase().replace(/\/+$/, '');
  const allowedList = allowedOriginsString
    .split(',')
    .map(s => s.trim().toLowerCase().replace(/\/+$/, ''))
    .filter(Boolean);

  return allowedList.some(allowed => {
    if (allowed === '*' || allowed === reqNorm) return true;
    // Wildcard support: e.g. *.myportfolio.com
    if (allowed.startsWith('*.')) {
      const root = allowed.slice(2);
      try {
        const u = new URL(reqNorm);
        return u.hostname === root || u.hostname.endsWith('.' + root);
      } catch {
        return false;
      }
    }
    return false;
  });
}

// ── Helper: Format raw keys into clean Title Case labels ────────────────────
function formatLabel(key) {
  const ACRONYMS = {
    ip: 'IP', url: 'URL', uri: 'URI', id: 'ID', api: 'API',
    cpu: 'CPU', ram: 'RAM', os: 'OS', ttl: 'TTL', fk: 'FK',
    ui: 'UI', db: 'DB', http: 'HTTP',
  };

  return String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(w => ACRONYMS[w.toLowerCase()] || (w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

// ── Category Normalizer & Flexible Mapping ──────────────────────────────────
const CATEGORY_MAP = {
  // Bugs / Errors
  bug: 'bug', bugs: 'bug', error: 'bug', errors: 'bug', issue: 'bug', issues: 'bug',
  crash: 'bug', crashes: 'bug', exception: 'bug', 'report-error': 'bug', 'bug-report': 'bug',
  report_error: 'bug', bug_report: 'bug', failed: 'bug', failure: 'bug', critical: 'bug',

  // Feedback / Reviews / Contact
  feedback: 'feedback', review: 'feedback', reviews: 'feedback', suggestion: 'feedback',
  suggestions: 'feedback', contact: 'feedback', inquiry: 'feedback', inquiries: 'feedback',
  survey: 'feedback', 'contact-us': 'feedback', contact_us: 'feedback', praise: 'feedback',

  // Feature Updates / Requests
  feature: 'feature', features: 'feature', 'feature-request': 'feature', 'feature_request': 'feature',
  request: 'feature', requests: 'feature', update: 'feature', updates: 'feature',
  changelog: 'feature', enhancement: 'feature', enhancements: 'feature', idea: 'feature',

  // Logs / Telemetry / Scrapers
  log: 'telemetry', logs: 'telemetry', metric: 'telemetry', metrics: 'telemetry',
  telemetry: 'telemetry', scraper: 'telemetry', ping: 'telemetry', health: 'telemetry',
  trace: 'telemetry', analytics: 'telemetry', perf: 'telemetry', performance: 'telemetry',
};

function normalizeCategory(raw) {
  if (!raw) return 'general';
  const clean = String(raw).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (CATEGORY_MAP[clean]) return CATEGORY_MAP[clean];
  // Safe custom category fallback (e.g. 'payments', 'auth', 'leads')
  return clean.slice(0, 32) || 'general';
}

const CATEGORY_META = {
  bug:       { label: 'Bug Report',     icon: '🐛', color: 0xef4444 }, // red
  feedback:  { label: 'User Feedback',  icon: '💡', color: 0x06b6d4 }, // cyan
  feature:   { label: 'Feature Update', icon: '🚀', color: 0x8b5cf6 }, // purple
  telemetry: { label: 'Log / Metric',   icon: '📊', color: 0xf59e0b }, // amber
  general:   { label: 'Event',          icon: '📡', color: 0x10b981 }, // emerald
};

const IGNORED_KEYS = new Set(['timestamp', 'time', 'date', 'created_at', 'ts', 'category', 'type', '_type']);
const FULL_WIDTH_KEYS = new Set([
  'query', 'search_query', 'message', 'description', 'error', 'stack',
  'product_name', 'page_uri', 'url', 'uri', 'path', 'details', 'body',
  'prompt', 'reason', 'payload', 'exception'
]);

// ── Forward to Discord webhook (Clean, Beautiful Embed Structure) ────────────
async function forwardToDiscord(webhookUrl, body, slug, roomToken, receivedAt, category = 'general') {
  if (!webhookUrl) return;
  try {
    const meta = CATEGORY_META[category] || { label: formatLabel(category), icon: '🏷️', color: 0x10b981 };
    
    let title = `${meta.icon} [${slug.toUpperCase()} · ${meta.label.toUpperCase()}]`;
    if (body.title) {
      title = `${meta.icon} [${slug.toUpperCase()}] ${String(body.title).slice(0, 200)}`;
    } else if (body.endpoint) {
      title = `${meta.icon} ${body.endpoint} (${meta.label})`;
    } else if (body.message) {
      title = `${meta.icon} [${slug.toUpperCase()}] ${String(body.message).slice(0, 100)}`;
    }

    let color = meta.color;
    const statusStr = String(body.status || body.level || body.type || '').toLowerCase();
    if (statusStr.includes('err') || statusStr.includes('fail') || statusStr.includes('crit') || statusStr.includes('bug')) {
      color = 0xef4444; // red override
    } else if (statusStr.includes('warn')) {
      color = 0xf59e0b; // amber override
    }

    const validEntries = Object.entries(body).filter(([k]) => !IGNORED_KEYS.has(k.toLowerCase()));

    const fields = validEntries.slice(0, 24).map(([k, v]) => {
      const valStr = typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v);
      const isShort = valStr.length <= 40 && !valStr.includes('\n');
      const isFullWidthKey = FULL_WIDTH_KEYS.has(k.toLowerCase()) || FULL_WIDTH_KEYS.has(k.replace(/[-_\s]+/g, '_').toLowerCase());

      return {
        name: formatLabel(k),
        value: valStr.slice(0, 1024) || '—',
        inline: isShort && !isFullWidthKey,
      };
    });

    // Automatically add Server-generated Timestamp (hh:mm:ss) into Discord fields
    const dateObj = receivedAt ? new Date(receivedAt) : new Date();
    const timeFormatted = dateObj.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    fields.push({
      name: 'Category',
      value: `${meta.icon} ${meta.label}`,
      inline: true,
    });

    fields.push({
      name: 'Timestamp',
      value: timeFormatted,
      inline: true,
    });

    const embed = {
      title,
      color,
      fields,
      footer: { text: `GhostVault · /r/${roomToken}` },
      timestamp: dateObj.toISOString(),
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (err) {
    console.error('[Ingest] Discord webhook failed:', err.message);
  }
}

// ── OPTIONS /api/ingest/:slug and /:slug/:category (CORS Preflight) ───────────
router.options(['/:slug', '/:slug/:category'], async (req, res) => {
  const origin = req.headers.origin;
  const slug = String(req.params.slug || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 64);

  // Set standard CORS preflight headers
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, Authorization, X-Requested-With, x-api-key, accept');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');

  if (!slug) return res.status(204).end();

  try {
    const room = await resolveRoom(slug);
    const allowed = isOriginAllowed(origin, room?.allowed_origins);

    if (!allowed) {
      return res.status(403).json({ error: 'CORS Blocked: Origin not permitted by project policy.' });
    }

    return res.status(204).end();
  } catch {
    return res.status(204).end();
  }
});

// ── POST /api/ingest/:slug and /:slug/:category ──────────────────────────────
router.post(['/:slug', '/:slug/:category'], rateLimit, async (req, res) => {
  const origin = req.headers.origin;
  // Always attach CORS headers so client receives readable error JSON if rejected
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, Authorization, X-Requested-With, x-api-key, accept');
  res.setHeader('Vary', 'Origin');

  try {
    const slug = String(req.params.slug || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 64);
    if (!slug) {
      return res.status(400).json({ error: 'Invalid project slug.' });
    }
    const body = req.body;

    // 1. Prototype Pollution & Input Validation
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) {
      return res.status(400).json({ error: 'Request body must be a non-empty JSON object.' });
    }

    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    if (Object.keys(body).some(k => dangerousKeys.includes(k))) {
      return res.status(400).json({ error: 'Invalid object keys detected.' });
    }

    // Determine normalized event category
    const rawCategory = req.params.category || body.category || body.type;
    const category = normalizeCategory(rawCategory);

    // 2. Resolve Room & Verify Project CORS Policy
    let room = await resolveRoom(slug);

    if (room && !isOriginAllowed(origin, room.allowed_origins)) {
      // Log detailed mismatch internally for server telemetry only — NEVER leak whitelist to the client (CWE-209 defense)
      console.warn(`[Ingest CORS Blocked] Project '${slug}' rejected origin '${origin}'.`);
      return res.status(403).json({
        error: 'CORS Blocked: Origin not permitted by project policy.'
      });
    }

    // 3. Auto-create room if not found (with multi-tier schema resilience)
    let autoCreated = false;
    if (!room) {
      const newToken = generateToken(4);
      let newRoom = null;
      let insertErr = null;

      // Tier 1: standard insert with visibility: 'api'
      const try1 = await supabase
        .from('rooms')
        .insert({
          token: newToken,
          note: slug,
          is_active: true,
          visibility: 'api',
        })
        .select('*')
        .maybeSingle();

      if (try1.data) {
        newRoom = try1.data;
      } else {
        insertErr = try1.error;
        // Tier 2: fallback to visibility: 'personal' if check constraint not yet updated
        const try2 = await supabase
          .from('rooms')
          .insert({
            token: newToken,
            note: slug,
            is_active: true,
            visibility: 'personal',
          })
          .select('*')
          .maybeSingle();

        if (try2.data) {
          newRoom = { ...try2.data, visibility: 'api' };
          insertErr = null;
        } else {
          // Tier 3: bare fallback without visibility column
          const try3 = await supabase
            .from('rooms')
            .insert({
              token: newToken,
              note: slug,
              is_active: true,
            })
            .select('*')
            .maybeSingle();

          if (try3.data) {
            newRoom = { ...try3.data, visibility: 'api' };
            insertErr = null;
          } else {
            insertErr = try3.error || insertErr;
          }
        }
      }

      if (insertErr || !newRoom) {
        throw new Error('Database room initialization failed: ' + (insertErr?.message || 'Unknown error'));
      }
      room = newRoom;
      autoCreated = true;
    }

    // 4. Sanitize and Filter Payload
    const cleanBody = {};
    for (const [k, v] of Object.entries(body)) {
      if (!IGNORED_KEYS.has(k.toLowerCase())) {
        const safeKey = String(k).slice(0, 128);
        const safeVal = typeof v === 'object' && v !== null ? v : String(v).slice(0, 2048);
        cleanBody[safeKey] = safeVal;
      }
    }

    let eventTitle = cleanBody.title || (cleanBody.endpoint ? `${cleanBody.endpoint} ${cleanBody.status ? String(cleanBody.status).toUpperCase() : 'OK'}` : null);
    if (!eventTitle) {
      eventTitle = cleanBody.message || cleanBody.description || `Inbound Event · ${slug}`;
    }

    let status = 'normal';
    const statusStr = String(cleanBody.status || cleanBody.level || cleanBody.type || '').toLowerCase();
    if (statusStr.includes('err') || statusStr.includes('fail') || statusStr.includes('crit') || statusStr.includes('bug') || category === 'bug') {
      status = 'error';
    } else if (statusStr.includes('warn')) {
      status = 'warning';
    }

    const eventPayload = {
      _type: 'api_event',
      slug,
      category,
      title: String(eventTitle).slice(0, 200),
      status,
      data: cleanBody,
    };

    const content = JSON.stringify(eventPayload);

    // 5. Insert Message into Database (with check constraint fallback on sender)
    let { data: message, error: msgErr } = await supabase
      .from('messages')
      .insert({
        room_id: room.id,
        sender: 'api',
        type: 'text',
        content,
      })
      .select()
      .maybeSingle();

    if (msgErr && (msgErr.code === '23514' || String(msgErr.message).includes('sender') || String(msgErr.message).includes('check'))) {
      const retryMsg = await supabase
        .from('messages')
        .insert({
          room_id: room.id,
          sender: 'guest',
          type: 'text',
          content,
        })
        .select()
        .maybeSingle();

      if (retryMsg.error) throw retryMsg.error;
      message = retryMsg.data;
      msgErr = null;
    }

    if (msgErr || !message) {
      throw new Error('Message persistence failed: ' + (msgErr?.message || 'Database insert error'));
    }

    // 6. Real-time Broadcast via Socket.IO
    const io = req.app.get('io');
    if (io) {
      await broadcastRoomEvent(io, room.token, 'new_message', {
        ...message,
        roomToken: room.token,
      });
    }

    // 7. Optional Discord Webhook Relay
    if (room.discord_webhook_url) {
      forwardToDiscord(room.discord_webhook_url, cleanBody, slug, room.token, message.created_at, category);
    }

    // 8. Respond to Client
    res.status(201).json({
      success: true,
      roomToken: room.token,
      category,
      messageId: message.id,
      receivedAt: message.created_at, // Automatic server timestamp
      autoCreated,
    });
  } catch (err) {
    console.error('[Ingest] Error:', err.stack || err.message);
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.status(500).json({ error: 'Ingestion service temporarily unavailable.' });
  }
});

module.exports = router;
