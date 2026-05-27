/**
 * GET    /api/uploads         — list owner's uploads (owner only)
 * DELETE /api/uploads/:id     — delete upload + Cloudinary asset (owner only)
 */
const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { deleteFromCloudinary } = require('../lib/cloudinary');
const requireOwner = require('../middleware/requireOwner');

// GET /api/uploads — paginated list of owner uploads
router.get('/', requireOwner, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('uploads')
      .select('*', { count: 'exact' })
      .eq('owner_id', req.user.id)
      .is('room_id', null) // owner direct uploads only
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    res.json({ uploads: data, total: count, page, limit });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/uploads/:id — delete upload record + Cloudinary asset
router.delete('/:id', requireOwner, async (req, res, next) => {
  try {
    const { data: upload, error: fetchErr } = await supabase
      .from('uploads')
      .select('*')
      .eq('id', req.params.id)
      .eq('owner_id', req.user.id)
      .single();

    if (fetchErr || !upload) return res.status(404).json({ error: 'Upload not found' });

    // Delete from Cloudinary
    if (upload.cloudinary_public_id) {
      const isImage = upload.file_type?.startsWith('image/');
      await deleteFromCloudinary(upload.cloudinary_public_id, isImage ? 'image' : 'raw');
    }

    // Delete from DB
    const { error: delErr } = await supabase
      .from('uploads')
      .delete()
      .eq('id', req.params.id)
      .eq('owner_id', req.user.id);

    if (delErr) throw delErr;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/uploads/:id/public — get public details of an upload (for viewing assets)
router.get('/:id/public', async (req, res, next) => {
  try {
    const { data: upload, error } = await supabase
      .from('uploads')
      .select('id, file_name, file_type, cloudinary_url, expires_at')
      .eq('id', req.params.id)
      .single();

    if (error || !upload) return res.status(404).json({ error: 'Asset not found' });

    // Check expiration
    if (upload.expires_at) {
      // Don't serve burn after reading links from this route
      if (upload.expires_at === '1970-01-01T00:00:01+00:00' || upload.expires_at === '1970-01-01T00:00:01.000Z') {
        return res.status(403).json({ error: 'This is a burn-after-reading asset. Use the correct viewing mechanism.' });
      }
      
      const now = new Date();
      if (new Date(upload.expires_at) < now) {
        return res.status(410).json({ error: 'Asset has expired' });
      }
    }

    res.json(upload);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
