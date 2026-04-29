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
      .select('id, token, expires_at, is_active, view_once')
      .eq('token', token)
      .single();

    if (error || !room || !room.is_active) {
      return res.json({ valid: false });
    }

    if (room.expires_at && new Date(room.expires_at) < new Date()) {
      await supabase.from('rooms').update({ is_active: false }).eq('token', token);
      return res.json({ valid: false });
    }

    res.json({
      valid: true,
      expiresAt: room.expires_at,
      viewOnce: room.view_once,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/rooms — create a new room with unique token (owner only)
router.post('/', requireOwner, async (req, res, next) => {
  try {
    const { expiresInMinutes, viewOnce = false } = req.body;

    // Generate unique token (check DB)
    let token;
    let attempts = 0;
    do {
      token = generateToken(4);
      const { data } = await supabase.from('rooms').select('id').eq('token', token).single();
      if (!data) break; // token is unique
      attempts++;
    } while (attempts < 10);

    const expiresAt = expiresInMinutes
      ? new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString()
      : null;

    const { data, error } = await supabase
      .from('rooms')
      .insert({
        token,
        expires_at: expiresAt,
        view_once: viewOnce,
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
        id, token, created_at, expires_at, view_once, is_active,
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

module.exports = router;
