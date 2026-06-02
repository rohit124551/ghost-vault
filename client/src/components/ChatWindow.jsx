import { useEffect, useRef, useState } from 'react';
import { Send, Paperclip, Download, X, File, ChevronDown, Copy, Check, ZoomIn, ZoomOut, RotateCcw, Mic, Square, SmilePlus, Timer, EyeOff, Reply, Pin, PinOff } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import FullScreenImageViewer from './FullScreenImageViewer';
import { copyToClipboard } from '../utils/clipboard';
import { formatBytes } from '../utils/formatBytes';
import './ChatWindow.css';

/* ── Helpers ── */
const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4'];

function getAvatarColor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function parseInlineMarkdown(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part1, i1) => {
    if (urlRegex.test(part1)) {
      return <a key={`url-${i1}`} href={part1} target="_blank" rel="noreferrer" className="chat-link">{part1}</a>;
    }

    // Inline code
    const codeRegex = /`([^`]+)`/g;
    return part1.split(codeRegex).map((part2, i2) => {
      if (i2 % 2 === 1) return <code key={`code-${i1}-${i2}`} className="chat-inline-code">{part2}</code>;

      // Bold (handles **bold** or *bold*)
      const boldRegex = /\*{1,2}([^*]+)\*{1,2}/g;
      return part2.split(boldRegex).map((part3, i3) => {
        if (i3 % 2 === 1) return <strong key={`bold-${i1}-${i2}-${i3}`}>{part3}</strong>;

        // Italics
        const italicRegex = /_([^_]+)_/g;
        return part3.split(italicRegex).map((part4, i4) => {
          if (i4 % 2 === 1) return <em key={`italic-${i1}-${i2}-${i3}-${i4}`}>{part4}</em>;
          return part4;
        });
      });
    });
  });
}

function renderMessageText(text) {
  // Check for code blocks ```language ... ```
  const codeBlockRegex = /```([\w-]*)\n([\s\S]*?)```/g;

  const elements = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add preceding text (parsed for inline markdown)
    if (match.index > lastIndex) {
      const preceding = text.slice(lastIndex, match.index);
      elements.push(
        <span key={`text-${lastIndex}`}>{parseInlineMarkdown(preceding)}</span>
      );
    }

    // Add code block
    const language = match[1] || 'text';
    const code = match[2];
    elements.push(
      <div key={`code-${match.index}`} className="bubble-code-wrapper">
        <SyntaxHighlighter
          language={language}
          style={atomDark}
          customStyle={{
            margin: '4px 0',
            padding: '12px',
            borderRadius: '8px',
            fontSize: '13px',
            background: 'rgba(0,0,0,0.4)',
          }}
          wrapLines={true}
        >
          {code.trim()}
        </SyntaxHighlighter>
      </div>
    );

    lastIndex = codeBlockRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    elements.push(
      <span key={`text-${lastIndex}`}>{parseInlineMarkdown(text.slice(lastIndex))}</span>
    );
  }

  return elements;
}

// Helper to get lower res thumbnail
function getCloudinaryThumb(url) {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/c_limit,w_400/');
}

// Helper to get poster frame for video
function getCloudinaryPoster(url) {
  if (!url || !url.includes('cloudinary.com')) return url;
  // Replace extension with .jpg and add video thumbnail transformation
  return url.replace(/\.[^/.]+$/, '.jpg').replace('/upload/', '/upload/so_0/');
}

function getCloudinaryPdfThumb(url) {
  if (!url || !url.includes('cloudinary.com')) return url;
  // Replace extension with .jpg to get the first page image
  return url.replace(/\.[^/.]+$/, '.jpg').replace('/upload/', '/upload/c_limit,w_400,pg_1/');
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(ts) {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getFileTypeFromName(fileName) {
  if (!fileName) return 'unknown';
  const ext = fileName.split('.').pop().toLowerCase();
  if (fileName.startsWith('voice_note_')) return 'audio';
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  return 'generic';
}

/* ── Message Bubble ── */
function MessageBubble({ msg, myRole, onDelete, canDelete, onReact, onView, onBurn, onPin, guestId, onReply, messages }) {
  const [mediaExpanded, setMediaExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState('bottom');
  
  // Swipe to reply state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartRef = useRef(null);
  
  const menuRef = useRef(null);
  const isMe = msg.sender === myRole;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
        setShowEmojiPicker(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (msg.type === 'burned') return;
    if (msg.burn_after_seconds && msg.viewed_at) {
      const burnTime = new Date(msg.viewed_at).getTime() + (msg.burn_after_seconds * 1000);
      const updateTimer = () => {
        const now = new Date().getTime();
        const remaining = Math.ceil((burnTime - now) / 1000);
        if (remaining <= 0) {
          setTimeLeft(0);
          onBurn(msg.id); // Trigger burn API
        } else {
          setTimeLeft(remaining);
        }
      };
      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }
  }, [msg.burn_after_seconds, msg.viewed_at, msg.id, msg.type, onBurn]);

  const handleReactClick = (emoji, forceRemove = false) => {
    setShowEmojiPicker(false);
    onReact(msg.id, emoji, forceRemove);
  };

  const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];


  const handleCopy = () => {
    const contentToCopy = (msg.type === 'image' || msg.type === 'file') ? msg.file_url : msg.content;
    copyToClipboard(contentToCopy, 'Message copied');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Force download even for cross-origin (Cloudinary) URLs
  const handleDownload = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const url = msg.file_url;
    const filename = msg.file_name || 'download';
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch {
      // Fallback: open in new tab if fetch fails (e.g. CORS)
      window.open(url, '_blank', 'noreferrer');
    }
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




  // if (timeLeft === 0) return null; // Removed so we can render the tombstone

  const handleTouchStart = (e) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchMove = (e) => {
    if (!touchStartRef.current || !onReply) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartRef.current.x;
    const diffY = currentY - touchStartRef.current.y;
    
    // Only process horizontal swipe if it's more significant than vertical scroll
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
      // For both mine and theirs, we can swipe left or right, let's say always swipe right to reply, or left to reply.
      // WhatsApp standard: swipe right to reply to any message.
      if (diffX > 0 && diffX < 80) {
        setSwipeOffset(diffX);
      }
    }
  };

  const handleTouchEnd = () => {
    if (swipeOffset > 50 && onReply) {
      onReply(msg);
    }
    setSwipeOffset(0);
    touchStartRef.current = null;
  };

  const isBurned = msg.type === 'burned' || timeLeft === 0;
  const isBlurred = !isMe && msg.burn_after_seconds && !msg.viewed_at && !isBurned;

  return (
    <div 
      id={`msg-${msg.id}`} 
      className={`bubble-row ${isMe ? 'bubble-row--right' : 'bubble-row--left'}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ transform: swipeOffset > 0 ? `translateX(${swipeOffset}px)` : 'none', transition: touchStartRef.current ? 'none' : 'transform 0.2s ease-out' }}
    >
      {/* Swipe Reply Icon Indicator */}
      {swipeOffset > 20 && (
        <div className="absolute left-[-40px] top-1/2 -translate-y-1/2 flex items-center justify-center bg-black/20 text-white rounded-full w-8 h-8 opacity-70" style={{ transform: `scale(${Math.min(1, swipeOffset / 50)})` }}>
          <Reply size={16} />
        </div>
      )}

      {/* Avatar — shown for other person only */}
      {!isMe && (
        <div className="bubble-avatar" style={{ background: getAvatarColor(msg.sender) }}>
          {msg.sender === 'owner' ? 'O' : 'G'}
        </div>
      )}
      <div 
        className={`bubble relative group ${isMe ? 'bubble--mine' : 'bubble--theirs'} ${isBlurred ? 'bubble--blurred' : ''} ${isBurned ? 'bubble--tombstone' : ''}`}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!isBurned) {
            const spaceBelow = window.innerHeight - e.clientY;
            setMenuPosition(spaceBelow < 250 ? 'top' : 'bottom');
            setMenuOpen(true);
          }
        }}
      >
        {msg.is_pinned && !isBurned && !isBlurred && (
          <div className="absolute -top-2 -left-2 bg-bgCard border border-cyan-500/30 rounded-full p-1 shadow-md z-10" title="Pinned">
            <Pin size={10} className="text-cyan-400" />
          </div>
        )}
        {!isBurned && !isBlurred && (
          <button 
            className="absolute top-1 right-1 opacity-100 md:opacity-0 group-hover:opacity-100 p-1 bg-black/20 hover:bg-black/40 text-white rounded-full transition-opacity z-10 backdrop-blur-sm"
            onClick={(e) => { 
              e.stopPropagation(); 
              const rect = e.currentTarget.getBoundingClientRect();
              const spaceBelow = window.innerHeight - rect.bottom;
              setMenuPosition(spaceBelow < 250 ? 'top' : 'bottom');
              setMenuOpen(true); 
            }}
            title="Options"
          >
            <ChevronDown size={14} />
          </button>
        )}

        {menuOpen && (
          <div 
            ref={menuRef} 
            className={`
              absolute z-50 min-w-[140px] rounded-xl
              ${menuPosition === 'top' ? 'bottom-full mb-2' : 'top-6'} 
              ${isMe ? 'right-2' : 'left-2'} 
              bg-bgCard border border-border shadow-[0_8px_30px_rgba(0,0,0,0.3)] 
              flex flex-col p-1
            `}
          >
            {(msg.type === 'image' || msg.type === 'file') && (
              <button className="flex items-center gap-3 px-3 py-2 hover:bg-bgHover rounded-lg text-sm text-textPrimary text-left transition-colors" onClick={(e) => { setMenuOpen(false); setShowEmojiPicker(false); handleDownload(e); }}>
                <Download size={15} className="text-textGhost" /> Download
              </button>
            )}
            {onReply && (
              <button className="flex items-center gap-3 px-3 py-2 hover:bg-bgHover rounded-lg text-sm text-textPrimary text-left transition-colors" onClick={() => { setMenuOpen(false); setShowEmojiPicker(false); onReply(msg); }}>
                <Reply size={15} className="text-textGhost" /> Reply
              </button>
            )}
            <button className="flex items-center gap-3 px-3 py-2 hover:bg-bgHover rounded-lg text-sm text-textPrimary text-left transition-colors" onClick={() => { setMenuOpen(false); setShowEmojiPicker(false); handleCopy(); }}>
              <Copy size={15} className="text-textGhost" /> Copy
            </button>
            
            <button 
              className="flex items-center gap-3 px-3 py-2 hover:bg-bgHover rounded-lg text-sm text-textPrimary text-left transition-colors relative"
              onClick={(e) => {
                e.stopPropagation();
                setShowEmojiPicker(!showEmojiPicker);
              }}
            >
              <SmilePlus size={15} className="text-textGhost" /> React
              {showEmojiPicker && (
                <div className={`absolute ${menuPosition === 'top' ? 'bottom-0' : 'top-0'} ${isMe ? 'right-[105%]' : 'left-[105%]'} bg-bgCard border border-border shadow-[0_8px_30px_rgba(0,0,0,0.3)] rounded-xl p-1.5 flex gap-1 z-50`}>
                  {QUICK_EMOJIS.map(e => (
                    <span key={e} className="cursor-pointer hover:bg-bgHover p-1.5 rounded-lg text-lg transition-transform hover:scale-110" onClick={(ev) => { ev.stopPropagation(); setMenuOpen(false); setShowEmojiPicker(false); handleReactClick(e); }}>{e}</span>
                  ))}
                </div>
              )}
            </button>
            <div className="h-[1px] bg-border my-1 mx-2" />
            <button
              className="flex items-center gap-3 px-3 py-2 hover:bg-bgHover rounded-lg text-sm text-textPrimary text-left transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                if (onPin) onPin(msg.id);
              }}
            >
              {msg.is_pinned ? <PinOff size={15} className="text-textGhost" /> : <Pin size={15} className="text-textGhost" />} 
              {msg.is_pinned ? 'Unpin' : 'Pin'}
            </button>

            {canDelete && myRole === 'owner' && (
              <>
                <div className="h-[1px] bg-border my-1 mx-2" />
                <button 
                  className="flex items-center gap-3 px-3 py-2 hover:bg-danger/10 rounded-lg text-sm text-danger text-left transition-colors" 
                  onClick={(e) => { 
                    e.stopPropagation();
                    if (!confirmDelete) {
                      setConfirmDelete(true);
                      setTimeout(() => setConfirmDelete(false), 2000);
                    } else {
                      setMenuOpen(false);
                      setShowEmojiPicker(false);
                      handleDelete(e);
                    }
                  }}
                >
                  <X size={15} /> {confirmDelete ? 'Confirm?' : 'Delete'}
                </button>
              </>
            )}
          </div>
        )}
        {/* Render Quoted Reply */}
        {msg.reply_to_id && messages && (
          (() => {
            const quotedMsg = messages.find(m => m.id === msg.reply_to_id);
            if (!quotedMsg) return null;
            return (
              <div 
                className="cursor-pointer opacity-80 border-l-2 border-cyan-400 pl-2 mb-2 bg-black/10 rounded-r text-xs p-1"
                onClick={() => {
                  // Optional: scroll to the quoted message
                  const el = document.getElementById(`msg-${quotedMsg.id}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                <div className="font-bold text-[10px] uppercase text-cyan-400 mb-0.5">
                  {quotedMsg.sender === myRole ? 'You' : quotedMsg.sender === 'owner' ? 'Owner' : 'Guest'}
                </div>
                <div className="truncate max-w-[200px] text-textSecondary">
                  {quotedMsg.type === 'text' ? quotedMsg.content : `[${quotedMsg.type}]`}
                </div>
              </div>
            );
          })()
        )}
        
        {/* Sender name only — no actions here anymore */}
        <div className="bubble-meta">
          <span className="bubble-sender">
            {isMe ? 'You' : msg.sender === 'owner' ? 'Owner' : 'Guest'}
          </span>
          {msg.burn_after_seconds && !isBurned && (
            <span className="bubble-timer-badge">
              <Timer size={10} />
              {msg.viewed_at ? (timeLeft !== null ? `${timeLeft}s` : '0s') : (isMe ? `Sent (${msg.burn_after_seconds}s)` : `${msg.burn_after_seconds}s`)}
            </span>
          )}
        </div>

        {isBurned ? (
          <div className="bubble-burned-content">
            <EyeOff size={16} className="opacity-50" />
            <span className="text-xs italic opacity-60">Viewed</span>
          </div>
        ) : isBlurred ? (
          <div className="bubble-burn-overlay" onClick={() => onView(msg.id)}>
            <EyeOff size={24} className="mb-2 opacity-80" />
            <span className="text-xs font-bold uppercase tracking-widest opacity-90">Tap to View</span>
            <span className="text-[10px] opacity-60 mt-1">Destructs in {msg.burn_after_seconds}s</span>
          </div>
        ) : (
          <>
            {/* ── Text ── */}
            {msg.type === 'text' && (
              <div className="bubble-text">{renderMessageText(msg.content)}</div>
            )}

            {/* ── Image ── */}
            {msg.type === 'image' && (
              <div className="bubble-img-wrapper">
                <img
                  src={getCloudinaryThumb(msg.file_url)}
                  alt={msg.file_name}
                  className="bubble-img"
                  onClick={() => setMediaExpanded(true)}
                  loading="lazy"
                />
                <a href={msg.file_url} className="bubble-img-dl" onClick={handleDownload} title="Download Image">
                  <Download size={14} />
                </a>
                {mediaExpanded && (
                  <FullScreenImageViewer
                    imageUrl={msg.file_url}
                    imageName={msg.file_name}
                    fileType="image"
                    onClose={() => setMediaExpanded(false)}
                  />
                )}
              </div>
            )}

            {/* ── Video / Audio / PDF ── */}
            {msg.type === 'file' && getFileTypeFromName(msg.file_name) === 'video' && (
              <div className="bubble-media-wrapper">
                <video
                  src={msg.file_url}
                  poster={getCloudinaryPoster(msg.file_url)}
                  controls
                  preload="none"
                  className="bubble-video"
                />
                <button className="bubble-expand-media-btn" onClick={() => setMediaExpanded(true)} title="Full Screen">
                  <ZoomIn size={14} />
                </button>
                {mediaExpanded && (
                  <FullScreenImageViewer
                    imageUrl={msg.file_url}
                    imageName={msg.file_name}
                    fileType="video"
                    onClose={() => setMediaExpanded(false)}
                  />
                )}
              </div>
            )}

            {msg.type === 'file' && getFileTypeFromName(msg.file_name) === 'audio' && (
              <div className="bubble-media-wrapper bubble-media-wrapper--audio">
                <audio src={msg.file_url} controls preload="none" className="bubble-audio" />
                <button className="bubble-expand-media-btn" onClick={() => setMediaExpanded(true)} title="Full Screen">
                  <ZoomIn size={14} />
                </button>
                {mediaExpanded && (
                  <FullScreenImageViewer
                    imageUrl={msg.file_url}
                    imageName={msg.file_name}
                    fileType="audio"
                    onClose={() => setMediaExpanded(false)}
                  />
                )}
              </div>
            )}

            {msg.type === 'file' && getFileTypeFromName(msg.file_name) === 'pdf' && (
              <div className="bubble-media-wrapper">
                <img 
                  src={getCloudinaryPdfThumb(msg.file_url)} 
                  alt={msg.file_name} 
                  className="bubble-img" 
                  onClick={() => setMediaExpanded(true)} 
                  loading="lazy" 
                  style={{ objectFit: 'contain', width: '100%', maxHeight: '200px', cursor: 'pointer', background: '#fff' }}
                />
                <div style={{ display: 'flex', width: '100%' }}>
                  <button onClick={() => setMediaExpanded(true)} className="bubble-pdf-open" style={{ borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                    Preview PDF
                  </button>
                  <a href={msg.file_url} target="_blank" rel="noreferrer" className="bubble-pdf-open" title="Open Full PDF">
                    Open Tab
                  </a>
                </div>
                {mediaExpanded && (
                  <FullScreenImageViewer
                    imageUrl={msg.file_url}
                    imageName={msg.file_name}
                    fileType="pdf"
                    onClose={() => setMediaExpanded(false)}
                  />
                )}
              </div>
            )}

            {/* ── Generic File ── */}
            {msg.type === 'file' && getFileTypeFromName(msg.file_name) === 'generic' && (
              <div className="bubble-file">
                <File size={15} className="bubble-file-icon" />
                <div className="bubble-file-info">
                  <span className="bubble-file-name">{msg.file_name}</span>
                  {msg.file_size && (
                    <span className="bubble-file-size">{formatBytes(msg.file_size)}</span>
                  )}
                </div>
                <button className="bubble-file-dl" onClick={handleDownload} title="Download">
                  <Download size={13} />
                </button>
              </div>
            )}
          </>
        )}

        <span className="bubble-time-float">{formatTime(msg.created_at)}</span>

        {/* ── Reactions ── */}
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <div className="bubble-reactions">
            {Object.entries(msg.reactions).map(([emoji, users]) => {
              const myId = myRole === 'owner' ? 'owner' : guestId;
              const iReacted = users.includes(myId);
              return (
                <div
                  key={emoji}
                  className={`bubble-reaction-badge ${iReacted ? 'bubble-reaction-badge--active' : ''}`}
                  onClick={() => handleReactClick(emoji)}
                >
                  <span className="emoji">{emoji}</span>
                  <span className="count">{users.length}</span>
                  {myRole === 'owner' && (
                    <button
                      className="reaction-force-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReactClick(emoji, true);
                      }}
                      title="Force Remove"
                    >
                      <X size={8} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
  onDelete, canDelete, onReact, onView, onBurn, onPin, loading,
  myRole = 'owner', disabled = false
}) {
  const [text, setText] = useState('');
  const [timerDuration, setTimerDuration] = useState(null); // null = off
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const [customTimerInput, setCustomTimerInput] = useState('');
  const [sending, setSending] = useState(false);
  const [filePreviews, setFilePreviews] = useState([]); // Array of { file, name }
  const [uploadProgress, setUploadProgress] = useState(null); // number 0-100 or null
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewHeight, setPreviewHeight] = useState(0);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [voiceNotePreview, setVoiceNotePreview] = useState(null);

  const [guestId] = useState(() => {
    let id = localStorage.getItem('ghostvault_guest_id');
    if (!id) {
      id = 'guest_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('ghostvault_guest_id', id);
    }
    return id;
  });
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const scrollRef = useRef(null);
  const threadRef = useRef(null);
  const fileInputRef = useRef(null);
  const previewRef = useRef(null);

  useEffect(() => {
    if (previewRef.current) {
      setPreviewHeight(previewRef.current.offsetHeight);
    } else {
      setPreviewHeight(0);
    }
  }, [filePreviews]);

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

  // Voice Note Handlers
  const startRecording = async () => {
    if (disabled || sending) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        try {
          // Use Blob and attach a name property to avoid 'new File' constructor crashes on older/mobile browsers
          const audioFile = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          audioFile.name = `voice_note_${Date.now()}.webm`;

          stream.getTracks().forEach(track => track.stop());

          if (audioFile.size === 0) {
            toast.error("Recording failed (empty audio).");
            return;
          }

          const url = URL.createObjectURL(audioFile);
          setVoiceNotePreview({ file: audioFile, url });
        } catch (err) {
          console.error("Voice note error:", err);
          toast.error("Failed to process voice note.");
        }
      };

      // Pass a timeslice of 200ms to ensure ondataavailable fires reliably across all browsers
      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error(err);
      toast.error('Microphone access denied or unavailable');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null; // Prevent saving
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      setIsRecording(false);
      clearInterval(timerRef.current);
      toast('Recording cancelled', { icon: '🗑️' });
    }
  };

  const formatRecordingTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSend = async () => {
    if (sending || disabled) return;

    if (voiceNotePreview) {
      setSending(true);
      setUploadProgress(0);
      await onSendFile(voiceNotePreview.file, timerDuration, replyingTo?.id, (e) => {
        if (e.total) {
          setUploadProgress(Math.round((e.loaded * 100) / e.total));
        }
      });
      setUploadProgress(null);
      URL.revokeObjectURL(voiceNotePreview.url);
      setVoiceNotePreview(null);
      setTimerDuration(null);
      setReplyingTo(null);
      setSending(false);
      return;
    }

    if (!text.trim() && filePreviews.length === 0) return;
    setSending(true);

    try {
      if (filePreviews.length > 0) {
        for (const p of filePreviews) {
          setUploadProgress(0);
          await onSendFile(p.file, timerDuration, replyingTo?.id, (e) => {
            if (e.total) {
              setUploadProgress(Math.round((e.loaded * 100) / e.total));
            }
          });
          setUploadProgress(null);
          setFilePreviews(prev => prev.slice(1));
        }
      }
      if (text.trim()) {
        await onSendText(text.trim(), timerDuration, replyingTo?.id);
        setText('');
      }
      setTimerDuration(null);
      setReplyingTo(null);
    } catch (err) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.shiftKey) {
        if (e.ctrlKey) {
          e.preventDefault();
          const cursor = e.target.selectionStart;
          const newValue = text.slice(0, cursor) + '\n' + text.slice(e.target.selectionEnd);
          setText(newValue);
          setTimeout(() => {
            e.target.selectionStart = cursor + 1;
            e.target.selectionEnd = cursor + 1;
          }, 0);
        }
        return;
      }
      e.preventDefault();
      if ((filePreviews.length > 0 || text.trim()) && !sending) {
        handleSend();
      }
    }
  };

  const handlePaste = (e) => {
    if (disabled) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const newFiles = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1 || items[i].type.indexOf('video') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          newFiles.push({ file, name: file.name || `Pasted_Media_${Date.now()}_${i}.${file.type.split('/')[1]}` });
        }
      }
    }
    if (newFiles.length > 0) {
      setFilePreviews(prev => [...prev, ...newFiles]);
      e.preventDefault();
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files).map(f => ({ file: f, name: f.name }));
      setFilePreviews(prev => [...prev, ...droppedFiles]);
    }
  };

  const handleFileSelect = (e) => {
    if (disabled) return;
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const selectedFiles = files.map(f => ({ file: f, name: f.name }));
    setFilePreviews(prev => [...prev, ...selectedFiles]);
    e.target.value = '';
  };

  const removeFile = (index) => {
    setFilePreviews(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div
      className={`chat-window ${isDragging ? 'chat-window--dragging' : ''}`}
      style={{ position: 'relative' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="chat-drag-overlay">
          <div className="chat-drag-content">
            <Download size={32} />
            <p style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>Drop media to share</p>
          </div>
        </div>
      )}
      <AnimatePresence initial={false}>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="chat-scroll-bottom"
            style={{ bottom: 85 + previewHeight }}
            onClick={scrollToBottom}
          >
            <ChevronDown size={18} strokeWidth={3} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Pinned Message Banner ── */}
      {(() => {
        const pinnedMsg = messages?.slice().reverse().find(m => m.is_pinned);
        if (!pinnedMsg) return null;
        return (
          <div 
            className="chat-pinned-banner"
            onClick={() => {
              // Optionally scroll to message
              const el = document.getElementById(`msg-${pinnedMsg.id}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          >
            <div className="chat-pinned-icon">
              <Pin size={14} className="text-cyan-400" />
            </div>
            <div className="chat-pinned-content">
              <span className="chat-pinned-title">Pinned Message</span>
              <span className="chat-pinned-text truncate">{pinnedMsg.content || 'Attached file...'}</span>
            </div>
            {onPin && (
              <button 
                className="chat-pinned-close" 
                onClick={(e) => { e.stopPropagation(); onPin(pinnedMsg.id); }}
                title="Unpin"
              >
                <X size={14} />
              </button>
            )}
          </div>
        );
      })()}

      {/* ── Message thread ── */}
      <div className="chat-thread" ref={threadRef} onScroll={handleScroll}>

        {loading ? (
          <div className="chat-empty"><div className="spinner" /></div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" style={{ color: 'var(--text-ghost)', marginBottom: 8 }}>
              <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10A8 8 0 0 0 12 2z" />
              <circle cx="9" cy="10" r="1" fill="currentColor" />
              <circle cx="15" cy="10" r="1" fill="currentColor" />
            </svg>
            <p style={{ fontSize: 12, color: 'var(--text-ghost)' }}>No messages yet</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const prevMsg = i > 0 ? messages[i - 1] : null;
            let showDate = false;
            if (!prevMsg) {
              showDate = true;
            } else {
              const currentDate = new Date(msg.created_at).toDateString();
              const prevDate = new Date(prevMsg.created_at).toDateString();
              if (currentDate !== prevDate) {
                showDate = true;
              }
            }

            return (
              <div key={msg.id || i} id={`msg-${msg.id}`} style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                {showDate && (
                  <div className="chat-date-separator">
                    <span>{formatDateSeparator(msg.created_at)}</span>
                  </div>
                )}
                <MessageBubble
                  msg={msg}
                  myRole={myRole}
                  onDelete={onDelete}
                  canDelete={canDelete}
                  onReact={onReact}
                  onView={onView}
                  onBurn={onBurn}
                  onPin={onPin}
                  guestId={guestId}
                  onReply={setReplyingTo}
                  messages={messages}
                />
              </div>
            );
          })
        )}
        <div ref={scrollRef} />
      </div>

      {filePreviews.length > 0 && !disabled && (
        <div className="chat-previews-container" ref={previewRef}>
          <div className="chat-previews-list">
            {filePreviews.map((p, idx) => (
              <div key={idx} className="chat-file-chip relative overflow-hidden flex items-center pr-2">
                <File size={13} className="z-10 relative shrink-0" />
                <span className="chat-file-chip-name z-10 relative truncate flex-1">{p.name}</span>
                {sending && uploadProgress !== null && idx === 0 ? (
                  <span className="z-10 relative text-[10px] font-bold text-cyan-400 bg-[#0f172a] px-1.5 py-0.5 rounded shadow-sm shrink-0 ml-2">
                    {uploadProgress}%
                  </span>
                ) : (
                  <button className="chat-file-chip-remove z-10 relative shrink-0 ml-2" onClick={() => removeFile(idx)} disabled={sending}>
                    <X size={11} />
                  </button>
                )}
                {sending && uploadProgress !== null && idx === 0 && (
                  <div className="absolute left-0 top-0 bottom-0 bg-cyan-500/20 z-0 pointer-events-none" style={{ width: `${uploadProgress}%`, transition: 'width 0.2s' }}></div>
                )}
              </div>
            ))}
          </div>
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
        <div className="chat-bar flex-col items-stretch">
          {replyingTo && (
            <div className="flex items-center justify-between px-3 py-2 bg-black/10 border-b border-borderBase/50 rounded-t-xl mb-[-4px] z-10 mx-2">
              <div className="flex items-center gap-2 min-w-0">
                <Reply size={14} className="text-cyan-400 shrink-0" />
                <div className="text-xs truncate">
                  <span className="font-bold text-cyan-400 mr-2">Replying to {replyingTo.sender === myRole ? 'yourself' : replyingTo.sender === 'owner' ? 'Owner' : 'Guest'}:</span>
                  <span className="text-textSecondary">{replyingTo.type === 'text' ? replyingTo.content : `[${replyingTo.type}]`}</span>
                </div>
              </div>
              <button 
                onClick={() => setReplyingTo(null)}
                className="p-1 hover:bg-white/10 rounded-full text-textGhost hover:text-white transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div className="chat-input-wrapper z-20">
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
              multiple
              style={{ display: 'none' }}
            />
            <textarea
              className="chat-input"
              placeholder="Message..."
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKey}
              onPaste={handlePaste}
              rows={1}
              disabled={sending || isRecording || voiceNotePreview}
              style={{ display: (isRecording || voiceNotePreview) ? 'none' : 'block' }}
            />
            {isRecording && (
              <div className="chat-recording-indicator">
                <div className="recording-dot"></div>
                <span className="recording-time">{formatRecordingTime(recordingTime)}</span>
                <button className="chat-cancel-record" onClick={cancelRecording}>Cancel</button>
              </div>
            )}
            {voiceNotePreview && (
              <div className="chat-recording-indicator" style={{ gap: '8px' }}>
                <audio src={voiceNotePreview.url} controls className="bubble-audio" style={{ height: '32px', flex: 1, minWidth: 0 }} />
                <button className="chat-cancel-record" style={{ color: 'var(--danger)' }} onClick={() => {
                  URL.revokeObjectURL(voiceNotePreview.url);
                  setVoiceNotePreview(null);
                }}>
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="relative">
              <button
                className={`chat-timer-toggle ${timerDuration ? 'chat-timer-toggle--active' : ''}`}
                onClick={() => setShowTimerPicker(!showTimerPicker)}
                title="Self-Destruct Timer"
                disabled={sending}
              >
                <Timer size={16} />
                {timerDuration && (
                  <span className="chat-timer-badge">
                    {timerDuration < 60 ? `${timerDuration}s` : timerDuration < 3600 ? `${Math.floor(timerDuration / 60)}m` : `${Math.floor(timerDuration / 3600)}h`}
                  </span>
                )}
              </button>
              {showTimerPicker && (
                <div className="chat-timer-picker">
                  <div className="text-[10px] uppercase font-bold text-textGhost mb-2 tracking-widest">Self Destruct</div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button className={`btn btn-sm ${timerDuration === null ? 'btn-primary' : 'bg-bgBase border border-borderBase text-textSecondary'}`} onClick={() => { setTimerDuration(null); setShowTimerPicker(false); }}>Off</button>
                    <button className={`btn btn-sm ${timerDuration === 10 ? 'btn-primary' : 'bg-bgBase border border-borderBase text-textSecondary'}`} onClick={() => { setTimerDuration(10); setShowTimerPicker(false); }}>10s</button>
                    <button className={`btn btn-sm ${timerDuration === 60 ? 'btn-primary' : 'bg-bgBase border border-borderBase text-textSecondary'}`} onClick={() => { setTimerDuration(60); setShowTimerPicker(false); }}>1m</button>
                    <button className={`btn btn-sm ${timerDuration === 3600 ? 'btn-primary' : 'bg-bgBase border border-borderBase text-textSecondary'}`} onClick={() => { setTimerDuration(3600); setShowTimerPicker(false); }}>1h</button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Custom (s)"
                      className="flex-1 bg-bgBase border border-borderBase rounded-md text-xs px-2 py-1 outline-none focus:border-cyan-500 text-textPrimary font-mono w-20"
                      value={customTimerInput}
                      onChange={(e) => setCustomTimerInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customTimerInput) {
                          setTimerDuration(parseInt(customTimerInput) || null);
                          setShowTimerPicker(false);
                        }
                      }}
                    />
                    <button
                      className="btn btn-primary btn-sm px-3"
                      onClick={() => {
                        if (customTimerInput) setTimerDuration(parseInt(customTimerInput) || null);
                        setShowTimerPicker(false);
                      }}
                    >
                      Set
                    </button>
                  </div>
                </div>
              )}
            </div>

            {text.trim() || filePreviews.length > 0 || voiceNotePreview ? (
              <button
                className="chat-send chat-send--active"
                onClick={handleSend}
                disabled={sending}
                title="Send"
              >
                {sending ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Send size={14} />}
              </button>
            ) : isRecording ? (
              <button
                className="chat-send chat-record chat-record--active"
                onClick={stopRecording}
                title="Stop & Attach"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                className="chat-send chat-record"
                onClick={startRecording}
                disabled={sending}
                title="Record Voice Note"
              >
                <Mic size={16} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
