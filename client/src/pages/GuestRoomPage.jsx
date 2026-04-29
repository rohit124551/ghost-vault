import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from 'axios';
import ChatWindow from '../components/ChatWindow';
import './GuestRoomPage.css';

const API_URL    = import.meta.env.VITE_API_URL    || 'http://localhost:4000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

export default function GuestRoomPage() {
  const { token } = useParams();
  const navigate  = useNavigate();

  const [status,   setStatus]   = useState('loading'); // loading | valid | revoked
  const [messages, setMessages] = useState([]);
  const [chatLoad, setChatLoad] = useState(false);
  const [socket,   setSocket]   = useState(null);

  // Validate token + load history
  useEffect(() => {
    axios.get(`${API_URL}/api/rooms/${token}/valid`)
      .then(async res => {
        if (!res.data.valid) return navigate('/404', { replace: true });
        setStatus('valid');

        // Load message history
        setChatLoad(true);
        try {
          const hist = await axios.get(`${API_URL}/api/rooms/${token}/messages`);
          setMessages(hist.data || []);
        } catch { /* ignore */ }
        finally { setChatLoad(false); }
      })
      .catch(() => navigate('/404', { replace: true }));
  }, [token, navigate]);

  // Socket.IO
  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ['websocket'] });
    setSocket(s);
    s.emit('join:room', { token });

    s.on('new_message', (msg) => {
      if (msg.roomToken === token || msg.room_token === token) {
        setMessages(prev => [...prev, msg]);
      }
    });

    s.on('room_revoked', () => {
      setStatus('revoked');
    });

    return () => s.disconnect();
  }, [token]);

  // Guest sends text
  const handleSendText = async (text) => {
    try {
      const res = await axios.post(`${API_URL}/api/rooms/${token}/messages/text`, {
        content: text,
        sender: 'guest',
      });
      setMessages(prev => [...prev, res.data]);
    } catch { /* toast not available without import, silently fail */ }
  };

  // Guest sends file
  const handleSendFile = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('sender', 'guest');
    fd.append('fileName', file.name);
    try {
      const res = await axios.post(`${API_URL}/api/rooms/${token}/messages/file`, fd);
      setMessages(prev => [...prev, res.data]);
    } catch { /* silently fail */ }
  };

  if (status === 'loading') {
    return (
      <div className="guest-root guest-center">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (status === 'revoked') {
    return (
      <div className="guest-root guest-center">
        <div className="guest-revoked">
          <div className="guest-revoked-icon">🔒</div>
          <h1>Link revoked</h1>
          <p>This sharing link has been closed by the owner.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="guest-root">
      {/* Minimal header — no branding, no nav */}
      <div className="guest-header">
        <span className="guest-token-label">
          Room <span className="token-text">{token}</span>
        </span>
        <span className="guest-status">
          <span className="active-dot" /> Live
        </span>
      </div>

      {/* Full-height chat */}
      <div className="guest-chat">
        <ChatWindow
          messages={messages}
          onSendText={handleSendText}
          onSendFile={handleSendFile}
          onDelete={null}
          canDelete={false}
          loading={chatLoad}
        />
      </div>
    </div>
  );
}
