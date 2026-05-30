/**
 * GET  /api/rooms/:token/messages  — full history (public, token-validated)
 * POST /api/rooms/:token/messages  — save new message (text or file metadata)
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const supabase = require('../lib/supabase');
const requireOwner = require('../middleware/requireOwner');
const { roomFileUpload, deleteFromCloudinary } = require('../lib/cloudinary');

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

    const { content, sender = 'guest', burn_after_seconds = null } = req.body;
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
      .insert({ 
        room_id: room.id, 
        sender, 
        type: 'text', 
        content: content.trim(),
        burn_after_seconds: burn_after_seconds ? parseInt(burn_after_seconds, 10) : null
      })
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
      const burn_after_seconds = req.body.burn_after_seconds ? parseInt(req.body.burn_after_seconds, 10) : null;
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
          burn_after_seconds
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

// POST /api/rooms/:token/messages/:id/view — mark a self-destruct message as viewed
router.post('/:id/view', async (req, res, next) => {
  try {
    const { token, id } = req.params;
    
    // First get the message
    const { data: msg, error: fetchErr } = await supabase
      .from('messages')
      .select('viewed_at, burn_after_seconds')
      .eq('id', id)
      .single();
      
    if (fetchErr || !msg) return res.status(404).json({ error: 'Message not found' });
    
    // If it's already viewed or doesn't have a timer, do nothing
    if (msg.viewed_at || !msg.burn_after_seconds) {
      return res.json({ success: true, viewed_at: msg.viewed_at });
    }

    const now = new Date().toISOString();
    const { data: updatedMsg, error: updateErr } = await supabase
      .from('messages')
      .update({ viewed_at: now })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Emit event so other clients start the timer too
    const io = req.app.get('io');
    io.to(`room:${token}`).emit('message_viewed', { 
      id: id, 
      viewed_at: now, 
      roomToken: token 
    });

    res.json(updatedMsg);
  } catch (err) {
    next(err);
  }
});

// POST /api/rooms/:token/messages/:id/burn — delete a message whose timer has expired
router.post('/:id/burn', async (req, res, next) => {
  try {
    const { token, id } = req.params;
    
    // Fetch message to verify it has a timer and get file_url
    const { data: msg, error: fetchErr } = await supabase
      .from('messages')
      .select('file_url, file_name, type, burn_after_seconds, viewed_at')
      .eq('id', id)
      .single();
      
    if (fetchErr || !msg) return res.status(404).json({ error: 'Message not found' });
    
    // Safety check: must have a timer that was activated
    if (!msg.burn_after_seconds || !msg.viewed_at) {
      return res.status(403).json({ error: 'Cannot burn a message without an active timer' });
    }

    // (Optional) We could verify `NOW() > viewed_at + burn_after_seconds` here, but for MVP, trust the client trigger
    
    // Delete Cloudinary file if it exists
    if (msg.file_url) {
      const parts = msg.file_url.split('/upload/');
      if (parts.length > 1) {
        let path = parts[1];
        if (path.match(/^v\d+\//)) {
          path = path.replace(/^v\d+\//, '');
        }
        const lastDot = path.lastIndexOf('.');
        if (lastDot > -1) {
          path = path.substring(0, lastDot);
        }
        const ext = (msg.file_name || '').split('.').pop().toLowerCase();
        await deleteFromCloudinary(path, ext || msg.type);
      }
    }

    const { error } = await supabase
      .from('messages')
      .update({ type: 'burned', content: null, file_url: null, file_name: null, file_size: null })
      .eq('id', id);
    if (error) throw error;

    // Emit socket event to notify guests and owner in real-time
    const io = req.app.get('io');
    io.to(`room:${token}`).emit('message_burned', { id, roomToken: token });

    res.json({ success: true, burnt: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/rooms/:token/messages/:id — owner deletes a message
router.delete('/:id', requireOwner, async (req, res, next) => {
  try {
    const { token, id } = req.params;
    
    // Fetch message first to get file_url
    const { data: msg, error: fetchErr } = await supabase
      .from('messages')
      .select('file_url, file_name, type')
      .eq('id', id)
      .single();
      
    if (!fetchErr && msg && msg.file_url) {
      const parts = msg.file_url.split('/upload/');
      if (parts.length > 1) {
        let path = parts[1];
        if (path.match(/^v\d+\//)) {
          path = path.replace(/^v\d+\//, '');
        }
        const lastDot = path.lastIndexOf('.');
        if (lastDot > -1) {
          path = path.substring(0, lastDot);
        }
        
        const ext = (msg.file_name || '').split('.').pop().toLowerCase();
        await deleteFromCloudinary(path, ext || msg.type);
      }
    }

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', id);
    if (error) throw error;

    // Emit socket event to notify guests and owner in real-time
    const io = req.app.get('io');
    io.to(`room:${token}`).emit('message_deleted', { id, roomToken: token });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
// POST /api/rooms/:token/messages/:id/react — toggle/remove emoji reaction
router.post('/:id/react', async (req, res, next) => {
  try {
    const { token, id } = req.params;
    const { emoji, userId, forceRemove } = req.body;
    
    if (!emoji || !userId) return res.status(400).json({ error: 'Emoji and userId required' });

    const room = await getRoomByToken(token);
    if (!room) return res.status(404).json({ error: 'Room not found or inactive' });

    const { data: msg, error: fetchErr } = await supabase
      .from('messages')
      .select('reactions')
      .eq('id', id)
      .single();
      
    if (fetchErr || !msg) return res.status(404).json({ error: 'Message not found' });
    
    let reactions = msg.reactions || {};
    
    // Validate if the request is trying to force remove, verify owner auth
    let isOwnerAuth = false;
    if (forceRemove && userId === 'owner') {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const jwt = authHeader.split(' ')[1];
        const { data: { user } } = await supabase.auth.getUser(jwt);
        if (user && (!process.env.OWNER_EMAIL || user.email === process.env.OWNER_EMAIL)) {
          isOwnerAuth = true;
        }
      }
      if (!isOwnerAuth) {
         return res.status(403).json({ error: 'Access denied. Owner auth required for forceRemove.' });
      }
    }

    if (forceRemove && isOwnerAuth) {
      // Admin superpower: completely wipe this emoji reaction
      delete reactions[emoji];
    } else {
      // Toggle logic
      if (!reactions[emoji]) reactions[emoji] = [];
      
      const userIndex = reactions[emoji].indexOf(userId);
      if (userIndex > -1) {
        reactions[emoji].splice(userIndex, 1);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji].push(userId);
      }
    }
    
    const { data: updatedMsg, error: updateErr } = await supabase
      .from('messages')
      .update({ reactions })
      .eq('id', id)
      .select()
      .single();
      
    if (updateErr) throw updateErr;

    const io = req.app.get('io');
    io.to(`room:${token}`).emit('message_reacted', { 
      messageId: id, 
      reactions: updatedMsg.reactions, 
      roomToken: token 
    });

    res.json(updatedMsg);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
