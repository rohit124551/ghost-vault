const supabase = require('../lib/supabase');
const { isConfiguredOwner } = require('../lib/roomAccess');

const OWNER_EMAIL = process.env.OWNER_EMAIL;

/**
 * requireOwner — validates Supabase JWT + enforces owner email lock.
 * Attaches req.user = { id, email }
 */
async function requireOwner(req, res, next) {
  if (!OWNER_EMAIL) return res.status(503).json({ error: 'Configure OWNER_EMAIL before using this private workspace.' });
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Fix 4 — owner email lock: double-check at infrastructure level
  if (!isConfiguredOwner(user, OWNER_EMAIL)) {
    return res.status(403).json({ error: 'Access denied. This app is private.' });
  }

  req.user = { id: user.id, email: user.email };
  next();
}

module.exports = requireOwner;
