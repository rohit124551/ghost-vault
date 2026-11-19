const supabase = require('./supabase');
const { guestsCanAccess } = require('./roomAccess');

async function broadcastRoomEvent(io, token, event, payload) {
  io.to(`room:${token}:owners`).emit(event, payload);
  // Recheck access at delivery time: a previously joined guest is not enough.
  const { data: room, error } = await supabase.from('rooms').select('*').eq('token', token).single();
  if (!error && guestsCanAccess(room)) io.to(`room:${token}:guests`).emit(event, payload);
}

function closeGuestAccess(io, token) {
  const channel = `room:${token}:guests`;
  io.to(channel).emit('room_revoked', { token });
  io.in(channel).socketsLeave(channel);
}

module.exports = { broadcastRoomEvent, closeGuestAccess };
