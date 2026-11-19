/**
 * POST   /api/rooms               — create room (owner only)
 * GET    /api/rooms               — list active rooms (owner only)
 * DELETE /api/rooms/:token        — revoke room (owner only)
 * GET    /api/rooms/:token/valid  — check token validity (public)
 */
const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const requireOwner = require('../middleware/requireOwner');
const { generateToken } = require('../lib/token');
const { guestsCanAccess } = require('../lib/roomAccess');
const { broadcastRoomEvent, closeGuestAccess } = require('../lib/roomEvents');

// GET /api/rooms/:token/valid — public endpoint, guests validate their token
// IMPORTANT: must be before the generic :token delete route
router.get('/:token/valid', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { data: room, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !room) {
      return res.json({ valid: false, reason: 'not_found' });
    }

    if (!guestsCanAccess(room)) return res.json({ valid: false, reason: 'unavailable' });

    if (!room.is_active) {
      return res.json({ valid: false, reason: 'revoked' });
    }

    if (room.expires_at && new Date(room.expires_at) < new Date()) {
      await supabase.from('rooms').update({ is_active: false }).eq('token', token);
      return res.json({ valid: false, reason: 'expired' });
    }

    res.json({
      valid: true,
      expiresAt: room.expires_at,
      viewOnce: room.view_once,
      note: room.note,
      isPaused: room.is_paused,
      pausedRemainingSeconds: room.paused_remaining_seconds,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/rooms — create a new room with unique token (owner only)
router.post('/', requireOwner, async (req, res, next) => {
  try {
    const { expiresInMinutes, viewOnce = false, note, customToken, visibility = 'shared', isPaused = false, discord_webhook_url, allowed_origins } = req.body;
    if (!['personal', 'shared', 'api'].includes(visibility)) return res.status(400).json({ error: 'Invalid chat visibility' });

    let token;

    if (customToken) {
      // Validate and sanitize custom token
      const sanitized = customToken.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 64);
      if (sanitized.length < 2) {
        return res.status(400).json({ error: 'Custom token must be at least 2 characters.' });
      }
      // Check uniqueness
      const { data: existing } = await supabase.from('rooms').select('id').eq('token', sanitized).single();
      if (existing) {
        return res.status(409).json({ error: 'That custom token is already taken. Please choose another.' });
      }
      token = sanitized;
    } else {
      // Generate clean 4-character unique token
      let attempts = 0;
      do {
        token = generateToken(4);
        const { data } = await supabase.from('rooms').select('id').eq('token', token).single();
        if (!data) break; // token is unique
        attempts++;
      } while (attempts < 10);
    }

    const pausing = Boolean(isPaused);
    const expiresAt = (!pausing && expiresInMinutes && visibility === 'shared')
      ? new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString()
      : null;

    const pausedRemainingSeconds = (pausing && expiresInMinutes && visibility === 'shared')
      ? Number(expiresInMinutes) * 60
      : null;

    const insertPayload = {
      token,
      visibility,
      expires_at: expiresAt,
      is_paused: pausing,
      paused_remaining_seconds: pausedRemainingSeconds,
      view_once: visibility === 'shared' && viewOnce,
      note: note || null,
      is_active: true,
      discord_webhook_url: discord_webhook_url || null,
      allowed_origins: allowed_origins || null,
    };

    let { data, error } = await supabase
      .from('rooms')
      .insert(insertPayload)
      .select()
      .single();

    // Fallback 1: If 'visibility' column doesn't exist yet
    if (error && (error.code === '42703' || String(error.message).includes('visibility'))) {
      delete insertPayload.visibility;
      const retry = await supabase
        .from('rooms')
        .insert(insertPayload)
        .select()
        .single();
      if (retry.error) throw retry.error;
      data = { ...retry.data, visibility: 'shared' };
      error = null;
    }

    // Fallback 2: If check constraint rooms_visibility_check doesn't permit 'api' yet
    if (error && (error.code === '23514' || String(error.message).includes('rooms_visibility_check'))) {
      insertPayload.visibility = 'personal';
      const retry = await supabase
        .from('rooms')
        .insert(insertPayload)
        .select()
        .single();
      if (retry.error) throw retry.error;
      data = { ...retry.data, visibility: 'api' };
      error = null;
    }

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/rooms — list all active rooms (owner only)
router.get('/', requireOwner, async (req, res, next) => {
  try {
    let { data, error } = await supabase
      .from('rooms')
      .select(`
        id, token, created_at, expires_at, view_once, is_active, is_paused, note, paused_remaining_seconds, visibility, discord_webhook_url, allowed_origins,
        uploads(id, file_name, cloudinary_url, created_at, file_type)
      `)
      .order('created_at', { ascending: false });

    if (error && (error.code === '42703' || String(error.message).includes('visibility'))) {
      const fallback = await supabase
        .from('rooms')
        .select(`
          id, token, created_at, expires_at, view_once, is_active, is_paused, note, paused_remaining_seconds,
          uploads(id, file_name, cloudinary_url, created_at, file_type)
        `)
        .order('created_at', { ascending: false });
      if (fallback.error) throw fallback.error;
      data = (fallback.data || []).map(r => ({ visibility: 'shared', discord_webhook_url: null, allowed_origins: null, ...r }));
      error = null;
    }

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/rooms/:token — revoke a room (owner only)
router.delete('/:token', requireOwner, async (req, res, next) => {
  try {
    const { token } = req.params;

    const { data: room, error: fetchErr } = await supabase
      .from('rooms')
      .select('id')
      .eq('token', token)
      .single();

    if (fetchErr || !room) return res.status(404).json({ error: 'Room not found' });

    const { error } = await supabase
      .from('rooms')
      .update({ is_active: false })
      .eq('token', token);

    if (error) throw error;

    // Notify guests connected to this room via Socket.IO
    const io = req.app.get('io');
    closeGuestAccess(io, token);
    io.to(`room:${token}:owners`).emit('room_revoked', { token });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/rooms/:token — edit room settings post-creation (owner only)
// Supports: extending TTL (addMinutes | newExpiresAt), changing note, reactivating, pausing
router.patch('/:token', requireOwner, async (req, res, next) => {
  try {
    const { token } = req.params;
    const { note, addMinutes, newExpiresAt, isActive, clearExpiry, isPaused, visibility, confirmPublish, discord_webhook_url, allowed_origins } = req.body;

    const { data: room, error: fetchErr } = await supabase
      .from('rooms')
      .select('*')
      .eq('token', token)
      .single();

    if (fetchErr || !room) return res.status(404).json({ error: 'Room not found' });

    const updates = {};
    if (visibility !== undefined) {
      if (!['personal', 'shared', 'api'].includes(visibility)) return res.status(400).json({ error: 'Invalid chat visibility' });
      if (visibility === 'shared' && room.visibility !== 'shared' && confirmPublish !== true) {
        return res.status(400).json({ error: 'Confirm that the entire chat history will be shared.' });
      }
      updates.visibility = visibility;
    }

    // Handle note update
    if (note !== undefined) updates.note = note || null;

    // Handle Discord webhook URL
    if (discord_webhook_url !== undefined) updates.discord_webhook_url = discord_webhook_url || null;

    // Handle Allowed Origins (CORS Whitelist)
    if (allowed_origins !== undefined) updates.allowed_origins = allowed_origins || null;

    // Handle active toggle (reactivation)
    if (isActive !== undefined) updates.is_active = Boolean(isActive);

    // Handle pause toggle
    if (isPaused !== undefined) {
      const pausing = Boolean(isPaused);
      updates.is_paused = pausing;

      if (pausing && !room.is_paused) {
        if (room.expires_at) {
          updates.paused_remaining_seconds = Math.max(0, Math.floor((new Date(room.expires_at).getTime() - Date.now()) / 1000));
          updates.expires_at = null;
        }
      } else if (!pausing && room.is_paused) {
        if (room.paused_remaining_seconds) {
          updates.expires_at = new Date(Date.now() + room.paused_remaining_seconds * 1000).toISOString();
          updates.paused_remaining_seconds = null;
        }
      }
    }

    // Handle expiry extension: add minutes to CURRENT expiry (or from now)
    const isCurrentlyPaused = updates.is_paused ?? room.is_paused;
    if (addMinutes && !isNaN(Number(addMinutes))) {
      if (isCurrentlyPaused) {
        const currentRemaining = updates.paused_remaining_seconds ?? room.paused_remaining_seconds ?? 0;
        updates.paused_remaining_seconds = currentRemaining + Number(addMinutes) * 60;
      } else {
        const base = updates.expires_at ? new Date(updates.expires_at) : (room.expires_at ? new Date(room.expires_at) : new Date());
        updates.expires_at = new Date(base.getTime() + Number(addMinutes) * 60 * 1000).toISOString();
      }
    } else if (clearExpiry) {
      updates.expires_at = null;
      updates.paused_remaining_seconds = null;
    } else if (newExpiresAt) {
      if (isCurrentlyPaused) {
        updates.paused_remaining_seconds = Math.max(0, Math.floor((new Date(newExpiresAt).getTime() - Date.now()) / 1000));
      } else {
        updates.expires_at = new Date(newExpiresAt).toISOString();
      }
    }

    const effectiveVisibility = updates.visibility ?? room.visibility;
    if (effectiveVisibility === 'personal' || effectiveVisibility === 'api') {
      updates.expires_at = null;
      updates.paused_remaining_seconds = null;
      updates.is_paused = false;
      updates.view_once = false;
      if (visibility === 'personal' || visibility === 'api') updates.is_active = true;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    let { data, error } = await supabase
      .from('rooms')
      .update(updates)
      .eq('token', token)
      .select()
      .single();

    if (error && (error.code === '42703' || String(error.message).includes('visibility'))) {
      return res.status(400).json({ error: 'Database column "visibility" is not present in Supabase yet. Please run the SQL migration in Supabase SQL Editor.' });
    }

    if (error) throw error;

    // Broadcast to connected guests so their timers and status update live
    const io = req.app.get('io');
    if (!guestsCanAccess(data)) closeGuestAccess(io, token);
    await broadcastRoomEvent(io, token, 'room_updated', {
      visibility: data.visibility,
      token,
      expiresAt: data.expires_at,
      note: data.note,
      isActive: data.is_active,
      isPaused: data.is_paused,
    });

    res.json({ success: true, room: data });
  } catch (err) {
    next(err);
  }
});


// DELETE /api/rooms/:token/permanent — hard delete room + all files + all messages
router.delete('/:token/permanent', requireOwner, async (req, res, next) => {
  try {
    const { token } = req.params;
    const { deleteFromCloudinary } = require('../lib/cloudinary');

    // 1. Get room info
    const { data: room, error: fetchErr } = await supabase
      .from('rooms')
      .select('id')
      .eq('token', token)
      .single();

    if (fetchErr || !room) return res.status(404).json({ error: 'Room not found' });

    // 2. Collect all Cloudinary URLs from messages
    const { data: messages } = await supabase
      .from('messages')
      .select('file_url, file_name, type')
      .eq('room_id', room.id)
      .not('file_url', 'is', null);

    // 3. Collect all Cloudinary public IDs from uploads
    const { data: uploads } = await supabase
      .from('uploads')
      .select('cloudinary_public_id, file_type')
      .eq('room_id', room.id)
      .not('cloudinary_public_id', 'is', null);

    // 4. Batch delete from Cloudinary
    const deletePromises = [];

    if (messages) {
      messages.forEach(m => {
        if (m.file_url) {
          const parts = m.file_url.split('/upload/');
          if (parts.length > 1) {
            let path = parts[1];
            if (path.match(/^v\d+\//)) path = path.replace(/^v\d+\//, '');
            const lastDot = path.lastIndexOf('.');
            if (lastDot > -1) path = path.substring(0, lastDot);
            
            const ext = (m.file_name || '').split('.').pop().toLowerCase();
            deletePromises.push(deleteFromCloudinary(path, ext || m.type));
          }
        }
      });
    }

    if (uploads) {
      uploads.forEach(u => {
        deletePromises.push(deleteFromCloudinary(u.cloudinary_public_id, u.file_type));
      });
    }

    await Promise.allSettled(deletePromises);

    // 5. Hard delete room (this will cascade to messages if ON DELETE CASCADE is set,
    // but we manually delete associated uploads just in case)
    await supabase.from('uploads').delete().eq('room_id', room.id);
    await supabase.from('messages').delete().eq('room_id', room.id);
    const { error: delErr } = await supabase.from('rooms').delete().eq('id', room.id);

    if (delErr) throw delErr;

    // Notify any active listeners
    const io = req.app.get('io');
    closeGuestAccess(io, token);
    io.to(`room:${token}:owners`).emit('room_revoked', { token });

    res.json({ success: true, message: 'Room and all associated data permanently deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

