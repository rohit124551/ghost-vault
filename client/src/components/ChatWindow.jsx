import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Send, Paperclip, Download, X, File, ChevronDown, Copy, Check, CheckSquare, ZoomIn, ZoomOut, RotateCcw, Mic, Square, SmilePlus, Timer, EyeOff, Reply, Pin, PinOff, Clock, Trash2 } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import FullScreenImageViewer from './FullScreenImageViewer';
import { copyToClipboard } from '../utils/clipboard';
import { formatBytes } from '../utils/formatBytes';
import { createChatScrollController } from '../utils/chatScroll';
import './ChatWindow.css';
import { useConfirmAction } from '../hooks/useConfirmAction';

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
    if (/^https?:\/\/[^\s]+$/.test(part1)) {
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

/* ── Ingest Event Parsing & Card Component ── */
const CATEGORY_STYLES = {
  bug:       { label: 'Bug Report',     icon: '🐛', border: '#ef4444', bg: 'rgba(239, 68, 68, 0.14)',  color: '#f87171' },
  feedback:  { label: 'User Feedback',  icon: '💡', border: '#06b6d4', bg: 'rgba(6, 182, 212, 0.14)',  color: '#38bdf8' },
  feature:   { label: 'Feature Update', icon: '🚀', border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.14)', color: '#c084fc' },
  telemetry: { label: 'Log / Metric',   icon: '📊', border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.14)', color: '#fbbf24' },
  general:   { label: 'Event',          icon: '📡', border: '#10b981', bg: 'rgba(16, 185, 129, 0.14)', color: '#34d399' },
};

function tryParseApiEvent(content) {
  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();

  // 1. Native JSON format
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        const cat = parsed.category || (parsed.status === 'error' ? 'bug' : 'general');
        if (parsed._type === 'api_event' && parsed.data) {
          return { ...parsed, category: cat };
        }
        return {
          _type: 'api_event',
          slug: parsed.slug || 'API',
          category: cat,
          title: parsed.title || parsed.endpoint || 'Inbound Event',
          status: parsed.status || (cat === 'bug' ? 'error' : 'normal'),
          data: parsed.data || parsed,
        };
      }
    } catch { /* proceed to markdown check */ }
  }

  // 2. Backward compatibility: Parse Markdown format (e.g. 📡 **[PORTFOLIO] Inbound Event** ...)
  if (trimmed.startsWith('📡') || trimmed.includes('Inbound Event')) {
    const slugMatch = trimmed.match(/\[(.*?)\]/);
    const slug = slugMatch ? slugMatch[1] : 'API';
    const data = {};
    const lines = trimmed.split('\n');
    let title = `Inbound Event: ${slug}`;
    let category = 'general';

    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine || cleanLine.startsWith('📡')) continue;

      if (cleanLine.startsWith('>')) {
        title = cleanLine.replace(/^>\s*/, '');
        continue;
      }

      const fieldMatch = cleanLine.match(/^\*\*(.*?):\*\*\s*(.*)$/);
      if (fieldMatch) {
        const key = fieldMatch[1];
        let val = fieldMatch[2];
        if (val.startsWith('`') && val.endsWith('`')) val = val.slice(1, -1);
        data[key] = val;
        if (key.toLowerCase() === 'category') category = val.toLowerCase();
      }
    }

    if (Object.keys(data).length > 0) {
      return {
        _type: 'api_event',
        slug,
        category,
        title,
        status: category === 'bug' ? 'error' : 'normal',
        data,
      };
    }
  }

  return null;
}

function ApiEventCard({ event, createdAt }) {
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const { slug, title, status, category = 'general', data } = event;
  const isError = status === 'error' || category === 'bug';
  const isWarn = status === 'warning';

  const catKey = (category || 'general').toLowerCase();
  const catInfo = CATEGORY_STYLES[catKey] || {
    label: catKey.toUpperCase(),
    icon: '🏷️',
    border: '#10b981',
    bg: 'rgba(16, 185, 129, 0.14)',
    color: '#34d399',
  };

  const borderColor = isError ? '#ef4444' : catInfo.border;
  const statusBadgeBg = isError ? 'rgba(239, 68, 68, 0.15)' : isWarn ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)';
  const statusBadgeColor = isError ? '#f87171' : isWarn ? '#fbbf24' : '#34d399';

  const entries = Object.entries(data || {}).filter(([k]) => !['timestamp', 'time', 'date', 'created_at', 'category', 'type', '_type'].includes(k.toLowerCase()));

  const formatLabel = (k) => {
    const ACRONYMS = { ip: 'IP', url: 'URL', uri: 'URI', id: 'ID', api: 'API', cpu: 'CPU', ram: 'RAM', os: 'OS', ttl: 'TTL', fk: 'FK', ui: 'UI', db: 'DB' };
    return String(k)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim()
      .split(/\s+/)
      .map(w => ACRONYMS[w.toLowerCase()] || (w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ');
  };

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  const dateObj = createdAt ? new Date(createdAt) : new Date();
  const timeFormatted = dateObj.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  const dateFormatted = dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="api-event-card" style={{ borderLeftColor: borderColor }}>
      {/* Title Bar */}
      <div className="api-event-header">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* Category Badge */}
          <span 
            className="api-event-category-badge"
            style={{ background: catInfo.bg, color: catInfo.color, borderColor: `${catInfo.border}44` }}
          >
            <span>{catInfo.icon}</span>
            <span>{catInfo.label}</span>
          </span>
          <span className="api-event-title">{title || `Inbound Event: ${slug}`}</span>
          {status && status !== 'normal' && (
            <span className="api-event-badge" style={{ background: statusBadgeBg, color: statusBadgeColor }}>
              {status.toUpperCase()}
            </span>
          )}
        </div>
        <button 
          onClick={handleCopy} 
          className="api-event-copy-btn"
          title="Copy raw JSON payload"
        >
          {copiedRaw ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
          <span>{copiedRaw ? 'Copied' : 'JSON'}</span>
        </button>
      </div>

      {/* Grid of Fields (Multi-column like reference Discord image) */}
      <div className="api-event-grid">
        {entries.map(([k, v]) => {
          const valStr = typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v);
          const isFullWidth = valStr.length > 40 || valStr.includes('\n') || ['query', 'search_query', 'message', 'description', 'product_name', 'page_uri', 'error', 'stack', 'details'].includes(k.toLowerCase());

          return (
            <div key={k} className={`api-event-field ${isFullWidth ? 'api-event-field--full' : ''}`}>
              <span className="api-event-label">{formatLabel(k)}</span>
              {typeof v === 'object' && v !== null ? (
                <pre className="api-event-json">{valStr}</pre>
              ) : (
                <span className="api-event-value">{valStr}</span>
              )}
            </div>
          );
        })}

        {/* Automatic Server-side Timestamp Field with hh:mm:ss */}
        <div className="api-event-field">
          <span className="api-event-label">Timestamp</span>
          <span className="api-event-value font-mono text-accent">{timeFormatted}</span>
        </div>
      </div>

      {/* Footer with database timestamp */}
      <div className="api-event-footer">
        <span className="flex items-center gap-1.5 text-textGhost">
          <Clock size={11} className="text-accent shrink-0" />
          <span>{dateFormatted} · {timeFormatted}</span>
        </span>
        <button onClick={(e) => { e.stopPropagation(); setShowRaw(!showRaw); }} className="api-event-raw-toggle">
          {showRaw ? 'Hide Raw' : 'Inspect Raw'}
        </button>
      </div>

      {showRaw && (
        <pre className="api-event-raw-block">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

/* ── Message Bubble ── */
function MessageBubble({ 
  msg, myRole, onDelete, canDelete, onReact, onView, onBurn, onPin, guestId, onReply, messages,
  isClusterStart = true, isClusterEnd = true, isClusterMiddle = false,
  isSelectionMode = false, isSelected = false, onToggleSelect
}) {
  const [mediaExpanded, setMediaExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmAction, confirmationDialog] = useConfirmAction();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState('bottom');
  const [quickHeartAnim, setQuickHeartAnim] = useState(false);
  
  // Swipe to reply & long-press select state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartRef = useRef(null);
  const longPressTimerRef = useRef(null);
  
  const menuRef = useRef(null);
  const isMe = msg.sender === myRole;
  const isApiMessage = msg.sender === 'api';
  const apiEvent = isApiMessage ? tryParseApiEvent(msg.content) : null;

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
    setMenuOpen(false);
    setShowEmojiPicker(false);
    confirmAction({
      title: 'Delete message?',
      item: msg.file_name || msg.content || 'Selected message',
      description: 'This removes the message from this conversation for everyone. This cannot be undone.',
      label: 'Delete message',
      action: () => onDelete(msg.id),
    });
  };




  // if (timeLeft === 0) return null; // Removed so we can render the tombstone

  const handleTouchStart = (e) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (onToggleSelect) {
      longPressTimerRef.current = setTimeout(() => {
        onToggleSelect(msg.id);
        if (navigator.vibrate) navigator.vibrate(40);
      }, 500);
    }
  };

  const handleTouchMove = (e) => {
    if (!touchStartRef.current) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartRef.current.x;
    const diffY = currentY - touchStartRef.current.y;
    
    if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

    if (!isSelectionMode && onReply && Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
      if (diffX > 0 && diffX < 80) {
        setSwipeOffset(diffX);
      }
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (swipeOffset > 50 && onReply && !isSelectionMode) {
      onReply(msg);
    }
    setSwipeOffset(0);
    touchStartRef.current = null;
  };

  const handleQuickHeart = () => {
    setQuickHeartAnim(true);
    setTimeout(() => setQuickHeartAnim(false), 700);
    if (onReact) onReact(msg.id, '❤️', false);
  };

  const isBurned = msg.type === 'burned' || timeLeft === 0;
  const isBlurred = !isMe && msg.burn_after_seconds && !msg.viewed_at && !isBurned;

  const clusterClass = isClusterStart && isClusterEnd 
    ? 'bubble--single' 
    : isClusterStart 
      ? 'bubble--cluster-start' 
      : isClusterEnd 
        ? 'bubble--cluster-end' 
        : 'bubble--cluster-mid';

  const rowClusterClass = !isClusterEnd ? 'bubble-row--clustered' : 'bubble-row--cluster-last';

  return (
    <div 
      id={`msg-${msg.id}`} 
      className={`bubble-row ${isMe ? 'bubble-row--right' : 'bubble-row--left'} ${rowClusterClass}`}
      onClick={(e) => {
        if (isSelectionMode && onToggleSelect) {
          e.stopPropagation();
          onToggleSelect(msg.id);
        }
      }}
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

      {/* Avatar — shown for other person on cluster start, or spacer for alignment */}
      {!isMe && (
        isClusterStart ? (
          <div className={`bubble-avatar ${isApiMessage ? 'bubble-avatar--api' : ''}`} style={{ background: isApiMessage ? '#10b981' : getAvatarColor(msg.sender) }}>
            {isApiMessage ? '📡' : msg.sender === 'owner' ? 'O' : 'G'}
          </div>
        ) : (
          <div className="bubble-avatar bubble-avatar--spacer" />
        )
      )}
      <div 
        className={`bubble relative group ${isMe ? 'bubble--mine' : 'bubble--theirs'} ${clusterClass} ${isApiMessage ? 'bubble--api' : ''}
${isBlurred ? 'bubble--blurred' : ''} ${isBurned ? 'bubble--tombstone' : ''}`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!isSelectionMode && !isBurned) {
            handleQuickHeart();
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          const spaceBelow = window.innerHeight - e.clientY;
          setMenuPosition(spaceBelow < 250 ? 'top' : 'bottom');
          setMenuOpen(true);
        }}
      >
        {quickHeartAnim && (
          <div className="quick-heart-popup" aria-hidden="true">
            ❤️
          </div>
        )}
        {confirmationDialog}
        {msg.is_pinned && !isBurned && !isBlurred && (
          <div className="absolute -top-2 -left-2 bg-bgCard border border-cyan-500/30 rounded-full p-1 shadow-md z-10" title="Pinned">
            <Pin size={10} className="text-cyan-400" />
          </div>
        )}
        {!isBlurred && (
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
            {!isBurned && onToggleSelect && (
              <button 
                className="flex items-center gap-3 px-3 py-2 hover:bg-bgHover rounded-lg text-sm text-textPrimary text-left transition-colors" 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setMenuOpen(false); 
                  setShowEmojiPicker(false); 
                  onToggleSelect(msg.id); 
                }}
              >
                <CheckSquare size={15} className="text-textGhost" /> Select
              </button>
            )}
            {!isBurned && (msg.type === 'image' || msg.type === 'file') && (
              <button className="flex items-center gap-3 px-3 py-2 hover:bg-bgHover rounded-lg text-sm text-textPrimary text-left transition-colors" onClick={(e) => { setMenuOpen(false); setShowEmojiPicker(false); handleDownload(e); }}>
                <Download size={15} className="text-textGhost" /> Download
              </button>
            )}
            {!isBurned && onReply && (
              <button className="flex items-center gap-3 px-3 py-2 hover:bg-bgHover rounded-lg text-sm text-textPrimary text-left transition-colors" onClick={() => { setMenuOpen(false); setShowEmojiPicker(false); onReply(msg); }}>
                <Reply size={15} className="text-textGhost" /> Reply
              </button>
            )}
            {!isBurned && (
              <button className="flex items-center gap-3 px-3 py-2 hover:bg-bgHover rounded-lg text-sm text-textPrimary text-left transition-colors" onClick={() => { setMenuOpen(false); setShowEmojiPicker(false); handleCopy(); }}>
                <Copy size={15} className="text-textGhost" /> Copy
              </button>
            )}
            
            {!isBurned && (
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
            )}
            {!isBurned && <div className="h-[1px] bg-border my-1 mx-2" />}
            {!isBurned && (
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
            )}

            {canDelete && myRole === 'owner' && (
              <>
                {!isBurned && <div className="h-[1px] bg-border my-1 mx-2" />}
                <button 
                  className="flex items-center gap-3 px-3 py-2 hover:bg-danger/10 rounded-lg text-sm text-danger text-left transition-colors" 
                  onClick={handleDelete}
                >
                  <X size={15} /> Delete
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
                  {quotedMsg.sender === 'api' ? '📡 API' : quotedMsg.sender === myRole ? 'You' : quotedMsg.sender === 'owner' ? 'Owner' : 'Guest'}
                </div>
                <div className="truncate max-w-[200px] text-textSecondary">
                  {quotedMsg.type === 'text' ? quotedMsg.content : `[${quotedMsg.type}]`}
                </div>
              </div>
            );
          })()
        )}
        
        {/* Sender name only for incoming messages on cluster start (or burn timer if active) */}
        {!apiEvent && ((!isMe && isClusterStart) || (msg.burn_after_seconds && !isBurned)) && (
          <div className="bubble-meta">
            {!isMe && isClusterStart && (
              <span className="bubble-sender">
                {isApiMessage ? '📡 API' : msg.sender === 'owner' ? 'Owner' : 'Guest'}
              </span>
            )}
            {msg.burn_after_seconds && !isBurned && (
              <span className="bubble-timer-badge">
                <Timer size={10} />
                {msg.viewed_at ? (timeLeft !== null ? `${timeLeft}s` : '0s') : (isMe ? `Sent (${msg.burn_after_seconds}s)` : `${msg.burn_after_seconds}s`)}
              </span>
            )}
          </div>
        )}

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
              apiEvent ? (
                <ApiEventCard event={apiEvent} createdAt={msg.created_at} />
              ) : (
                <div className="bubble-text">{renderMessageText(msg.content)}</div>
              )
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

        {!apiEvent && <span className="bubble-time-float">{formatTime(msg.created_at)}</span>}

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
  onDelete, onBatchDelete, canDelete, onReact, onView, onBurn, onPin, loading,
  myRole = 'owner', disabled = false, audience
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

  // Multi-message Selection & Batch Action State (WhatsApp-style)
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchConfirmAction, batchConfirmationDialog] = useConfirmAction();

  const toggleSelectMessage = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === displayedMessages.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(displayedMessages.map(m => m.id).filter(Boolean));
    }
  };

  const handleBatchCopy = () => {
    const selectedMsgs = (messages || [])
      .filter(m => selectedIds.includes(m.id))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    if (selectedMsgs.length === 0) return;
    
    const textToCopy = selectedMsgs.map(m => {
      const sender = m.sender === 'api' ? '[API]' : m.sender === myRole ? '[You]' : `[${m.sender === 'owner' ? 'Owner' : 'Guest'}]`;
      const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const content = m.type === 'text' ? m.content : (m.file_name || m.file_url || `[${m.type}]`);
      return `${sender} ${time}: ${content}`;
    }).join('\n');

    copyToClipboard(textToCopy, `Copied ${selectedMsgs.length} message${selectedMsgs.length > 1 ? 's' : ''}`);
    setSelectedIds([]);
  };

  const handleBatchDelete = () => {
    if (!canDelete || !onBatchDelete || selectedIds.length === 0) return;
    batchConfirmAction({
      title: `Delete ${selectedIds.length} message${selectedIds.length > 1 ? 's' : ''}?`,
      item: `${selectedIds.length} messages`,
      description: 'This permanently removes the selected messages from this conversation for everyone. This cannot be undone.',
      label: `Delete ${selectedIds.length} messages`,
      action: async () => {
        const ok = await onBatchDelete(selectedIds);
        if (ok !== false) {
          setSelectedIds([]);
        }
      },
    });
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && selectedIds.length > 0) {
        setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds.length]);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [voiceNotePreview, setVoiceNotePreview] = useState(null);

  // Ingestion Category Filtering
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Compute if thread has API messages & count events per category
  const { hasApiMessages, categoryStats, customCategoryStats } = useMemo(() => {
    let hasApi = false;
    const stats = { bug: 0, feedback: 0, feature: 0, telemetry: 0, general: 0 };
    const customStats = {};

    for (const m of (messages || [])) {
      if (m.sender === 'api') hasApi = true;
      const ev = tryParseApiEvent(m.content);
      if (ev) {
        hasApi = true;
        const cat = (ev.category || (ev.status === 'error' ? 'bug' : 'general')).toLowerCase();
        if (stats[cat] !== undefined) {
          stats[cat]++;
        } else {
          customStats[cat] = (customStats[cat] || 0) + 1;
        }
      }
    }
    return { hasApiMessages: hasApi, categoryStats: stats, customCategoryStats: customStats };
  }, [messages]);

  // Filter messages based on selected category
  const displayedMessages = useMemo(() => {
    if (!hasApiMessages || selectedCategory === 'all') return messages || [];
    return (messages || []).filter(m => {
      const ev = tryParseApiEvent(m.content);
      if (!ev) return false;
      const cat = (ev.category || (ev.status === 'error' ? 'bug' : 'general')).toLowerCase();
      return cat === selectedCategory;
    });
  }, [messages, hasApiMessages, selectedCategory]);

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

  const contentRef = useRef(null);
  const scrollControllerRef = useRef(null);
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

  useLayoutEffect(() => {
    const controller = createChatScrollController(threadRef.current, contentRef.current, setShowScrollBtn);
    scrollControllerRef.current = controller;
    return () => {
      controller.destroy();
      scrollControllerRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (!loading) scrollControllerRef.current?.sync();
  }, [loading, messages?.length]);

  // Support mobile virtual viewport (prevents iOS keyboard from covering input dock)
  useEffect(() => {
    if (!window.visualViewport) return;

    const handleResize = () => {
      const chatBar = document.querySelector('.chat-bar');
      if (!chatBar) return;
      const offset = window.innerHeight - window.visualViewport.height;
      if (offset > 120) {
        chatBar.style.transform = `translateY(-${offset}px)`;
      } else {
        chatBar.style.transform = 'none';
      }
    };

    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);
    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

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

  /**
   * Smart Paste — strips invisible/garbage characters common in WhatsApp, Telegram,
   * email clients and other apps before inserting into the composer.
   *
   * What gets cleaned:
   *  • Zero-width chars: ZWS (200B), ZWNJ (200C), ZWJ (200D), BOM (FEFF), SHY (00AD)
   *  • Non-breaking spaces → regular space
   *  • Windows-style CRLF → LF
   *  • Excessive blank lines (3+) → max 2
   *  • Leading / trailing whitespace per line preserved intentionally
   *  • WhatsApp-style forwarded-message headers stripped ("Forwarded message", "‎", etc.)
   */
  const smartCleanText = (raw) => {
    if (!raw) return raw;

    let cleaned = raw;

    // 1. Strip zero-width / invisible Unicode characters
    // eslint-disable-next-line no-control-regex
    cleaned = cleaned.replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u200E\u200F\u202A-\u202E\u2060\u2061\u2062\u2063\u2064\uFFF9-\uFFFB]/g, '');

    // 2. Normalize non-breaking spaces (U+00A0, U+202F, U+2007, U+2009, U+205F, U+3000) → regular space
    cleaned = cleaned.replace(/[\u00A0\u202F\u2007\u2009\u205F\u3000]/g, ' ');

    // 3. Normalize CRLF and CR → LF
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 4. Strip WhatsApp forwarded-message noise line ("Forwarded message" header, starred message badge)
    cleaned = cleaned.replace(/^(Forwarded|Forwarded message)\s*\n/im, '');

    // 5. Collapse 3+ consecutive blank lines → 2 max (preserves intentional double line-breaks)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // 6. Trim trailing whitespace from every individual line (keep leading indent intentionally)
    cleaned = cleaned.split('\n').map(line => line.trimEnd()).join('\n');

    return cleaned;
  };

  const handlePaste = (e) => {
    if (disabled) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    // 1. If media file is in clipboard → attach it (existing behaviour)
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
      return;
    }

    // 2. Text paste — apply smart cleaning
    const rawText = e.clipboardData.getData('text/plain');
    if (!rawText) return; // let browser handle empty paste normally

    const cleanedText = smartCleanText(rawText);

    // Only intercept if we actually changed something (avoid breaking normal pastes)
    if (cleanedText === rawText) return;

    // Insert cleaned text at cursor position in textarea
    e.preventDefault();

    const textarea = e.target;
    const start = textarea.selectionStart ?? text.length;
    const end   = textarea.selectionEnd   ?? text.length;

    const before = text.slice(0, start);
    const after  = text.slice(end);
    const newText = before + cleanedText + after;

    setText(newText);

    // Restore cursor position after the pasted content
    const newCursor = start + cleanedText.length;
    requestAnimationFrame(() => {
      textarea.selectionStart = newCursor;
      textarea.selectionEnd   = newCursor;
    });

    // Quiet toast only if we actually stripped invisible chars (not just normalized newlines)
    const invisibleStripped = rawText.replace(cleanedText, '').length;
    if (invisibleStripped > 0) {
      toast('Cleaned invisible characters from paste', { icon: '✂️', duration: 2000 });
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
      {batchConfirmationDialog}

      {/* ── Selection Action Bar (WhatsApp Style) ── */}
      {selectedIds.length > 0 && (
        <div className="chat-selection-bar">
          <div className="chat-selection-left">
            <button 
              type="button"
              className="chat-selection-btn chat-selection-btn--close" 
              onClick={() => setSelectedIds([])} 
              title="Cancel selection"
            >
              <X size={18} />
            </button>
            <span className="chat-selection-count">
              {selectedIds.length} selected
            </span>
          </div>
          <div className="chat-selection-actions">
            <button 
              type="button"
              className="chat-selection-action-btn"
              onClick={handleSelectAll}
              title={selectedIds.length === displayedMessages.length ? 'Deselect all' : 'Select all'}
            >
              {selectedIds.length === displayedMessages.length ? 'Deselect All' : 'Select All'}
            </button>
            <button 
              type="button"
              className="chat-selection-action-btn"
              onClick={handleBatchCopy}
              title="Copy selected messages"
            >
              <Copy size={14} />
              <span className="hidden sm:inline">Copy</span>
            </button>
            {canDelete && myRole === 'owner' && onBatchDelete && (
              <button 
                type="button"
                className="chat-selection-action-btn chat-selection-action-btn--delete"
                onClick={handleBatchDelete}
                title="Delete selected messages"
              >
                <Trash2 size={14} />
                <span>Delete ({selectedIds.length})</span>
              </button>
            )}
          </div>
        </div>
      )}

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
            type="button"
            aria-label="Scroll to latest message"
            onClick={() => scrollControllerRef.current?.jumpToLatest()}
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

      {/* ── API Category Filter Bar ── */}
      {hasApiMessages && (
        <div className="chat-api-filter-bar">
          <button
            type="button"
            className={`api-filter-pill ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            <span>All</span>
            <span className="api-filter-count">{messages?.length || 0}</span>
          </button>

          {categoryStats.bug > 0 && (
            <button
              type="button"
              className={`api-filter-pill api-filter-pill--bug ${selectedCategory === 'bug' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('bug')}
            >
              <span>🐛 Bugs</span>
              <span className="api-filter-count">{categoryStats.bug}</span>
            </button>
          )}

          {categoryStats.feedback > 0 && (
            <button
              type="button"
              className={`api-filter-pill api-filter-pill--feedback ${selectedCategory === 'feedback' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('feedback')}
            >
              <span>💡 Feedback</span>
              <span className="api-filter-count">{categoryStats.feedback}</span>
            </button>
          )}

          {categoryStats.feature > 0 && (
            <button
              type="button"
              className={`api-filter-pill api-filter-pill--feature ${selectedCategory === 'feature' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('feature')}
            >
              <span>🚀 Features</span>
              <span className="api-filter-count">{categoryStats.feature}</span>
            </button>
          )}

          {categoryStats.telemetry > 0 && (
            <button
              type="button"
              className={`api-filter-pill api-filter-pill--telemetry ${selectedCategory === 'telemetry' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('telemetry')}
            >
              <span>📊 Telemetry</span>
              <span className="api-filter-count">{categoryStats.telemetry}</span>
            </button>
          )}

          {/* Dynamic custom categories */}
          {Object.entries(customCategoryStats).map(([cat, count]) => (
            <button
              key={cat}
              type="button"
              className={`api-filter-pill ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              <span>🏷️ {cat.toUpperCase()}</span>
              <span className="api-filter-count">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Message thread ── */}
      <div className="chat-thread" ref={threadRef} tabIndex={0} role="region" aria-label="Messages">
        <div className="chat-thread-content" ref={contentRef}>

        {loading ? (
          <div className="chat-empty"><div className="spinner" /></div>
        ) : displayedMessages.length === 0 ? (
          <div className="chat-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" style={{ color: 'var(--text-ghost)', marginBottom: 8 }}>
              <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10A8 8 0 0 0 12 2z" />
              <circle cx="9" cy="10" r="1" fill="currentColor" />
              <circle cx="15" cy="10" r="1" fill="currentColor" />
            </svg>
            <p style={{ fontSize: 12, color: 'var(--text-ghost)' }}>
              {selectedCategory !== 'all' ? `No ${selectedCategory} events found` : 'No messages yet'}
            </p>
            {selectedCategory !== 'all' && (
              <button 
                className="mt-2 text-xs text-accent hover:underline font-ui font-medium"
                onClick={() => setSelectedCategory('all')}
              >
                Clear filter (View All)
              </button>
            )}
          </div>
        ) : (
          displayedMessages.map((msg, i) => {
            const prevMsg = i > 0 ? displayedMessages[i - 1] : null;
            const nextMsg = i < displayedMessages.length - 1 ? displayedMessages[i + 1] : null;

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

            const nextShowDate = nextMsg && (new Date(nextMsg.created_at).toDateString() !== new Date(msg.created_at).toDateString());

            // Same sender within 2 minutes (120000ms), uninterrupted by date separators or API events
            const isSameSenderPrev = !showDate && prevMsg && (prevMsg.sender === msg.sender) && 
              (Math.abs(new Date(msg.created_at) - new Date(prevMsg.created_at)) < 120000) &&
              msg.sender !== 'api' && prevMsg.sender !== 'api';

            const isSameSenderNext = !nextShowDate && nextMsg && (nextMsg.sender === msg.sender) &&
              (Math.abs(new Date(nextMsg.created_at) - new Date(msg.created_at)) < 120000) &&
              msg.sender !== 'api' && nextMsg.sender !== 'api';

            const isClusterStart = !isSameSenderPrev;
            const isClusterEnd = !isSameSenderNext;
            const isClusterMiddle = isSameSenderPrev && isSameSenderNext;

            const isSelected = selectedIds.includes(msg.id);
            const isSelectionMode = selectedIds.length > 0;
            const isMe = msg.sender === myRole;

            return (
              <div key={msg.id || i} id={`msg-${msg.id}`} style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                {showDate && (
                  <div className="chat-date-separator">
                    <span>{formatDateSeparator(msg.created_at)}</span>
                  </div>
                )}
                <div 
                  className={`chat-message-item ${isMe ? 'chat-message-item--right' : 'chat-message-item--left'} ${isSelected ? 'chat-message-item--selected' : ''}`}
                  onClick={() => {
                    if (isSelectionMode) {
                      toggleSelectMessage(msg.id);
                    }
                  }}
                >
                  {isSelectionMode && (
                    <div 
                      className={`chat-selection-checkbox ${isSelected ? 'chat-selection-checkbox--checked' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectMessage(msg.id);
                      }}
                      title={isSelected ? 'Deselect message' : 'Select message'}
                    >
                      {isSelected && <Check size={12} strokeWidth={3} />}
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
                    isClusterStart={isClusterStart}
                    isClusterEnd={isClusterEnd}
                    isClusterMiddle={isClusterMiddle}
                    isSelectionMode={isSelectionMode}
                    isSelected={isSelected}
                    onToggleSelect={toggleSelectMessage}
                  />
                </div>
              </div>
            );
          })
        )}
        </div>
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
