const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { screenshotUpload, deleteFromCloudinary } = require('../lib/cloudinary');
const { requireOwner } = require('../middleware/auth');

// GET /api/screenshots — list all owner screenshots
router.get('/', requireOwner, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('screenshots')
      .select('*')
      .eq('owner_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/screenshots — upload a new screenshot (multipart)
router.post('/', requireOwner, screenshotUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const name = req.body.name || `Screenshot ${new Date().toLocaleString()}`;

    const { data, error } = await supabase
      .from('screenshots')
      .insert({
        owner_id: req.user.id,
        name,
        cloudinary_url: req.file.path,
        cloudinary_public_id: req.file.filename,
        size_bytes: req.file.size || 0,
        mime_type: req.file.mimetype || 'image/png',
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/screenshots/:id — rename screenshot
router.patch('/:id', requireOwner, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const { data, error } = await supabase
      .from('screenshots')
      .update({ name })
      .eq('id', req.params.id)
      .eq('owner_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/screenshots/:id — delete screenshot + remove from Cloudinary
router.delete('/:id', requireOwner, async (req, res, next) => {
  try {
    // Fetch the record first to get the public_id
    const { data: screenshot, error: fetchError } = await supabase
      .from('screenshots')
      .select('*')
      .eq('id', req.params.id)
      .eq('owner_id', req.user.id)
      .single();

    if (fetchError || !screenshot) {
      return res.status(404).json({ error: 'Screenshot not found' });
    }

    // Remove from Cloudinary immediately
    await deleteFromCloudinary(screenshot.cloudinary_public_id, 'image');

    // Remove from DB
    const { error: deleteError } = await supabase
      .from('screenshots')
      .delete()
      .eq('id', req.params.id)
      .eq('owner_id', req.user.id);

    if (deleteError) throw deleteError;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
