const supabase = require('../lib/supabase');

/**
 * requireOwner — validates Supabase JWT from Authorization header.
 * Attaches req.user = { id, email }
 */
async function requireOwner(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const token = authHeader.split(' ')[1];

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = { id: user.id, email: user.email };
  next();
}

/**
 * validateRoomToken — validates token param against Supabase rooms table.
 * Used for guest-accessible room endpoints.
 * Attaches req.room = room row
 */
async function validateRoomToken(req, res, next) {
  const { token } = req.params;
  if (!token) return res.status(400).json({ error: 'Missing room token' });

  const { data: room, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('token', token)
    .single();

  if (error || !room) return res.status(404).json({ error: 'Room not found' });
  if (room.revoked) return res.status(410).json({ error: 'Room has been revoked' });
  if (room.expires_at && new Date(room.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Room has expired' });
  }

  req.room = room;
  next();
}

module.exports = { requireOwner, validateRoomToken };
