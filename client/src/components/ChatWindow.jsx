import { useEffect, useRef, useState } from 'react';
import { Send, Paperclip, Download, X, Image as ImageIcon, File } from 'lucide-react';
import './ChatWindow.css';

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

function MessageBubble({ msg, myRole, onDelete, canDelete }) {
  const [imgExpanded, setImgExpanded] = useState(false);
  const isMe = msg.sender === myRole;

  return (
    <div className={`bubble-row ${isMe ? 'bubble-row--right' : 'bubble-row--left'}`}>
      {/* Avatar (others only, left side) */}
      {!isMe && (
        <div className="bubble-avatar" style={{ background: getAvatarColor(msg.sender) }}>
          {msg.sender === 'owner' ? 'O' : 'G'}
        </div>
      )}

      <div className={`bubble ${isMe ? 'bubble--owner' : 'bubble--guest'}`}>
        {/* Sender label */}
        <div className="bubble-meta">
          <span className="bubble-sender">{isMe ? 'You' : (msg.sender === 'owner' ? 'Owner' : 'Guest')}</span>
          <span className="bubble-time">{formatTime(msg.created_at)}</span>
          {canDelete && (
            <button className="bubble-delete" onClick={() => onDelete(msg.id)}>
              <X size={10} />
            </button>
          )}
        </div>

        {/* Content */}
        {msg.type === 'text' && (
          <p className="bubble-text">{linkify(msg.content)}</p>
        )}

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

        {msg.type === 'file' && (
          <div className="bubble-file">
            <File size={16} className="bubble-file-icon" />
            <div className="bubble-file-info">
              <span className="bubble-file-name">{msg.file_name}</span>
              {msg.file_size && (
                <span className="bubble-file-size">{(msg.file_size / 1024).toFixed(1)} KB</span>
              )}
            </div>
            <a href={msg.file_url} download={msg.file_name} className="bubble-file-dl">
              <Download size={13} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ChatWindow — reusable two-way chat component.
 * Props:
 *   messages[]        — array of message objects from API
 *   onSendText(text)  — callback to send a text message
 *   onSendFile(file)  — callback to send a file
 *   onDelete(id)      — callback to delete a message (owner only)
 *   canDelete         — boolean (true for owner)
 *   loading           — boolean
 *   myRole            - 'owner' or 'guest'
 */
export default function ChatWindow({ messages, onSendText, onSendFile, onDelete, canDelete, loading, myRole = 'owner' }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    await onSendText(text.trim());
    setText('');
    setSending(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setSending(true);
    await onSendFile(f);
    e.target.value = '';
    setSending(false);
  };

  return (
    <div className="chat-window">
      {/* Message thread */}
      <div className="chat-thread">
        {loading ? (
          <div className="chat-empty">
            <div className="spinner" />
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <p className="text-xs" style={{ color: '#444' }}>No messages yet</p>
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

      {/* Input bar */}
      <div className="chat-input-bar">
        <button
          className="chat-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
        >
          <Paperclip size={16} />
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFile} style={{ display: 'none' }} />
        <textarea
          className="chat-input"
          placeholder="Type a message…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          disabled={sending}
        />
        <button
          className={`chat-send-btn ${text.trim() ? 'chat-send-btn--active' : ''}`}
          onClick={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Send size={15} />}
        </button>
      </div>
    </div>
  );
}
