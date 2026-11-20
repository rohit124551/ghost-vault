import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ChatHeader from './ChatHeader';
import { VoicePlayer, LinkCard, audioTime } from './ChatMedia';
import { useChatActivity } from './useChatActivity';
import { summary, imageGroups } from './chatTools';
import { CheckCheck, NotebookPen, Users, Terminal, Send, Paperclip, Download, X, File, ChevronDown, Copy, Check, CheckSquare, ZoomIn, Mic, Square, SmilePlus, Timer, EyeOff, Reply, Pin, PinOff, Clock, Trash2 } from 'lucide-react';
import MessageText from './MessageText';
import ThreadPanel from './ThreadPanel';
import { motion, AnimatePresence } from 'framer-motion';
import {RequestFileDialog, TransferCard} from './TransferCard';
import {guestAttachmentBytes, cloudAttachmentBytes, uploadTemporaryFile} from '../lib/transfers';
import toast from 'react-hot-toast';
import FullScreenImageViewer from './FullScreenImageViewer';
import { copyToClipboard } from '../utils/clipboard';
import { formatBytes } from '../utils/formatBytes';
import { createChatScrollController } from '../utils/chatScroll';
import './ChatWindow.css';
import './ChatPolish.css';
import { useConfirmAction } from '../hooks/useConfirmAction';

/* ── Helpers ── */
const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4'];

function getAvatarColor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
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
  msg, token, renderTransfer, onThread, notebook, myRole, onDelete, canDelete, onReact, onView, onBurn, onPin, guestId, onReply, messages,
  isClusterStart = true, isClusterEnd = true,
  isSelectionMode = false, onToggleSelect
}) {
  const [mediaExpanded, setMediaExpanded] = useState(false);
  const [confirmAction, confirmationDialog] = useConfirmAction();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [point, setPoint] = useState(null);
  const optionsRef = useRef(null);
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
      if (menuRef.current && !menuRef.current.contains(e.target) && !optionsRef.current?.contains(e.target)) {
        setMenuOpen(false);
        setShowEmojiPicker(false);
      }
    };
    const escape = e => { if (e.key === 'Escape') setMenuOpen(false); };
    if (menuOpen) document.addEventListener('keydown', escape);
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    const position = () => {
      const menu = menuRef.current;
      const anchor = optionsRef.current?.getBoundingClientRect();
      if (!menu || (!point && !anchor)) return;
      const x = point?.x ?? anchor.left;
      const below = point?.y ?? anchor.bottom;
      const above = point?.y ?? anchor.top;
      const left = Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8));
      const top = below + menu.offsetHeight + 8 <= innerHeight ? below : Math.max(8, above - menu.offsetHeight);
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
    };
    position();
    window.addEventListener('resize', position);
    const dismiss = e => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', dismiss, true);
    };
  }, [menuOpen, point, showEmojiPicker]);

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
      data-receipt-id={!isMe && !isApiMessage && !msg.seen_at && !msg.burn_after_seconds ? msg.id : undefined}
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
        id={`bubble-${msg.id}`}
        className={`bubble relative group ${isMe ? 'bubble--mine' : 'bubble--theirs'} ${clusterClass} ${isApiMessage ? 'bubble--api' : ''}
${isBlurred ? 'bubble--blurred' : ''} ${isBurned ? 'bubble--tombstone' : ''}`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!isSelectionMode && !isBurned) {
            handleQuickHeart();
          }
        }}
        onContextMenu={(e) => {
          if (isBlurred || isSelectionMode) return;
          e.preventDefault();
          setPoint({x:e.clientX, y:e.clientY});
          setShowEmojiPicker(false);
          setMenuOpen(true);
        }}
      >
        {onReact && !isBurned && !isBlurred && !isSelectionMode && <div className="quick-reactions" aria-label="Quick reactions">
          {QUICK_EMOJIS.map(emoji => <button key={emoji} aria-label={'React ' + emoji} onClick={() => handleReactClick(emoji)}>{emoji}</button>)}
        </div>}
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
        {menuOpen && createPortal(
          <motion.div initial={{opacity:0, scale:.94}} animate={{opacity:1, scale:1}} transition={{duration:.13}}
            ref={menuRef} className="message-options-menu"
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
            {!isBurned && onThread && <button className="thread-action" onClick={() => {setMenuOpen(false); onThread(msg);}}>Reply in thread</button>}
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
              </button>
            )}
            {showEmojiPicker && <div className="message-options-emoji">
              {QUICK_EMOJIS.map(emoji => <button key={emoji} aria-label={'React ' + emoji} onClick={() => {
                setMenuOpen(false);
                handleReactClick(emoji);
              }}>{emoji}</button>)}
            </div>}
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
          </motion.div>, document.body
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
                  {summary(quotedMsg).slice(0,60)}
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
            {msg.transfer ? renderTransfer(msg) : msg.type === 'text' && (
              apiEvent ? (
                <ApiEventCard event={apiEvent} createdAt={msg.created_at} />
              ) : (
                <><MessageText text={msg.content}/>
                {!msg.burn_after_seconds && msg.content?.match(/https?:\/\/[^\s<>]+/i) && <LinkCard url={msg.content.match(/https?:\/\/[^\s<>]+/i)[0]} token={token} myRole={myRole}/>}</>
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
                <VoicePlayer url={msg.file_url}/>
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

        {!apiEvent && <span className="bubble-time-float">{formatTime(msg.created_at)} {isMe && !notebook && <span aria-label={msg.viewed_at || msg.seen_at ? 'Seen' : msg.delivered_at ? 'Delivered' : 'Sent'} title={msg.viewed_at || msg.seen_at ? 'Seen' : msg.delivered_at ? 'Delivered' : 'Sent'}>
          {msg.viewed_at || msg.seen_at ? <CheckCheck size={14} color="#a5f3fc"/> : msg.delivered_at ? <CheckCheck size={14}/> : <Check size={13}/>}</span>}</span>}

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
      {!isBlurred && !isSelectionMode && <button
        type="button" ref={optionsRef} className="message-options-trigger"
        title="Message options" aria-label="Message options" aria-expanded={menuOpen}
        onTouchStart={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation();
          setPoint(null);
          setShowEmojiPicker(false);
          setMenuOpen(open => !open);
        }}>
        <ChevronDown size={14} aria-hidden="true"/>
      </button>}
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
function AttachmentThumbnail({file}) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return src && <img className="attachment-thumbnail" src={src} alt={'Preview of ' + file.name}/>;
}

export default function ChatWindow({
  messages, onSendText, onSendFile,
  onDelete, onBatchDelete, canDelete, onReact, onView, onBurn, onPin, loading,
  myRole = 'owner', disabled = false, audience, socket, token, updateMessages, paused, slug, invite, roomTitle, navigation, roomActions, feedDetails
}) {
  const [requestingFile,setRequestingFile] = useState(false);
  function mergeTransfer(row) {
    updateMessages(prev => prev.some(m => m.id === row.id) ? prev.map(m => m.id === row.id ? row : m) : [...prev,row]);
  }
  const renderTransfer = message => <TransferCard message={message} token={token} myRole={myRole} onUpdate={mergeTransfer}/>;
  const [panel, setPanel] = useState('');
  const [query, setQuery] = useState('');
  const [threadId, setThreadId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [sent, setSent] = useState(false);
  const [pinIndex, setPinIndex] = useState(0);
  const composer = useRef(null);
  const chatRoot = useRef(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const shared = audience === 'shared' && !disabled && !paused;
  const {peerTyping, input, apiClient} = useChatActivity({socket, token, myRole, messages, updateMessages, shared, loading, chatRoot, threadId, category:selectedCategory});
  const inviteUrl = invite || window.location.origin + '/r/' + token;
  const curl = 'curl -X POST "' + apiClient.defaults.baseURL + '/api/ingest/' + encodeURIComponent(slug || token) + '" -H "Content-Type: application/json" -d \'{"title":"First event"}\'';
  const peerName = myRole === 'owner' ? 'Guest' : 'Owner';
  const [text, setText] = useState('');
  const [timerDuration, setTimerDuration] = useState(null); // null = off
  const [moreTools, setMoreTools] = useState(false);
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const [customTimerInput, setCustomTimerInput] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [filePreviews, setFilePreviews] = useState([]); // Array of { file, name }
  const [outbox, setOutbox] = useState([]);
  const sendQueue = useRef(Promise.resolve());
  const nextSendId = useRef(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);

  useLayoutEffect(() => {
    if (composer.current) {
      composer.current.style.height = 'auto';
      composer.current.style.height = composer.current.scrollHeight + 'px';
    }
  }, [text]);
  useEffect(() => {
    if (sent) { const id = setTimeout(() => setSent(false), 850); return () => clearTimeout(id); }
  }, [sent]);
  useLayoutEffect(() => {
    // Some mobile browsers resize only the visual viewport when the keyboard opens.
    const viewport = window.visualViewport;
    const root = chatRoot.current;
    if (!viewport || !window.matchMedia('(pointer: coarse)').matches) return;
    const fitKeyboard = () => {
      const editingHere = root.contains(document.activeElement) && document.activeElement.matches('input,textarea');
      const visibleBottom = viewport.offsetTop + viewport.height;
      const inset = editingHere ? Math.max(0, root.getBoundingClientRect().bottom - visibleBottom) : 0;
      root.style.setProperty('--keyboard-inset', inset + 'px');
    };
    viewport.addEventListener('resize', fitKeyboard);
    viewport.addEventListener('scroll', fitKeyboard);
    root.addEventListener('focusin', fitKeyboard);
    root.addEventListener('focusout', fitKeyboard);
    return () => {
      viewport.removeEventListener('resize', fitKeyboard);
      viewport.removeEventListener('scroll', fitKeyboard);
      root.removeEventListener('focusin', fitKeyboard);
      root.removeEventListener('focusout', fitKeyboard);
    };
  }, []);
  const drafts = useRef(new Map());
  function changeThread(next) {
    if (savingEdit || isRecording) return false;
    if (next !== threadId) {
      drafts.current.set(threadId, {text, filePreviews, replyingTo, timerDuration, voiceNotePreview, editing});
      const draft = drafts.current.get(next);
      drafts.current.delete(next);
      setText(draft?.text || '');
      setFilePreviews(draft?.filePreviews || []);
      setReplyingTo(draft?.replyingTo || null);
      setTimerDuration(draft?.timerDuration || null);
      setVoiceNotePreview(draft?.voiceNotePreview || null);
      setEditing(draft?.editing || null);
      setShowTimerPicker(false);
      setThreadId(next);
      input(false);
    }
    return true;
  }
  function jump(id) {
    setSelectedCategory('all'); setPanel('');
    const match = messages.find(m => m.id === id);
    const parent = match?.is_thread_reply && messages.some(m => m.id === match.reply_to_id) ? match.reply_to_id : null;
    if (!changeThread(parent)) return;
    if (parent) {
      requestAnimationFrame(() => document.getElementById('thread-msg-' + id)?.scrollIntoView({block:'nearest'}));
      return;
    }
    requestAnimationFrame(() => document.getElementById('msg-' + id)?.scrollIntoView({behavior:'smooth',block:'center'}));
  }
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
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.target.closest('input,textarea,[contenteditable=true]')) {
        e.preventDefault(); setPanel('search');
      }
      if (e.key === 'Escape') {
        if (threadId) { changeThread(null); return; }
        setReplyingTo(null); setMoreTools(false); setShowTimerPicker(false); setPanel('');
        if (editing) {setEditing(null); setText('');}
        setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [voiceNotePreview, setVoiceNotePreview] = useState(null);

  // Ingestion Category Filtering


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
    const ids = new Set((messages || []).map(m => m.id));
    const main = (messages || []).filter(m => !m.is_thread_reply || !ids.has(m.reply_to_id));
    if (!hasApiMessages || selectedCategory === 'all') return main;
    return main.filter(m => {
      const ev = tryParseApiEvent(m.content);
      if (!ev) return false;
      const cat = (ev.category || (ev.status === 'error' ? 'bug' : 'general')).toLowerCase();
      return cat === selectedCategory;
    });
  }, [messages, hasApiMessages, selectedCategory]);

  const threadCounts = useMemo(() => {
    const counts = new Map();
    for (const m of messages || []) if (m.is_thread_reply) counts.set(m.reply_to_id, (counts.get(m.reply_to_id) || 0) + 1);
    return counts;
  }, [messages]);
  const groups = useMemo(() => imageGroups(displayedMessages), [displayedMessages]);
  const positions = useMemo(() => new Map(displayedMessages.map((m,i) => [m.id,i])), [displayedMessages]);
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

  // Voice Note Handlers
  const startRecording = async () => {
    if (disabled || savingEdit) return;
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

  const handleSend = async () => {
    if (savingEdit || disabled) return;

    input(false);
    if (editing) {
      if (!text.trim()) return;
      setSavingEdit(true);
      try {
        const {data} = await apiClient.patch('/api/rooms/' + token + '/messages/' + editing + '/text', {content:text, key:sessionStorage.getItem('edit:' + editing)});
        updateMessages(prev => prev.map(m => m.id === editing ? data : m));
        setText(''); setEditing(null); setSent(true);
      } catch { toast.error('Could not save edit'); } finally {setSavingEdit(false);}
      return;
    }
    const attachments = voiceNotePreview ? [voiceNotePreview.file] : filePreviews.map(p => p.file);
    if (myRole !== 'owner' && attachments.some(file => file.size > guestAttachmentBytes)) {
      return toast.error('Files over 25 MiB need an upload request from the owner.');
    }
    if (timerDuration && attachments.some(file => file.size > cloudAttachmentBytes)) {
      return toast.error('Temporary files expire after 24 hours. Turn off the read timer to send.');
    }
    const items = attachments.map(file => ({file, label:file === voiceNotePreview?.file ? 'Voice note' : file.name}));
    if (!voiceNotePreview && text.trim()) items.push({label:text.trim()});
    if (!items.length) return;

    const batch = items.map(item => ({
      ...item, id:++nextSendId.current, threadId, timerDuration,
      replyId:threadId || replyingTo?.id, failed:false
    }));
    setOutbox(prev => [...prev, ...batch]);
    if (voiceNotePreview) URL.revokeObjectURL(voiceNotePreview.url);
    else { setText(''); setFilePreviews([]); }
    setVoiceNotePreview(null);
    setTimerDuration(null);
    setReplyingTo(null);
    batch.forEach(queueSend);
    composer.current?.focus();
  };

  function queueSend(item) {
    const patch = changes => setOutbox(prev => prev.map(p => p.id === item.id ? {...p, ...changes} : p));
    patch({failed:false, progress:null});
    sendQueue.current = sendQueue.current.then(async () => {
      try {
        if (item.file?.size > cloudAttachmentBytes) {
          const row = await uploadTemporaryFile(apiClient,token,item.file,{replyId:item.replyId,thread:!!item.threadId},
            event => patch({progress:Math.round(100 * event.loaded / event.total)}));
          mergeTransfer(row);
        } else if (item.file) {
          await onSendFile(item.file, item.timerDuration, item.replyId, event => {
            if (event.total) patch({progress:Math.round(100 * event.loaded / event.total)});
          }, !!item.threadId);
        } else {
          await onSendText(item.label, item.timerDuration, item.replyId, !!item.threadId);
        }
        setOutbox(prev => prev.filter(p => p.id !== item.id));
        setSent(true);
      } catch (error) {
        patch({failed:true, error:error.response?.data?.error || (error.response?.status === 413 ? 'Attachment too large' : 'Send unconfirmed')});
      }
    });
  }

  function pendingBubbles(thread) {
    return outbox.filter(item => item.threadId === thread).map(item =>
      <div key={item.id} className="pending-bubble">
        <span>{item.label}</span>
        <small role="status">{item.failed ? item.error : item.progress != null ? 'Uploading ' + item.progress + '%' : 'Pending'}</small>
        {item.failed && !disabled && <button onClick={() => queueSend(item)}>Retry</button>}
      </div>
    );
  }

  const handleKey = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowUp' && !text && !filePreviews.length && !replyingTo && !threadId) {
      const last = messages.slice().reverse().find(m => m.sender === myRole && m.type === 'text' && !m.burn_after_seconds &&
        (myRole === 'owner' || sessionStorage.getItem('edit:' + m.id)));
      if (last) {e.preventDefault();setText(last.content);setEditing(last.id);}
      return;
    }
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.shiftKey) {
        if (e.ctrlKey) {
          e.preventDefault();
          const cursor = e.target.selectionStart;
          const newValue = text.slice(0, cursor) + '\n' + text.slice(e.target.selectionEnd);
          if (newValue.length > 2000) return;
          setText(newValue);
          setTimeout(() => {
            e.target.selectionStart = cursor + 1;
            e.target.selectionEnd = cursor + 1;
          }, 0);
        }
        return;
      }
      e.preventDefault();
      if ((filePreviews.length > 0 || text.trim()) && !savingEdit) {
        handleSend();
      }
    }
  };

  const handlePaste = (e) => {
    if (disabled || editing) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    // 1. If media file is in clipboard → attach it (images / videos)
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

    // 2. Pure raw text: preserve all newlines, spaces, bullets, and indentation exactly as pasted
    // The browser's native textarea paste handles raw text seamlessly without deducting anything.
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
    if (disabled || editing) return;

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
      ref={chatRoot}
      data-audience={audience}
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

      {requestingFile && <RequestFileDialog token={token} onClose={() => setRequestingFile(false)} onCreated={mergeTransfer}/>}
      <ChatHeader panel={panel} setPanel={setPanel} query={query} setQuery={setQuery} messages={messages || []} jump={jump}
        title={roomTitle || (audience === 'personal' ? 'Saved Notes' : token)} audience={audience}
        paused={paused} disabled={disabled} navigation={navigation} roomActions={<>{myRole === 'owner' && shared && <button onClick={() => setRequestingFile(true)}>Request a file</button>}{roomActions}</>} feedDetails={feedDetails}/>
      {isDragging && (
        <div className="chat-drag-overlay">
          <div className="chat-drag-content">
            <Download size={32} />
            <p style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>Drop media to share</p>
          </div>
        </div>
      )}


      {/* ── Pinned Message Banner ── */}
      {(() => {
        const pins = (messages || []).filter(m => m.is_pinned).reverse();
        const current = pinIndex % pins.length;
        const pinnedMsg = pins[current];
        if (!pinnedMsg) return null;
        return (
          <div 
            className="chat-pinned-banner"
            onClick={() => {
              jump(pinnedMsg.id);
            }}
          >
            <div className="chat-pinned-icon">
              <Pin size={14} className="text-cyan-400" />
            </div>
            <div className="chat-pinned-content">
              <span className="chat-pinned-title">Pinned {current + 1}/{pins.length}</span>
              <span className="chat-pinned-text truncate">{summary(pinnedMsg)}</span>
            </div>
            {pins.length > 1 && [-1,1].map(step => <button key={step} aria-label={step < 0 ? 'Previous pin' : 'Next pin'} onClick={e => {e.stopPropagation();setPinIndex((current + step + pins.length) % pins.length);}}>{step < 0 ? '‹' : '›'}</button>)}
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
      <div className={'chat-workspace' + (threadId ? ' has-thread' : '')}>
        <div className="timeline-pane">
          <div className="chat-thread" ref={threadRef} tabIndex={0} role="region" aria-label="Messages">
            <div className="chat-thread-content" ref={contentRef}>

            {loading ? (
              <div className="chat-skeleton" role="status" aria-label="Loading messages">{[38,57,29,46].map(w => <i key={w} style={{width:w+'%'}}/>)}</div>
            ) : displayedMessages.length === 0 && !outbox.some(item => !item.threadId) ? (
              <div className="chat-empty">
                {audience === 'personal' ? <NotebookPen size={38}/> : audience === 'api' ? <Terminal size={38}/> : <Users size={38}/>}
                <h3>{selectedCategory !== 'all' ? 'No matching events' : audience === 'personal' ? 'Your private notebook' : audience === 'api' ? 'Waiting for your first event' : 'Start a conversation'}</h3>
                {selectedCategory === 'all' && (audience === 'personal' ? <p>Only you can see this.</p> : audience === 'api' ? <code>{curl}</code> :
                  shared && myRole === 'owner' ? <><code>{inviteUrl}</code><button onClick={() => copyToClipboard(inviteUrl,'Invite link copied')}>Copy invite link</button></> : <p>{paused ? 'Guest access is paused.' : 'Send the first message below.'}</p>)}
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
              groups.map(group => <div key={group[0].id} className={group.length > 1 ? 'image-mosaic ' + (group[0].sender === myRole ? 'mine' : '') : 'message-group'}>{group.map(msg => {
                const i = positions.get(msg.id);
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

                const isSelected = selectedIds.includes(msg.id);
                const isSelectionMode = selectedIds.length > 0;
                const isMe = msg.sender === myRole;

                return (
                  <div key={msg.id || i} style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
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
                        msg={msg} token={token} renderTransfer={renderTransfer} notebook={audience === "personal"} onThread={m => changeThread(m.is_thread_reply ? m.reply_to_id : m.id)}
                        myRole={myRole}
                        onDelete={onDelete}
                        canDelete={canDelete}
                        onReact={onReact}
                        onView={onView}
                        onBurn={onBurn}
                        onPin={onPin}
                        guestId={guestId}
                        onReply={m => {if (changeThread(null)) {setEditing(null);setReplyingTo(m);composer.current?.focus();}}}
                        messages={messages}
                        isClusterStart={isClusterStart}
                        isClusterEnd={isClusterEnd}
                        isSelectionMode={isSelectionMode}
                        onToggleSelect={toggleSelectMessage}
                      />
                      {threadCounts.has(msg.id) && <button className="thread-count" onClick={() => changeThread(msg.id)}>
                        {threadCounts.get(msg.id)} {threadCounts.get(msg.id) === 1 ? 'reply' : 'replies'}
                      </button>}
                    </div>
                  </div>
                );
              })}</div>)
            )}
            {pendingBubbles(null)}
            </div>
          </div>

          <AnimatePresence initial={false}>
            {showScrollBtn && (
              <motion.button
                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.5, y: 20 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="chat-scroll-bottom"
                type="button"
                aria-label="Scroll to latest message"
                onClick={() => scrollControllerRef.current?.jumpToLatest()}
              >
                <ChevronDown size={18} strokeWidth={3} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        {threadId && <ThreadPanel renderTransfer={renderTransfer} pending={pendingBubbles(threadId)} key={threadId} parent={messages.find(m => m.id === threadId)}
          replies={messages.filter(m => m.is_thread_reply && m.reply_to_id === threadId)} myRole={myRole}
          onClose={() => changeThread(null)} renderTimed={m => <MessageBubble msg={m} token={token}
            myRole={myRole} guestId={guestId} onBurn={onBurn} onReact={onReact} onView={onView}/>}
        />}
        <div className="composer-dock">
          {filePreviews.length > 0 && !disabled && (
            <div className="chat-previews-container">
              <div className="chat-previews-list">
                {filePreviews.map((p, idx) => (
                  <div key={idx} className="chat-file-chip relative overflow-hidden flex items-center pr-2">
                    {p.file.type.startsWith("image/") ? <AttachmentThumbnail file={p.file}/> : <File size={13} className="z-10 relative shrink-0" />}
                    <span className="chat-file-chip-name z-10 relative truncate flex-1">{p.name}{p.file.size > cloudAttachmentBytes && <small className="block">Temporary · 24 hours</small>}</span>
                    <button className="chat-file-chip-remove z-10 relative shrink-0 ml-2" onClick={() => removeFile(idx)} aria-label={'Remove ' + p.name}>
                      <X size={11}/>
                    </button>
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
              {replyingTo && !threadId && (
                <div style={{borderLeft:"3px solid " + (replyingTo.sender === myRole ? "#10b981" : "#3b82f6")}} className="flex items-center justify-between px-3 py-2 bg-black/10 border-b border-borderBase/50 rounded-t-xl mb-[-4px] z-10 mx-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {replyingTo.type === 'image' && !replyingTo.burn_after_seconds ? <img src={replyingTo.file_url} width="36" height="32" alt="Quoted attachment"/> : <Reply size={14}/>}
                    <div className="text-xs truncate">
                      <span className="font-bold text-cyan-400 mr-2">Replying to {replyingTo.sender === myRole ? 'yourself' : replyingTo.sender === 'owner' ? 'Owner' : 'Guest'}:</span>
                      <span className="text-textSecondary">{summary(replyingTo).slice(0,60)}</span>
                    </div>
                  </div>
                  <button
                    aria-label="Cancel reply" onClick={() => setReplyingTo(null)}
                    className="p-1 hover:bg-white/10 rounded-full text-textGhost hover:text-white transition-colors shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {editing && <small>Editing message <button onClick={() => {setText('');setEditing(null);}}>Cancel</button></small>}
              {shared && peerTyping && <div className="typing-pill" role="status"><i/> {peerName} is typing…</div>}
              <div className={'chat-input-wrapper z-20' + (sent ? ' send-confirmed' : '')}>
                <button
                  className="chat-attach desktop-attach"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file"
                  disabled={savingEdit || !!editing}
                >
                  <Paperclip size={16} />
                </button>
                <div className="mobile-composer-tools" onBlur={e => {if (!e.currentTarget.contains(e.relatedTarget)) setMoreTools(false);}}>
                  <button aria-label="More composer options" aria-expanded={moreTools} disabled={savingEdit || !!editing}
                    onClick={() => {setMoreTools(!moreTools);setShowTimerPicker(false);}}>+</button>
                  {moreTools && <div className="composer-options">
                    <button onClick={() => {setMoreTools(false);fileInputRef.current?.click();}}>Attach file</button>
                    <button onClick={() => {setMoreTools(false);setShowTimerPicker(true);}}>Disappearing message timer</button>
                  </div>}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  multiple
                  style={{ display: 'none' }}
                />
                <textarea ref={composer} maxLength={2000} aria-label={threadId ? "Thread reply" : "Message"}
                  className="chat-input"
                  placeholder={editing ? "Edit message" : threadId ? "Reply to thread…" : audience === "personal" ? "Write a private note…" : "Write a message…"}
                  value={text}
                  onChange={e => {setText(e.target.value); input(!!e.target.value.trim());}}
                  onKeyDown={handleKey}
                  onPaste={handlePaste}
                  rows={1}
                  disabled={savingEdit || isRecording || voiceNotePreview}
                  style={{ display: (isRecording || voiceNotePreview) ? 'none' : 'block' }}
                />
                {isRecording && (
                  <div className="chat-recording-indicator">
                    <div className="recording-dot"></div>
                    <span className="recording-time">{audioTime(recordingTime)}</span>
                    <button className="chat-cancel-record" onClick={cancelRecording}>Cancel</button>
                  </div>
                )}
                {voiceNotePreview && (
                  <div className="chat-recording-indicator" style={{ gap: '8px' }}>
                    <VoicePlayer key={voiceNotePreview.url} url={voiceNotePreview.url}/>
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
                    disabled={savingEdit || !!editing}
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

                {text.length > 1600 && <small className={'char-count ' + (text.length === 2000 ? 'limit' : text.length >= 1800 ? 'warn' : '')}>{text.length}/2000</small>}
                {isRecording ? (
                  <button
                    className="chat-send chat-record chat-record--active"
                    onClick={stopRecording}
                    title="Stop & Attach"
                  >
                    <Square size={14} fill="currentColor" />
                  </button>
                ) : !(text.trim() || filePreviews.length || voiceNotePreview || editing) && (
                  <button
                    className="chat-send chat-record"
                    onClick={startRecording}
                    disabled={savingEdit}
                    title="Record Voice Note"
                  >
                    <Mic size={16} />
                  </button>
                )}
                  <button
                    className={'chat-send ' + (text.trim() || filePreviews.length || voiceNotePreview ? 'chat-send--active' : '')}
                    onClick={handleSend}
                    disabled={savingEdit || isRecording || !(text.trim() || filePreviews.length || voiceNotePreview)}
                    title={editing ? "Save edit" : "Send"}
                  >
                    <AnimatePresence initial={false} mode="wait">
                      <motion.span key={savingEdit ? 'pending' : sent ? 'sent' : 'ready'}
                        initial={{opacity:0,scale:.8}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.85}}
                        transition={{duration:.09}}>
                        {savingEdit ? <Clock size={15}/> : sent ? <Check size={16}/> : <Send size={16}/>}
                      </motion.span>
                    </AnimatePresence>
                  </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
