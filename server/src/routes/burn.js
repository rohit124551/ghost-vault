const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { deleteFromCloudinary } = require('../lib/cloudinary');
const axios = require('axios'); // We need axios or fetch to download from Cloudinary

// GET /api/burn/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Fetch the record from DB
    const { data: upload, error } = await supabase
      .from('uploads')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !upload) {
      return res.status(404).json({ error: 'This message has already self-destructed or does not exist.' });
    }

    // Ensure it's a burn link
    if (upload.expires_at !== '1970-01-01T00:00:01+00:00' && upload.expires_at !== '1970-01-01T00:00:01.000Z') {
      return res.status(400).json({ error: 'Not a burn-after-reading link.' });
    }

    // 2. Fetch file content from Cloudinary
    let response;
    try {
      response = await axios.get(upload.cloudinary_url, { responseType: 'arraybuffer' });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to retrieve secure asset from cloud storage.' });
    }

    // 3. Delete from DB
    await supabase.from('uploads').delete().eq('id', id);

    // 4. Delete from Cloudinary
    // We don't await this so it happens in the background, making the response faster
    deleteFromCloudinary(upload.cloudinary_public_id, upload.file_type).catch(err => {
      console.error('Burn: Failed to delete from cloudinary', err);
    });

    // 5. Send file buffer to client
    // Set headers so the browser knows what it is
    res.set('Content-Type', upload.file_type || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${upload.file_name}"`);
    res.set('X-Original-File-Name', upload.file_name);
    
    return res.send(response.data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
