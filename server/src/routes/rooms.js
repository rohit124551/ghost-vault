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

// GET /api/rooms/:token/valid — public endpoint, guests validate their token
// IMPORTANT: must be before the generic :token delete route
router.get('/:token/valid', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { data: room, error } = await supabase
      .from('rooms')
      .select('id, token, expires_at, is_active, view_once, note')
      .eq('token', token)
      .single();

    if (error || !room) {
      return res.json({ valid: false, reason: 'not_found' });
    }

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
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/rooms — create a new room with unique token (owner only)
router.post('/', requireOwner, async (req, res, next) => {
  try {
    const { expiresInMinutes, viewOnce = false, note, customToken } = req.body;

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
      // Generate unique token (check DB)
      let attempts = 0;
      do {
        token = generateToken(4);
        const { data } = await supabase.from('rooms').select('id').eq('token', token).single();
        if (!data) break; // token is unique
        attempts++;
      } while (attempts < 10);
    }

    const expiresAt = expiresInMinutes
      ? new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString()
      : null;

    const { data, error } = await supabase
      .from('rooms')
      .insert({
        token,
        expires_at: expiresAt,
        view_once: viewOnce,
        note: note || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ token: data.token, expiresAt: data.expires_at, id: data.id });
  } catch (err) {
    next(err);
  }
});

// GET /api/rooms — list all active rooms (owner only)
router.get('/', requireOwner, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('rooms')
      .select(`
        id, token, created_at, expires_at, view_once, is_active, note,
        uploads(id, file_name, cloudinary_url, created_at, file_type)
      `)
      .order('created_at', { ascending: false });

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
    io.to(`room:${token}`).emit('room_revoked', { token });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/rooms/:token — edit room settings post-creation (owner only)
// Supports: extending TTL (addMinutes | newExpiresAt), changing note, reactivating
router.patch('/:token', requireOwner, async (req, res, next) => {
  try {
    const { token } = req.params;
    const { note, addMinutes, newExpiresAt, isActive, clearExpiry } = req.body;

    const { data: room, error: fetchErr } = await supabase
      .from('rooms')
      .select('id, expires_at, is_active, note')
      .eq('token', token)
      .single();

    if (fetchErr || !room) return res.status(404).json({ error: 'Room not found' });

    const updates = {};

    // Handle note update
    if (note !== undefined) updates.note = note || null;

    // Handle active toggle (reactivation)
    if (isActive !== undefined) updates.is_active = Boolean(isActive);

    // Handle expiry extension: add minutes to CURRENT expiry (or from now)
    if (addMinutes && !isNaN(Number(addMinutes))) {
      const base = room.expires_at ? new Date(room.expires_at) : new Date();
      updates.expires_at = new Date(base.getTime() + Number(addMinutes) * 60 * 1000).toISOString();
    } else if (clearExpiry) {
      // Make it never expire
      updates.expires_at = null;
    } else if (newExpiresAt) {
      updates.expires_at = new Date(newExpiresAt).toISOString();
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    const { data, error } = await supabase
      .from('rooms')
      .update(updates)
      .eq('token', token)
      .select()
      .single();

    if (error) throw error;

    // Broadcast to connected guests so their timers and status update live
    const io = req.app.get('io');
    io.to(`room:${token}`).emit('room_updated', {
      token,
      expiresAt: data.expires_at,
      note: data.note,
      isActive: data.is_active,
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

    // 2. Collect all Cloudinary public IDs from room_messages
    const { data: messages } = await supabase
      .from('room_messages')
      .select('cloudinary_public_id, mime_type')
      .eq('room_id', room.id)
      .not('cloudinary_public_id', 'is', null);

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
        const isImage = m.mime_type?.startsWith('image/');
        deletePromises.push(deleteFromCloudinary(m.cloudinary_public_id, isImage ? 'image' : 'raw'));
      });
    }

    if (uploads) {
      uploads.forEach(u => {
        const isImage = u.file_type?.startsWith('image/');
        deletePromises.push(deleteFromCloudinary(u.cloudinary_public_id, isImage ? 'image' : 'raw'));
      });
    }

    await Promise.allSettled(deletePromises);

    // 5. Hard delete room (this will cascade to messages if ON DELETE CASCADE is set,
    // but we manually delete associated uploads just in case)
    await supabase.from('uploads').delete().eq('room_id', room.id);
    await supabase.from('room_messages').delete().eq('room_id', room.id);
    const { error: delErr } = await supabase.from('rooms').delete().eq('id', room.id);

    if (delErr) throw delErr;

    // Notify any active listeners
    const io = req.app.get('io');
    io.to(`room:${token}`).emit('room_revoked', { token });

    res.json({ success: true, message: 'Room and all associated data permanently deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

