/**
 * GET  /api/rooms/:token/messages  — full history (public, token-validated)
 * POST /api/rooms/:token/messages  — save new message (text or file metadata)
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const supabase = require('../lib/supabase');
const requireOwner = require('../middleware/requireOwner');
const { roomFileUpload } = require('../lib/cloudinary');

// Resolve room_id from token (shared helper)
async function getRoomByToken(token) {
  const { data, error } = await supabase
    .from('rooms')
    .select('id, is_active, expires_at')
    .eq('token', token)
    .single();
  if (error || !data) return null;
  if (!data.is_active) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
  return data;
}

// GET /api/rooms/:token/messages — fetch full message history
router.get('/', async (req, res, next) => {
  try {
    const { token } = req.params;
    
    // 1. Find the room regardless of status
    const { data: room, error: roomErr } = await supabase
      .from('rooms')
      .select('id, is_active, expires_at')
      .eq('token', token)
      .single();

    if (roomErr || !room) return res.status(404).json({ error: 'Room not found' });

    // 2. Determine if user is owner
    let isOwner = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const jwt = authHeader.split(' ')[1];
      const { data: { user } } = await supabase.auth.getUser(jwt);
      if (user && (!process.env.OWNER_EMAIL || user.email === process.env.OWNER_EMAIL)) {
        isOwner = true;
      }
    }

    // 3. If not owner, check room status
    if (!isOwner) {
      if (!room.is_active) return res.status(403).json({ error: 'Room has been revoked' });
      if (room.expires_at && new Date(room.expires_at) < new Date()) {
        return res.status(403).json({ error: 'Room has expired' });
      }
    }

    // 4. Fetch messages
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', room.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// POST /api/rooms/:token/messages — save text message (guest or owner)
router.post('/text', async (req, res, next) => {
  try {
    const room = await getRoomByToken(req.params.token);
    if (!room) return res.status(404).json({ error: 'Room not found or inactive' });

    const { content, sender = 'guest' } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content is required' });

    // If sender is owner, verify JWT
    if (sender === 'owner') {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'Owner auth required' });
      const token = authHeader.split(' ')[1];
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });
      const ownerEmail = process.env.OWNER_EMAIL;
      if (ownerEmail && user.email !== ownerEmail) return res.status(403).json({ error: 'Access denied' });
    }

    const { data: message, error } = await supabase
      .from('messages')
      .insert({ room_id: room.id, sender, type: 'text', content: content.trim() })
      .select()
      .single();

    if (error) throw error;

    // Emit to room via Socket.IO
    const io = req.app.get('io');
    io.to(`room:${req.params.token}`).emit('new_message', { ...message, roomToken: req.params.token });

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

// POST /api/rooms/:token/messages/file — upload file to Cloudinary + save message
router.post('/file', (req, res, next) => {
  roomFileUpload.single('file')(req, res, async (err) => {
    if (err) return next(err);
    try {
      const room = await getRoomByToken(req.params.token);
      if (!room) return res.status(404).json({ error: 'Room not found or inactive' });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const sender = req.body.sender || 'guest';
      const isImage = req.file.mimetype.startsWith('image/');

      const { data: message, error } = await supabase
        .from('messages')
        .insert({
          room_id: room.id,
          sender,
          type: isImage ? 'image' : 'file',
          file_url: req.file.path,
          file_name: req.body.fileName || req.file.originalname,
          file_size: req.file.size,
        })
        .select()
        .single();

      if (error) throw error;

      const io = req.app.get('io');
      io.to(`room:${req.params.token}`).emit('new_message', { ...message, roomToken: req.params.token });

      res.status(201).json(message);
    } catch (err2) {
      next(err2);
    }
  });
});

// DELETE /api/rooms/:token/messages/:id — owner deletes a message
router.delete('/:id', requireOwner, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
