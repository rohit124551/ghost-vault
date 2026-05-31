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


    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });
}

module.exports = { initSocket };
