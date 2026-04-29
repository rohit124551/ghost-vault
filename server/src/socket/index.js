function initSocket(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // Guest or owner joins a room channel
    socket.on('join:room', ({ token }) => {
      if (!token || typeof token !== 'string') return;
      socket.join(`room:${token}`);
      console.log(`[Socket] ${socket.id} joined room:${token}`);
    });

    // Owner joins their personal channel
    socket.on('join:owner', ({ userId }) => {
      if (!userId) return;
      socket.join(`owner:${userId}`);
      console.log(`[Socket] Owner ${userId} joined`);
    });

    // Real-time message relay (text only — file messages go via REST)
    // The REST endpoint emits new_message after saving to DB.
    // This handler is kept for direct socket sends if needed.
    socket.on('send_message', async ({ token, sender, content, type = 'text' }) => {
      if (!token || !sender || !content) return;
      // Relay immediately to all in room (REST handler already saves to DB)
      io.to(`room:${token}`).emit('new_message', {
        id: Date.now().toString(),
        sender,
        type,
        content,
        created_at: new Date().toISOString(),
        roomToken: token,
      });
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });
}

module.exports = { initSocket };
