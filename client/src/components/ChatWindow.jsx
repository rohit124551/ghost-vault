import { useEffect, useRef, useState } from 'react';
import { Send, Paperclip, Download, X, File, ChevronDown, Copy, Check, ZoomIn, ZoomOut, RotateCcw, Mic, Square, SmilePlus } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import FullScreenImageViewer from './FullScreenImageViewer';
import { copyToClipboard } from '../utils/clipboard';
import './ChatWindow.css';

/* ── Helpers ── */
const AVATAR_COLORS = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#22c55e','#06b6d4'];

function getAvatarColor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function renderMessageText(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  
  // Check for code blocks ```language ... ```
  const codeBlockRegex = /```([\w-]*)\n([\s\S]*?)```/g;
  
  const elements = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add preceding text (linkified)
    if (match.index > lastIndex) {
      const preceding = text.slice(lastIndex, match.index);
      elements.push(
        <span key={`text-${lastIndex}`}>{linkify(preceding, urlRegex)}</span>
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
      <span key={`text-${lastIndex}`}>{linkify(text.slice(lastIndex), urlRegex)}</span>
    );
  }

  return elements;
}

function linkify(text, urlRegex) {
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part)
      ? <a key={i} href={part} target="_blank" rel="noreferrer" className="chat-link">{part}</a>
      : part
  );
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
function MessageBubble({ msg, myRole, onDelete, canDelete, onReact, guestId }) {
  const [mediaExpanded, setMediaExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const isMe = msg.sender === myRole;

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
            {/* Download button — always shown for image/file messages */}
            {(msg.type === 'image' || msg.type === 'file') && (
              <button
                className="bubble-action"
                title="Download"
                onClick={handleDownload}
              >
                <Download size={10} />
              </button>
            )}
            <button className={`bubble-action ${copied ? 'text-success' : ''}`} onClick={handleCopy} title="Copy Link">
              {copied ? <Check size={10} /> : <Copy size={10} />}
            </button>
            <div className="relative">
              <button 
                className="bubble-action bubble-action--react" 
                onClick={() => setShowEmojiPicker(!showEmojiPicker)} 
                title="React"
              >
                <SmilePlus size={10} />
              </button>
              {showEmojiPicker && (
                <div className="chat-mini-emoji-picker">
                  {QUICK_EMOJIS.map(e => (
                    <button key={e} onClick={() => handleReactClick(e)}>{e}</button>
                  ))}
                </div>
              )}
            </div>
            {canDelete && myRole === 'owner' && (
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
          </div>
        )}

        {msg.type === 'file' && getFileTypeFromName(msg.file_name) === 'pdf' && (
          <div className="bubble-media-wrapper">
            <iframe src={`${msg.file_url}#toolbar=0`} className="bubble-pdf-preview" title="PDF Preview" style={{pointerEvents: 'none'}} />
            <div style={{display: 'flex', width: '100%'}}>
              <button onClick={() => setMediaExpanded(true)} className="bubble-pdf-open" style={{borderRight: '1px solid rgba(255,255,255,0.1)'}}>
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
                <span className="bubble-file-size">{(msg.file_size / 1024).toFixed(1)} KB</span>
              )}
            </div>
            <button className="bubble-file-dl" onClick={handleDownload} title="Download">
              <Download size={13} />
            </button>
          </div>
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
  onDelete, canDelete, onReact, loading,
  myRole = 'owner', disabled = false
}) {
  const [text, setText]       = useState('');
  const [sending, setSending] = useState(false);
  const [filePreviews, setFilePreviews] = useState([]); // Array of { file, name }
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewHeight, setPreviewHeight] = useState(0);
  
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
  
  const scrollRef   = useRef(null);
  const threadRef   = useRef(null);
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
      await onSendFile(voiceNotePreview.file);
      URL.revokeObjectURL(voiceNotePreview.url);
      setVoiceNotePreview(null);
      setSending(false);
      return;
    }
    
    if (!text.trim()) return;
    setSending(true);
    await onSendText(text.trim());
    setText('');
    setSending(false);
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
      if (filePreviews.length > 0 && !sending) {
        handleFileSend();
      } else if (text.trim() && !sending) {
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

  const handleFileSend = async () => {
    if (filePreviews.length === 0 || sending || disabled) return;
    setSending(true);
    try {
      for (const p of filePreviews) {
        await onSendFile(p.file);
      }
      setFilePreviews([]);
    } catch (err) {
      toast.error('Failed to send some files');
    } finally {
      setSending(false);
    }
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
              <div key={msg.id || i} style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
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
                  guestId={guestId}
                />
              </div>
            );
          })
        )}
        <div ref={scrollRef} />
      </div>

      {/* ── File previews ── */}
      {filePreviews.length > 0 && !disabled && (
        <div className="chat-previews-container" ref={previewRef}>
          <div className="chat-previews-list">
            {filePreviews.map((p, idx) => (
              <div key={idx} className="chat-file-chip">
                <File size={13} />
                <span className="chat-file-chip-name">{p.name}</span>
                <button className="chat-file-chip-remove" onClick={() => removeFile(idx)}>
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="btn btn-primary btn-sm chat-files-send-btn"
            onClick={handleFileSend}
            disabled={sending}
          >
            {sending ? <span className="spinner" style={{width:12,height:12}} /> : `Send ${filePreviews.length > 1 ? filePreviews.length + ' Files' : 'File'}`}
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
            
            {text.trim() || filePreviews.length > 0 || voiceNotePreview ? (
              <button
                className="chat-send chat-send--active"
                onClick={handleSend}
                disabled={sending}
                title="Send"
              >
                {sending ? <span className="spinner" style={{width:14,height:14}} /> : <Send size={14} />}
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
