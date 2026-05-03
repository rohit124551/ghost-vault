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
  const [note,      setNote]      = useState(null);
  const [timeLeft,  setTimeLeft]  = useState(null);

  // Validate token + load history
  useEffect(() => {
    axios.get(`${API_URL}/api/rooms/${token}/valid`)
      .then(async res => {
        if (!res.data.valid) {
          return navigate('/404', { replace: true });
        }
        
        setStatus('valid');
        setExpiresAt(res.data.expiresAt);
        setNote(res.data.note);

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
    if (status !== 'valid') return;
    
    const check = () => {
      if (!expiresAt) {
        setTimeLeft('Infinite');
        return;
      }
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        navigate('/404', { replace: true });
        return;
      }
      const s = Math.floor(ms / 1000);
      if (s < 60) setTimeLeft(`${s}s`);
      else {
        const m = Math.floor(s / 60);
        if (m < 60) setTimeLeft(`${m}m ${s % 60}s`);
        else setTimeLeft(`${Math.floor(m / 60)}h ${m % 60}m`);
      }
    };
    
    check();
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
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
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
      setMessages(prev => {
        if (prev.some(m => m.id === res.data.id)) return prev;
        return [...prev, res.data];
      });
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
      setMessages(prev => {
        if (prev.some(m => m.id === res.data.id)) return prev;
        return [...prev, res.data];
      });
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
            
            {timeLeft && (
              <div style={{ marginRight: '8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontFamily: 'monospace', color: timeLeft === 'Infinite' ? 'var(--text-ghost)' : 'var(--accent)' }}>
                <Timer size={12} /> {timeLeft}
              </div>
            )}
            
            <div className="guest-token-badge">
              Room <span className="mono">{token}</span>
            </div>
            <div className="guest-status">
              <span className="guest-status-dot" /> Live
            </div>
          </div>
        </div>

        {note && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-base)', backgroundColor: 'var(--bg-card)', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)', marginRight: '8px' }}>Purpose:</strong> 
            {note}
          </div>
        )}

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
