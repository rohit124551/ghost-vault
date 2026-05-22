/**
 * POST /api/bugs       — submit a bug report (public, no auth required)
 * GET  /api/bugs       — view all bug reports (owner only)
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const supabase = require('../lib/supabase');
const requireOwner = require('../middleware/requireOwner');

// Local fallback file (used if Supabase table doesn't exist yet)
const BUGS_FILE = path.join(__dirname, '../data/bugs.json');

function ensureBugsFile() {
  const dir = path.dirname(BUGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(BUGS_FILE)) fs.writeFileSync(BUGS_FILE, '[]', 'utf-8');
}

function readLocalBugs() {
  try {
    ensureBugsFile();
    return JSON.parse(fs.readFileSync(BUGS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeLocalBug(report) {
  try {
    ensureBugsFile();
    const bugs = readLocalBugs();
    bugs.push({ ...report, id: `local-${Date.now()}`, source: 'local_file', created_at: new Date().toISOString() });
    fs.writeFileSync(BUGS_FILE, JSON.stringify(bugs, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[Bugs] Failed to write local fallback:', err.message);
    return false;
  }
}

// POST /api/bugs — submit a bug report (no auth needed)
router.post('/', async (req, res, next) => {
  try {
    const { description, email, page, role } = req.body;

    if (!description || description.trim().length < 5) {
      return res.status(400).json({ error: 'Description is too short.' });
    }

    const report = {
      description: description.trim(),
      email: email?.trim() || null,
      page: page || 'unknown',
      role: role || 'guest',
      user_agent: req.headers['user-agent'] || null,
    };

    // Attempt Supabase insert
    try {
      const { data, error } = await supabase
        .from('bug_reports')
        .insert(report)
        .select()
        .single();

      if (error) {
        // Table likely doesn't exist yet — fall back to local file
        console.warn('[Bugs] Supabase insert failed (table missing?), using local fallback:', error.message);
        const saved = writeLocalBug(report);
        if (!saved) throw new Error('Both Supabase and local fallback failed.');
        return res.status(201).json({ success: true, stored: 'local' });
      }

      res.status(201).json({ success: true, stored: 'supabase', id: data.id });
    } catch (dbErr) {
      // Supabase threw — fall back to local file
      console.warn('[Bugs] Supabase threw, using local fallback:', dbErr.message);
      const saved = writeLocalBug(report);
      if (!saved) throw new Error('All storage mechanisms failed.');
      res.status(201).json({ success: true, stored: 'local' });
    }
  } catch (err) {
    next(err);
  }
});

// GET /api/bugs — admin view: merges Supabase + local file reports (owner only)
router.get('/', requireOwner, async (_req, res, next) => {
  try {
    let supabaseBugs = [];
    try {
      const { data, error } = await supabase
        .from('bug_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        supabaseBugs = data.map(b => ({ ...b, source: 'supabase' }));
      }
    } catch { /* table might not exist */ }

    const localBugs = readLocalBugs();

    // Merge, de-duplicate by description+created_at
    const all = [...supabaseBugs, ...localBugs].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    res.json({ total: all.length, reports: all });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/bugs/:id — delete a bug report (owner only)
router.delete('/:id', requireOwner, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id.startsWith('local-')) {
      // Delete from local file
      let bugs = readLocalBugs();
      const initialLength = bugs.length;
      bugs = bugs.filter(b => b.id !== id);
      
      if (bugs.length === initialLength) {
        return res.status(404).json({ error: 'Local bug report not found.' });
      }
      
      fs.writeFileSync(BUGS_FILE, JSON.stringify(bugs, null, 2), 'utf-8');
      return res.json({ success: true, deleted: 'local' });
    } else {
      // Delete from Supabase
      const { error } = await supabase
        .from('bug_reports')
        .delete()
        .eq('id', id);

      if (error) {
        throw new Error('Failed to delete from Supabase: ' + error.message);
      }

      return res.json({ success: true, deleted: 'supabase' });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
