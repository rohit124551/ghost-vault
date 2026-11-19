const supabase = require('../lib/supabase');
const { guestsCanAccess, resolveOwner } = require('../lib/roomAccess');

function initSocket(io) {
  io.on('connection', socket => {
    socket.on('join:room', async ({ token, accessToken } = {}, acknowledge) => {
      const respond = result => { if (typeof acknowledge === 'function') acknowledge(result); };
      if (!token || typeof token !== 'string') return respond({ ok: false });
      try {
        const owner = await resolveOwner(supabase, accessToken);
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
        respond({ ok: true });
      } catch { respond({ ok: false }); }
    });
    socket.on('disconnect', () => clearTimeout(socket.data.authExpiry));
  });
}
module.exports = { initSocket };
