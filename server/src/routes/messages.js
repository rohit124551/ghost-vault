/**
 * GET  /api/rooms/:token/messages  — full history (public, token-validated)
 * POST /api/rooms/:token/messages  — save new message (text or file metadata)
 */
const crypto = require('node:crypto');
function editKey(id) {
  return crypto.createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY).update(String(id)).digest('hex');
}
const express = require('express');
const router = express.Router({ mergeParams: true });
const supabase = require('../lib/supabase');
const requireOwner = require('../middleware/requireOwner');
const roomAccess = require('../middleware/roomAccess');
const { broadcastRoomEvent } = require('../lib/roomEvents');
router.use(roomAccess);
const { roomFileUpload, deleteFromCloudinary } = require('../lib/cloudinary');

// Resolve room_id from token (shared helper)
async function getRoomByToken(token) {
  const { data, error } = await supabase
    .from('rooms')
    .select('id, is_active, is_paused, expires_at')
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
      .select('id, is_active, is_paused, expires_at')
      .eq('token', token)
      .single();

    if (roomErr || !room) return res.status(404).json({ error: 'Room not found' });

    // 2. Determine if user is owner
    let isOwner = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const jwt = authHeader.split(' ')[1];
      const { data: { user } } = await supabase.auth.getUser(jwt);
      if (user && (process.env.OWNER_EMAIL && user.email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase())) {
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

    // PostgREST caps single responses. Search and exports need the complete history.
    const history = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const {data, error} = await supabase.from('messages').select('*').eq('room_id', room.id)
        .order('created_at', {ascending: true}).order('id', {ascending: true}).range(offset, offset + pageSize - 1);
      if (error) throw error;
      history.push(...data);
      if (data.length < pageSize) break;
    }
    res.json(history);
  } catch (err) {
    next(err);
  }
});

// POST /api/rooms/:token/messages — save text message (guest or owner)
router.patch('/:id/text', async (req, res, next) => {
  try {
    const {id} = req.params;
    const {content, key} = req.body;
    if (typeof content !== 'string' || !content.trim() || content.length > 2000) return res.sendStatus(400);
    if (!req.owner && (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key) ||
        !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(editKey(id))))) return res.sendStatus(403);
    if (!await getRoomByToken(req.params.token)) return res.sendStatus(404);
    const {data, error} = await supabase.from('messages').update({content: content.trim()})
      .eq('id', id).eq('room_id', req.room.id).eq('type', 'text').eq('sender', req.owner ? 'owner' : 'guest')
      .is('burn_after_seconds', null).select().maybeSingle();
    if (error) throw error;
    if (!data) return res.sendStatus(404);
    await broadcastRoomEvent(req.app.get('io'), req.params.token, 'chat_patch', {token: req.params.token, ids: [id], patch: {content: data.content}});
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/receipts', async (req, res, next) => {
  try {
    const {ids, seen} = req.body;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(id))) return res.sendStatus(400);
    const now = new Date().toISOString();
    const patch = seen === true ? {seen_at: now, delivered_at: now} : {delivered_at: now};
    let query = supabase.from('messages').update(patch).eq('room_id', req.room.id)
      .eq('sender', req.owner ? 'guest' : 'owner').in('id', ids).is(seen === true ? 'seen_at' : 'delivered_at', null);
    if (seen === true) query = query.is('burn_after_seconds', null);
    const {data, error} = await query.select('id');
    if (error) throw error;
    const changed = data.map(m => m.id);
    if (changed.length) await broadcastRoomEvent(req.app.get('io'), req.params.token, 'chat_patch', {token: req.params.token, ids: changed, patch});
    res.json({ids: changed, patch});
  } catch (err) { next(err); }
});

router.post('/text', async (req, res, next) => {
  try {
    const room = await getRoomByToken(req.params.token);
    if (!room) return res.status(404).json({ error: 'Room not found or inactive' });

    const { content, burn_after_seconds = null, reply_to_id = null } = req.body;
    const sender = req.owner ? 'owner' : 'guest';
    if (typeof content !== 'string' || content.length > 2000) return res.status(400).json({error: 'Use up to 2000 characters'});
    if (!content.trim()) return res.status(400).json({ error: 'content is required' });

    // If sender is owner, verify JWT
    if (sender === 'owner') {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'Owner auth required' });
      const token = authHeader.split(' ')[1];
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });
      const ownerEmail = process.env.OWNER_EMAIL;
      if (ownerEmail && user.email !== ownerEmail) return res.status(403).json({ error: 'Access denied' });
    } else {
      // It's a guest
      if (room.is_paused) return res.status(403).json({ error: 'Room is currently paused by admin' });
    }

    const { data: message, error } = await supabase
      .from('messages')
      .insert({ 
        room_id: room.id, 
        sender, 
        type: 'text', 
        content: content.trim(),
        burn_after_seconds: burn_after_seconds ? parseInt(burn_after_seconds, 10) : null,
        reply_to_id,
        ...(reply_to_id && req.body.is_thread_reply === true && {is_thread_reply: true})
      })
      .select()
      .single();

    if (error) throw error;

    // Emit to room via Socket.IO
    const io = req.app.get('io');
    await broadcastRoomEvent(io, req.params.token, 'new_message', { ...message, roomToken: req.params.token });

    res.status(201).json(sender === 'guest' ? {...message, editKey: editKey(message.id)} : message);
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

      const sender = req.owner ? 'owner' : 'guest';
      
      if (sender !== 'owner' && room.is_paused) {
        return res.status(403).json({ error: 'Room is currently paused by admin' });
      }

      const burn_after_seconds = req.body.burn_after_seconds ? parseInt(req.body.burn_after_seconds, 10) : null;
      const reply_to_id = req.body.reply_to_id || null;
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
          burn_after_seconds,
          reply_to_id,
          ...(reply_to_id && req.body.is_thread_reply === 'true' && {is_thread_reply: true})
        })
        .select()
        .single();

      if (error) throw error;

      const io = req.app.get('io');
      await broadcastRoomEvent(io, req.params.token, 'new_message', { ...message, roomToken: req.params.token });

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
      .eq('id', id).eq('room_id', req.room.id)
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
      .eq('id', id).eq('room_id', req.room.id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Emit event so other clients start the timer too
    const io = req.app.get('io');
    await broadcastRoomEvent(io, token, 'message_viewed', { 
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
      .eq('id', id).eq('room_id', req.room.id)
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
      .eq('id', id).eq('room_id', req.room.id);
    if (error) throw error;

    // Emit socket event to notify guests and owner in real-time
    const io = req.app.get('io');
    await broadcastRoomEvent(io, token, 'message_burned', { id, roomToken: token });

    res.json({ success: true, burnt: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/rooms/:token/messages/batch-delete — owner batch deletes multiple messages
router.post('/batch-delete', requireOwner, async (req, res, next) => {
  try {
    const { token } = req.params;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' });
    }

    // 1. Fetch messages first to clean up any Cloudinary files
    const { data: msgs, error: fetchErr } = await supabase
      .from('messages')
      .select('id, file_url, file_name, type')
      .in('id', ids)
      .eq('room_id', req.room.id);

    if (!fetchErr && Array.isArray(msgs)) {
      for (const msg of msgs) {
        if (msg.file_url) {
          const parts = msg.file_url.split('/upload/');
          if (parts.length > 1) {
            let path = parts[1];
            if (path.match(/^v\d+\//)) path = path.replace(/^v\d+\//, '');
            const lastDot = path.lastIndexOf('.');
            if (lastDot > -1) path = path.substring(0, lastDot);
            const ext = (msg.file_name || '').split('.').pop().toLowerCase();
            await deleteFromCloudinary(path, ext || msg.type).catch(() => {});
          }
        }
      }
    }

    // 2. Delete all requested messages belonging to this room
    const { error } = await supabase
      .from('messages')
      .delete()
      .in('id', ids)
      .eq('room_id', req.room.id);

    if (error) throw error;

    // 3. Emit real-time socket events
    const io = req.app.get('io');
    await broadcastRoomEvent(io, token, 'messages_batch_deleted', { ids, roomToken: token });
    for (const id of ids) {
      await broadcastRoomEvent(io, token, 'message_deleted', { id, roomToken: token });
    }

    res.json({ success: true, count: ids.length, ids });
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
      .eq('id', id).eq('room_id', req.room.id)
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
      .eq('id', id).eq('room_id', req.room.id);
    if (error) throw error;

    // Emit socket event to notify guests and owner in real-time
    const io = req.app.get('io');
    await broadcastRoomEvent(io, token, 'message_deleted', { id, roomToken: token });

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

    if (userId !== 'owner' && room.is_paused) {
      return res.status(403).json({ error: 'Room is currently paused by admin' });
    }

    const { data: msg, error: fetchErr } = await supabase
      .from('messages')
      .select('reactions')
      .eq('id', id).eq('room_id', req.room.id)
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
        if (user && (process.env.OWNER_EMAIL && user.email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase())) {
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
      .eq('id', id).eq('room_id', req.room.id)
      .select()
      .single();
      
    if (updateErr) throw updateErr;

    const io = req.app.get('io');
    await broadcastRoomEvent(io, token, 'message_reacted', { 
      messageId: id, 
      reactions: updatedMsg.reactions, 
      roomToken: token 
    });

    res.json(updatedMsg);
  } catch (err) {
    next(err);
  }
});
// POST /api/rooms/:token/messages/:id/pin — Toggle pin status
router.post('/:id/pin', async (req, res, next) => {
  try {
    const { token, id } = req.params;
    
    // Auth check (if needed, but usually both owner and guest can pin)
    // Validate room exists
    const room = await getRoomByToken(token);
    if (!room) return res.status(403).json({ error: 'Room unavailable' });

    // Fetch message
    const { data: msg, error: msgErr } = await supabase
      .from('messages')
      .select('is_pinned')
      .eq('id', id).eq('room_id', req.room.id)
      .eq('room_id', room.id)
      .single();

    if (msgErr || !msg) return res.status(404).json({ error: 'Message not found' });

    // Toggle pin
    const newPinStatus = !msg.is_pinned;
    const { data: updatedMsg, error: updateErr } = await supabase
      .from('messages')
      .update({ is_pinned: newPinStatus })
      .eq('id', id).eq('room_id', req.room.id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Broadcast
    const io = req.app.get('io');
    await broadcastRoomEvent(io, token, 'message_pinned', { 
      messageId: id, 
      is_pinned: newPinStatus,
      roomToken: token 
    });

    res.json(updatedMsg);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
