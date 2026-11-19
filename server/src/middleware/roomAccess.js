const supabase = require('../lib/supabase');
const { guestsCanAccess, resolveOwner } = require('../lib/roomAccess');

// Applied before uploads and to every message read/write, including reactions.
async function roomAccess(req, res, next) {
  try {
    const token = req.params.token || req.headers['x-room-token'];
    const { data: room, error } = await supabase.from('rooms').select('*').eq('token', token).single();
    if (error || !room) return res.status(404).json({ error: 'Chat unavailable' });
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    req.owner = await resolveOwner(supabase, bearer);
    req.room = room;
    if (!req.owner && !guestsCanAccess(room)) return res.status(404).json({ error: 'Chat unavailable' });
    // A token for one shared chat must never grant access to another chat's message IDs.
    const id = req.path.split('/').filter(Boolean)[0];
    if (id && id !== 'text' && id !== 'file') {
      const { data: message, error: messageError } = await supabase.from('messages')
        .select('id').eq('id', id).eq('room_id', room.id).single();
      if (messageError || !message) return res.status(404).json({ error: 'Message not found' });
    }
    next();
  } catch (error) { next(error); }
}
module.exports = roomAccess;
