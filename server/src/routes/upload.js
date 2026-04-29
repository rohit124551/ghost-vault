/**
 * POST /api/upload
 * Unified upload route — works for both owner (direct) and guest (via room token)
 * body: multipart/form-data { file, fileName, roomToken? }
 * returns: { url, fileName, id }
 */
const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { screenshotUpload, roomFileUpload, deleteFromCloudinary } = require('../lib/cloudinary');

// Decide multer storage based on whether roomToken is present
function uploadMiddleware(req, res, next) {
  // Read roomToken from body (multipart, so we peek at field before file)
  // Use a two-pass approach: use a raw upload and detect after
  const storage = req.headers['x-room-token'] ? roomFileUpload : screenshotUpload;
  storage.single('file')(req, res, next);
}

// POST /api/upload — unified upload (owner + guest)
router.post('/', (req, res, next) => {
  // Check x-room-token header to decide storage folder
  const hasRoom = !!req.headers['x-room-token'];
  const upload = hasRoom ? roomFileUpload : screenshotUpload;
  upload.single('file')(req, res, async (err) => {
    if (err) return next(err);
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const roomToken = req.headers['x-room-token'];
      const fileName = req.body.fileName || req.file.originalname;

      // Parse expires_at if provided (owner can set expiry)
      let expiresAt = null;
      if (req.body.expiresIn) {
        const minutes = parseInt(req.body.expiresIn, 10);
        if (!isNaN(minutes) && minutes > 0) {
          expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
        }
      }

      // Get owner user from JWT if present
      let ownerId = null;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const { data: { user } } = await supabase.auth.getUser(token);
        ownerId = user?.id || null;
      }

      // Get room_id from token if guest upload
      let roomId = null;
      if (roomToken) {
        const { data: room } = await supabase
          .from('rooms')
          .select('id, view_once')
          .eq('token', roomToken)
          .eq('is_active', true)
          .single();

        if (!room) return res.status(410).json({ error: 'Room not found or inactive' });
        roomId = room.id;

        // Handle view_once: deactivate room after first file received
        if (room.view_once) {
          await supabase.from('rooms').update({ is_active: false }).eq('id', roomId);
        }
      }

      // Save to uploads table
      const { data: upload, error } = await supabase
        .from('uploads')
        .insert({
          owner_id: ownerId,
          room_id: roomId,
          file_name: fileName,
          cloudinary_url: req.file.path,
          cloudinary_public_id: req.file.filename,
          file_type: req.file.mimetype,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (error) throw error;

      // Emit Socket.IO event if guest upload (notify owner)
      if (roomToken) {
        const io = req.app.get('io');
        io.to(`room:${roomToken}`).emit('new_file', {
          ...upload,
          roomToken,
        });

        // If view_once, also emit room_revoked
        if (roomId) {
          const { data: room } = await supabase.from('rooms').select('view_once').eq('id', roomId).single();
          if (room?.view_once) {
            io.to(`room:${roomToken}`).emit('room_revoked', { token: roomToken });
          }
        }
      }

      res.status(201).json({
        url: upload.cloudinary_url,
        fileName: upload.file_name,
        id: upload.id,
        expiresAt: upload.expires_at,
      });
    } catch (err) {
      next(err);
    }
  });
});

module.exports = router;
