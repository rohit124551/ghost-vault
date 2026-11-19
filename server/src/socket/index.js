const supabase = require('../lib/supabase');
const { guestsCanAccess, resolveOwner } = require('../lib/roomAccess');

function initSocket(io) {
  io.on('connection', socket => {
    const opposite = role => role === 'owner' ? 'guest' : 'owner';
    function isTyping(token, role) {
      const members = io.sockets.adapter.rooms.get('room:' + token + ':' + role + 's') || [];
      for (const id of members) {
        const data = io.sockets.sockets.get(id)?.data;
        if (data?.active === token && data.typing) return true;
      }
      return false;
    }
    function setTyping(typing) {
      const {active: token, role} = socket.data;
      if (!token || socket.data.typing === typing) return;
      const before = isTyping(token, role);
      socket.data.typing = typing;
      const after = isTyping(token, role);
      if (before === after) return;
      const members = io.sockets.adapter.rooms.get('room:' + token + ':' + opposite(role) + 's') || [];
      for (const id of members) {
        const peer = io.sockets.sockets.get(id);
        if (peer?.data.active === token) peer.emit('peer_typing', {token, typing: after});
      }
    }
    function closeChat() {
      clearTimeout(socket.data.typingTimer);
      setTyping(false);
      socket.data.active = null;
    }
    socket.on('chat_open', token => {
      if (typeof token !== 'string') return;
      const role = socket.rooms.has('room:' + token + ':owners') ? 'owner' : 'guest';
      if (!socket.rooms.has('room:' + token + ':' + role + 's')) return;
      if (socket.data.active !== token) closeChat();
      Object.assign(socket.data, {active: token, role});
      if (isTyping(token, opposite(role))) socket.emit('peer_typing', {token, typing:true});
    });
    socket.on('chat_close', token => { if (socket.data.active === token) closeChat(); });
    for (const event of ['typing_start', 'typing_stop']) socket.on(event, token => {
      const {active, role} = socket.data;
      if (!active || active !== token || !socket.rooms.has('room:' + token + ':' + role + 's')) return;
      clearTimeout(socket.data.typingTimer);
      const typing = event === 'typing_start';
      setTyping(typing);
      // Allow a heartbeat to arrive late and recover if a stop event goes missing.
      if (typing) socket.data.typingTimer = setTimeout(() => setTyping(false), 9000);
    });
    socket.on('disconnecting', closeChat);
    socket.on('join:room', async ({ token, accessToken, asOwner } = {}, acknowledge) => {
      const respond = result => { if (typeof acknowledge === 'function') acknowledge(result); };
      if (!token || typeof token !== 'string') return respond({ ok: false });
      try {
        const owner = await resolveOwner(supabase, accessToken);
        if (asOwner && !owner) return respond({ok:false});
        const { data: room, error } = await supabase.from('rooms').select('*').eq('token', token).single();
        if (error || !room || (!owner && !guestsCanAccess(room))) return respond({ ok: false });
        const channel = `room:${token}:${owner ? 'owners' : 'guests'}`;
        await socket.join(channel);
        if (!owner) {
          const { data: current } = await supabase.from('rooms').select('*').eq('token', token).single();
          if (!guestsCanAccess(current)) { await socket.leave(channel); return respond({ ok: false }); }
        } else {
          let expiresAt = 0;
          try { expiresAt = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()).exp * 1000; } catch { /* reject malformed expiry */ }
          if (!expiresAt || expiresAt <= Date.now()) { await socket.leave(channel); return respond({ ok: false }); }
          clearTimeout(socket.data.authExpiry);
          socket.data.authExpiry = setTimeout(() => socket.disconnect(true), Math.min(expiresAt - Date.now(), 2147483647));
        }
        socket.emit('chat_joined', token);
        respond({ ok: true });
      } catch { respond({ ok: false }); }
    });
    socket.on('disconnect', () => clearTimeout(socket.data.authExpiry));
  });
}
module.exports = { initSocket };
