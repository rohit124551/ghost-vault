import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { Sun, Moon, Timer, Lock } from 'lucide-react';
import { io } from 'socket.io-client';
import axios from 'axios';
import ChatWindow from '../components/ChatWindow';
import './GuestRoomPage.css';

const API_URL    = import.meta.env.VITE_API_URL    || 'http://localhost:4000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

export default function GuestRoomPage() {
  const { token } = useParams();
  const navigate  = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [status,    setStatus]    = useState('loading'); // loading | valid | revoked | expired
  const [messages,  setMessages]  = useState([]);
  const [chatLoad,  setChatLoad]  = useState(false);
  const [socket,    setSocket]    = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);

  // Validate token + load history
  useEffect(() => {
    axios.get(`${API_URL}/api/rooms/${token}/valid`)
      .then(async res => {
        if (!res.data.valid) {
          return navigate('/404', { replace: true });
        }
        
        setStatus('valid');
        setExpiresAt(res.data.expiresAt);

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

  // Real-time expiry timer
  useEffect(() => {
    if (!expiresAt || status !== 'valid') return;
    
    const check = () => {
      if (new Date(expiresAt) < new Date()) {
        navigate('/404', { replace: true });
      }
    };
    
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [expiresAt, status, navigate]);

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
      navigate('/404', { replace: true });
    });

    return () => s.disconnect();
  }, [token, navigate]);

  // Guest sends text
  const handleSendText = async (text) => {
    if (status !== 'valid') return;
    try {
      const res = await axios.post(`${API_URL}/api/rooms/${token}/messages/text`, {
        content: text,
        sender: 'guest',
      });
      setMessages(prev => [...prev, res.data]);
    } catch { /* silently fail */ }
  };

  // Guest sends file
  const handleSendFile = async (file) => {
    if (status !== 'valid') return;
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

  return (
    <div className="guest-root">
      <div className="guest-vault-container">
        {/* ── Branded Header ── */}
        <div className="guest-navbar">
          <div className="guest-brand">
            <span className="ghost-icon">👻</span>
            <span className="guest-logo">GhostVault</span>
          </div>
          <div className="guest-header-meta">
            <button 
              className="btn btn-ghost btn-icon btn-sm" 
              onClick={toggleTheme}
              style={{ marginRight: '8px' }}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <div className="guest-token-badge">
              Room <span className="mono">{token}</span>
            </div>
            <div className="guest-status">
              <span className="guest-status-dot" /> Live
            </div>
          </div>
        </div>

        {/* ── Chat Container ── */}
        <div className="guest-chat-wrapper">
          <ChatWindow
            messages={messages}
            onSendText={handleSendText}
            onSendFile={handleSendFile}
            onDelete={null}
            canDelete={false}
            loading={chatLoad}
            myRole="guest"
            disabled={status !== 'valid'}
          />
        </div>

        <div className="guest-footer">
          <p>This session is temporary. Data will vanish when revoked.</p>
        </div>
      </div>
    </div>
  );
}
