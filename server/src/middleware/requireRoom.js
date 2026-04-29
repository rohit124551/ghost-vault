const supabase = require('../lib/supabase');

/**
 * requireRoom — validates :token param against rooms table.
 * Attaches req.room to the room row if valid.
 */
async function requireRoom(req, res, next) {
  const token = req.params.token || req.body?.roomToken;
  if (!token) return res.status(400).json({ error: 'Missing room token' });

  const { data: room, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('token', token)
    .eq('is_active', true)
    .single();

  if (error || !room) {
    return res.status(404).json({ valid: false, error: 'Room not found or inactive' });
  }

  // Check expiry
  if (room.expires_at && new Date(room.expires_at) < new Date()) {
    // Auto-deactivate expired room
    await supabase.from('rooms').update({ is_active: false }).eq('token', token);
    return res.status(410).json({ valid: false, error: 'Room has expired' });
  }

  req.room = room;
  next();
}

module.exports = requireRoom;
