import { useEffect, useRef, useState } from 'react';
import { Send, Paperclip, Download, X, File, ChevronDown, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import './ChatWindow.css';

/* ── Helpers ── */
const AVATAR_COLORS = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#22c55e','#06b6d4'];

function getAvatarColor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part)
      ? <a key={i} href={part} target="_blank" rel="noreferrer" className="chat-link">{part}</a>
      : part
  );
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/* ── Message Bubble ── */
function MessageBubble({ msg, myRole, onDelete, canDelete }) {
  const [imgExpanded, setImgExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isMe = msg.sender === myRole;


  const handleCopy = () => {
    const contentToCopy = (msg.type === 'image' || msg.type === 'file') ? msg.file_url : msg.content;
    navigator.clipboard.writeText(contentToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copied to clipboard', { id: 'copy-toast' });
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2000);
    } else {
      onDelete(msg.id);
      setConfirmDelete(false);
    }
  };




  return (
    <div className={`bubble-row ${isMe ? 'bubble-row--right' : 'bubble-row--left'}`}>
      {/* Avatar — shown for other person only */}
      {!isMe && (
        <div className="bubble-avatar" style={{ background: getAvatarColor(msg.sender) }}>
          {msg.sender === 'owner' ? 'O' : 'G'}
        </div>
      )}

      <div className={`bubble ${isMe ? 'bubble--mine' : 'bubble--theirs'}`}>
        {/* Sender + actions row */}
        <div className="bubble-meta">
          <span className="bubble-sender">
            {isMe ? 'You' : msg.sender === 'owner' ? 'Owner' : 'Guest'}
          </span>
          <div className="bubble-actions">
            <button className={`bubble-action ${copied ? 'text-success' : ''}`} onClick={handleCopy} title="Copy Link">
              {copied ? <Check size={10} /> : <Copy size={10} />}
            </button>
            {canDelete && isMe && (
              <button 
                className={`bubble-action bubble-action--delete ${confirmDelete ? 'bubble-action--confirm' : ''}`} 
                onClick={handleDelete} 
                title={confirmDelete ? 'Confirm Delete?' : 'Delete'}
              >
                <X size={10} />
              </button>
            )}
          </div>
        </div>


        {/* ── Text ── */}
        {msg.type === 'text' && (
          <p className="bubble-text">{linkify(msg.content)}</p>
        )}

        {/* ── Image ── */}
        {msg.type === 'image' && (
          <>
            <img
              src={msg.file_url}
              alt={msg.file_name}
              className="bubble-img"
              onClick={() => setImgExpanded(true)}
              loading="lazy"
            />
            {imgExpanded && (
              <div className="lightbox" onClick={() => setImgExpanded(false)}>
                <img src={msg.file_url} alt={msg.file_name} className="lightbox-img" />
              </div>
            )}
          </>
        )}

        {/* ── File ── */}
        {msg.type === 'file' && (
          <div className="bubble-file">
            <File size={15} className="bubble-file-icon" />
            <div className="bubble-file-info">
              <span className="bubble-file-name">{msg.file_name}</span>
              {msg.file_size && (
                <span className="bubble-file-size">{(msg.file_size / 1024).toFixed(1)} KB</span>
              )}
            </div>
            <a href={msg.file_url} download={msg.file_name} className="bubble-file-dl" title="Download">
              <Download size={13} />
            </a>
          </div>
        )}

        <span className="bubble-time-float">{formatTime(msg.created_at)}</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   ChatWindow
   Props:
   - messages[]         array of message objects
   - onSendText(text)   callback
   - onSendFile(file)   callback
   - onDelete(id)       callback (owner only)
   - canDelete          boolean
   - loading            boolean
   - myRole             'owner' | 'guest'
   - disabled           boolean (if room is expired/revoked)
   ══════════════════════════════════════════════ */
export default function ChatWindow({
  messages, onSendText, onSendFile,
  onDelete, canDelete, loading,
  myRole = 'owner', disabled = false
}) {
  const [text, setText]       = useState('');
  const [sending, setSending] = useState(false);
  const [filePreview, setFilePreview] = useState(null); // { file, name }
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const scrollRef   = useRef(null);
  const threadRef   = useRef(null);
  const fileInputRef = useRef(null);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollBtn(!isAtBottom);
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  };


  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || sending || disabled) return;
    setSending(true);
    await onSendText(text.trim());
    setText('');
    setSending(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleFileSelect = (e) => {
    if (disabled) return;
    const f = e.target.files?.[0];
    if (!f) return;
    setFilePreview({ file: f, name: f.name });
    e.target.value = '';
  };

  const handleFileSend = async () => {
    if (!filePreview || sending || disabled) return;
    setSending(true);
    await onSendFile(filePreview.file);
    setFilePreview(null);
    setSending(false);
  };

  return (
    <div className="chat-window" style={{ position: 'relative' }}>
      <AnimatePresence initial={false}>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="chat-scroll-bottom"
            onClick={scrollToBottom}
          >
            <ChevronDown size={18} strokeWidth={3} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Message thread ── */}
      <div className="chat-thread" ref={threadRef} onScroll={handleScroll}>

        {loading ? (
          <div className="chat-empty"><div className="spinner" /></div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" style={{ color:'var(--text-ghost)', marginBottom:8 }}>
              <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10A8 8 0 0 0 12 2z"/>
              <circle cx="9" cy="10" r="1" fill="currentColor"/>
              <circle cx="15" cy="10" r="1" fill="currentColor"/>
            </svg>
            <p style={{ fontSize:12, color:'var(--text-ghost)' }}>No messages yet</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble
              key={msg.id || i}
              msg={msg}
              myRole={myRole}
              onDelete={onDelete}
              canDelete={canDelete}
            />
          ))
        )}
        <div ref={scrollRef} />
      </div>

      {/* ── File preview chip ── */}
      {filePreview && !disabled && (
        <div className="chat-file-preview">
          <File size={13} />
          <span className="chat-file-preview-name">{filePreview.name}</span>
          <button className="chat-file-preview-remove" onClick={() => setFilePreview(null)}>
            <X size={11} />
          </button>
          <button
            className="btn btn-primary btn-sm chat-file-send-btn"
            onClick={handleFileSend}
            disabled={sending}
          >
            {sending ? <span className="spinner" style={{width:12,height:12}} /> : 'Send'}
          </button>
        </div>
      )}

      {/* ── Input bar ── */}
      {disabled ? (
        <div className="chat-bar chat-bar--disabled">
          <div className="chat-disabled-notice">
            <X size={14} style={{ opacity: 0.7 }} />
            <span>Chat expired/revoked</span>
          </div>
        </div>
      ) : (
        <div className="chat-bar">
          <div className="chat-input-wrapper">
            <button
              className="chat-attach"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
              disabled={sending}
            >
              <Paperclip size={16} />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <textarea
              className="chat-input"
              placeholder="Message..."
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              disabled={sending}
            />
            <button
              className={`chat-send ${text.trim() ? 'chat-send--active' : ''}`}
              onClick={handleSend}
              disabled={!text.trim() || sending}
              title="Send"
            >
              {sending
                ? <span className="spinner" style={{width:14,height:14}} />
                : <Send size={14} />
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
