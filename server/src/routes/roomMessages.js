const express = require('express');
const router = express.Router({ mergeParams: true });
const supabase = require('../lib/supabase');
const { roomFileUpload, deleteFromCloudinary } = require('../lib/cloudinary');
const { validateRoomToken } = require('../middleware/auth');

// GET /api/room-messages/:token — fetch all messages in a room
// Both owner and guest can fetch (guest's token is the auth)
router.get('/:token', validateRoomToken, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('room_messages')
      .select('*')
      .eq('room_id', req.room.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/room-messages/:token — guest sends text or file
router.post('/:token', validateRoomToken, roomFileUpload.single('file'), async (req, res, next) => {
  try {
    const { message_text } = req.body;
    const hasFile = !!req.file;
    const hasText = !!message_text?.trim();

    if (!hasFile && !hasText) {
      return res.status(400).json({ error: 'Must send a file or a message' });
    }

    const payload = {
      room_id: req.room.id,
      sender_type: 'guest',
      message_text: hasText ? message_text.trim() : null,
      cloudinary_url: hasFile ? req.file.path : null,
      cloudinary_public_id: hasFile ? req.file.filename : null,
      file_name: hasFile ? req.file.originalname : null,
      mime_type: hasFile ? req.file.mimetype : null,
      size_bytes: hasFile ? (req.file.size || 0) : null,
    };

    const { data, error } = await supabase
      .from('room_messages')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    // Broadcast to room via Socket.IO (owner gets notified in real-time)
    const io = req.app.get('io');
    io.to(`room:${req.room.token}`).emit('message:new', data);

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/room-messages/:token/:messageId — owner deletes a message
router.delete('/:token/:messageId', validateRoomToken, async (req, res, next) => {
  try {
    const { data: msg, error: fetchError } = await supabase
      .from('room_messages')
      .select('*')
      .eq('id', req.params.messageId)
      .eq('room_id', req.room.id)
      .single();

    if (fetchError || !msg) return res.status(404).json({ error: 'Message not found' });

    if (msg.cloudinary_public_id) {
      const isImage = msg.mime_type?.startsWith('image/');
      await deleteFromCloudinary(msg.cloudinary_public_id, isImage ? 'image' : 'raw');
    }

    const { error } = await supabase
      .from('room_messages')
      .delete()
      .eq('id', req.params.messageId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
