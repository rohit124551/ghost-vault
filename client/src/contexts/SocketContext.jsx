import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import supabase from '../lib/supabase';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user, session } = useAuth();
  const socketRef = useRef(null);
  const roomsRef = useRef(new Set());
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  const joinRoom = useCallback(async token => {
    roomsRef.current.add(token);
    const current = socketRef.current;
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token && current?.connected && current === socketRef.current) {
      current.emit('join:room', { token, asOwner: true, accessToken: data.session.access_token });
    }
  }, []);

  useEffect(() => {
    if (!user?.id) { roomsRef.current.clear(); setSocket(null); setConnected(false); return; }
    const current = io(import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000');
    socketRef.current = current;
    setSocket(current);
    current.on('connect', () => {
      setConnected(true);
      roomsRef.current.forEach(token => joinRoom(token));
    });
    current.on('disconnect', () => setConnected(false));
    return () => { current.removeAllListeners(); current.disconnect(); socketRef.current = null; };
  }, [user?.id, session?.access_token, joinRoom]);

  return <SocketContext.Provider value={{ socket, connected, joinRoom }}>{children}</SocketContext.Provider>;
}
export function useSocket() { return useContext(SocketContext); }
