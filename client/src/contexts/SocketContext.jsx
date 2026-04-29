import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      setConnected(true);
      // If user is owner, join owner channel for cross-room notifications
      if (user?.id) {
        socket.emit('join:owner', { userId: user.id });
      }
    });

    socket.on('disconnect', () => setConnected(false));

    socketRef.current = socket;
    return () => socket.disconnect();
  }, [user?.id]);

  const joinRoom = (token) => {
    socketRef.current?.emit('join:room', { token });
  };

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, joinRoom }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
