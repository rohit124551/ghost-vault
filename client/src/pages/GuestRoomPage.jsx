import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { Sun, Moon, Timer, Bug, Send, X, Mail } from 'lucide-react';
import { io } from 'socket.io-client';
import axios from 'axios';
import ChatWindow from '../components/ChatWindow';
import './GuestRoomPage.css';

const API_URL    = import.meta.env.VITE_API_URL    || 'http://localhost:4000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

/* ── Bug Report Modal (guest version) ── */
function BugReportModal({ token, onClose }) {
  const [description, setDescription] = useState('');
  const [email, setEmail]             = useState('');
  const [status, setStatus]           = useState('idle'); // idle | sending | success | error
  const [errMsg, setErrMsg]           = useState('');

  const handleSubmit = async () => {
    if (description.trim().length < 10) {
      setErrMsg('Please describe the bug in at least 10 characters.');
      return;
    }
    setStatus('sending');
    setErrMsg('');
    try {
      await axios.post(`${API_URL}/api/bugs`, {
        description: description.trim(),
        email: email.trim() || null,
        page: `guest-room/${token}`,
        role: 'guest',
      });
      setStatus('success');
    } catch (err) {
      setErrMsg(err?.response?.data?.error || 'Failed to submit report. Please try again.');
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10000] p-4 animate-fadeIn" onClick={onClose}>
      <div 
        className="w-full max-w-[420px] bg-bgCard border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-borderBase">
          <div className="flex items-center gap-2">
            <span className="text-xl">🐞</span>
            <h2 className="font-display text-lg font-bold text-textPrimary tracking-tight m-0">Report a Bug</h2>
          </div>
          <button className="w-8 h-8 flex items-center justify-center rounded-md bg-bgBase border border-borderBase text-textGhost hover:bg-danger/10 hover:border-danger hover:text-danger transition-colors" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {status === 'success' ? (
          <div className="flex flex-col items-center text-center p-8 gap-3">
            <div className="text-4xl">✅</div>
            <h3 className="font-display text-xl font-bold text-textPrimary m-0">Report Submitted!</h3>
            <p className="text-sm text-textSecondary max-w-[300px] m-0 leading-relaxed">Thank you for helping us improve. Our team will look into it.</p>
            <p className="text-sm text-textSecondary mt-2">
              Need direct help? Email us at{' '}
              <a href="mailto:support@rohitkumarranjan.in" className="text-cyan-500 font-semibold hover:underline">support@rohitkumarranjan.in</a>
            </p>
            <button className="mt-4 px-6 py-2 bg-accent hover:bg-accentHover text-white font-bold rounded-md transition-colors" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 p-5">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-textSecondary uppercase tracking-widest font-mono">
                  Describe the Bug <span className="text-danger">*</span>
                </label>
                <textarea
                  className="w-full min-h-[90px] p-3 bg-bgBase border border-borderBase rounded-xl text-textPrimary text-sm font-ui transition-colors focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 resize-y placeholder-textGhost"
                  placeholder="What happened? What were you doing when the bug occurred?"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  disabled={status === 'sending'}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-textSecondary uppercase tracking-widest font-mono flex items-center">
                  <Mail size={11} className="mr-1 inline-block" />
                  Your Email <span className="normal-case tracking-normal font-normal text-textGhost ml-1">(Optional)</span>
                </label>
                <input
                  className="w-full p-3 bg-bgBase border border-borderBase rounded-xl text-textPrimary text-sm font-ui transition-colors focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 placeholder-textGhost"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={status === 'sending'}
                />
              </div>

              {errMsg && <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-[13px] text-danger">{errMsg}</div>}

              <div className="flex items-center gap-2 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-[12.5px] text-textSecondary">
                <span>💬</span>
                <span>For urgent help, email <a href="mailto:support@rohitkumarranjan.in" className="text-cyan-500 font-semibold hover:underline">support@rohitkumarranjan.in</a></span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t border-borderBase">
              <button className="px-4 py-2 text-textGhost hover:text-textPrimary transition-colors text-sm font-medium" onClick={onClose} disabled={status === 'sending'}>
                Cancel
              </button>
              <button
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-br from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white rounded-md text-sm font-medium transition-all disabled:opacity-50"
                onClick={handleSubmit}
                disabled={status === 'sending' || !description.trim()}
              >
                {status === 'sending'
                  ? <><span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Sending…</>
                  : <><Send size={12} /> Submit Report</>
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function GuestRoomPage() {
  const { token } = useParams();
  const navigate  = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [status,      setStatus]      = useState('loading'); // loading | valid | revoked | expired
  const [messages,    setMessages]    = useState([]);
  const [chatLoad,    setChatLoad]    = useState(false);
  const [socket,      setSocket]      = useState(null);
  const [expiresAt,   setExpiresAt]   = useState(null);
  const [note,        setNote]        = useState(null);
  const [timeLeft,    setTimeLeft]    = useState(null);
  const [showBugModal, setShowBugModal] = useState(false);

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

    s.on('message_deleted', ({ id }) => {
      setMessages(prev => prev.filter(m => m.id !== id));
    });

    s.on('message_reacted', ({ messageId, reactions }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
    });

    s.on('room_updated', ({ expiresAt: newExpiry, note: newNote, isActive }) => {
      if (newExpiry !== undefined) setExpiresAt(newExpiry);
      if (newNote !== undefined) setNote(newNote);
      if (isActive === false) navigate('/404', { replace: true });
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

  const handleReact = async (msgId, emoji, forceRemove) => {
    if (status !== 'valid') return;
    const guestId = localStorage.getItem('ghostvault_guest_id') || 'guest';
    try {
      await axios.post(`${API_URL}/api/rooms/${token}/messages/${msgId}/react`, {
        emoji,
        userId: guestId,
        forceRemove
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
            onReact={handleReact}
            onDelete={null}
            canDelete={false}
            loading={chatLoad}
            myRole="guest"
            disabled={status !== 'valid'}
          />
        </div>

        <div className="guest-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <p style={{ margin: 0 }}>This session is temporary. Data will vanish when revoked.</p>
          <button
            className="md:hidden flex items-center justify-center w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500 hover:text-white transition-colors"
            onClick={() => setShowBugModal(true)}
            title="Report a bug"
            aria-label="Report a Bug"
          >
            <Bug size={12} />
          </button>
        </div>
      </div>

      {/* ── Floating Bug Report Button ── */}
      <button
        className="hidden md:flex fixed bottom-6 right-6 w-[48px] h-[48px] rounded-full bg-gradient-to-br from-purple-600 to-pink-500 border border-white/15 text-white items-center justify-center cursor-pointer z-[8000] shadow-[0_8px_24px_rgba(124,58,237,0.5),0_0_0_4px_rgba(124,58,237,0.15)] hover:scale-110 hover:-translate-y-1 transition-all"
        onClick={() => setShowBugModal(true)}
        title="Report a bug"
        aria-label="Report a Bug"
      >
        <Bug size={20} />
      </button>

      {/* ── Bug Report Modal ── */}
      {showBugModal && (
        <BugReportModal token={token} onClose={() => setShowBugModal(false)} />
      )}
    </div>
  );
}
