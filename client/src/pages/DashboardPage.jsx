import { useEffect, useState, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import api from '../lib/api';
import ChatWindow from '../components/ChatWindow';
import {
  Clipboard, Upload, Trash2, Download, Copy, Link2,
  Plus, QrCode, X, Check, Timer, Eye,
  File, Image, ChevronLeft, ChevronRight, HardDriveDownload, MessageSquare
} from 'lucide-react';
import './DashboardPage.css';

const BASE_URL = window.location.origin;

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeLeft(expiresAt) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt) - Date.now();
  if (ms <= 0) return 'Expired';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ── Fix 1: Name Dialog — Local Save PRIMARY, Upload secondary ─────────────────
function NameDialog({ file, defaultName, onSaveLocal, onUpload, onCancel }) {
  const [name, setName] = useState(defaultName);
  const [expiry, setExpiry] = useState('');

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Save screenshot</div>

        {/* Preview */}
        {file?.type?.startsWith('image/') && (
          <img
            src={URL.createObjectURL(file)}
            alt="preview"
            style={{ width: '100%', borderRadius: 8, marginBottom: 14, maxHeight: 180, objectFit: 'cover' }}
          />
        )}

        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Filename</label>
        <input
          className="input mono"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
          autoFocus
          style={{ marginBottom: 12 }}
        />

        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>
          Expiry (only for cloud uploads)
        </label>
        <select className="input" value={expiry} onChange={e => setExpiry(e.target.value)} style={{ marginBottom: 16 }}>
          <option value="">None</option>
          <option value="1440">24 hours</option>
          <option value="10080">7 days</option>
          <option value="43200">30 days</option>
        </select>

        <div style={{ display: 'flex', gap: 8 }}>
          {/* PRIMARY — local save, zero network */}
          <button
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => onSaveLocal(name || defaultName)}
          >
            <HardDriveDownload size={14} /> Save Locally
          </button>
          {/* SECONDARY — Cloudinary upload */}
          <button
            className="btn btn-secondary"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => onUpload(name || defaultName, expiry)}
          >
            <Upload size={14} /> Upload &amp; Save
          </button>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Create Room Modal ─────────────────────────────────────────────────────────
function CreateRoomModal({ onCreate, onClose }) {
  const [expiry, setExpiry] = useState('');
  const [viewOnce, setViewOnce] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await api.post('/api/rooms', {
        viewOnce,
        ...(expiry ? { expiresInMinutes: parseInt(expiry) } : {}),
      });
      onCreate(res.data);
      onClose();
    } catch { toast.error('Failed to create room'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Create Temp Link</div>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Expiry</label>
        <select className="input" value={expiry} onChange={e => setExpiry(e.target.value)} style={{ marginBottom: 14 }}>
          <option value="">None</option>
          <option value="15">15 minutes</option>
          <option value="60">1 hour</option>
          <option value="1440">24 hours</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 18 }}>
          <input type="checkbox" checked={viewOnce} onChange={e => setViewOnce(e.target.checked)} />
          <span style={{ fontSize: 13 }}>View-once — auto-revoke after first file</span>
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={loading}>
            {loading ? <><span className="spinner" /> Creating…</> : <><Link2 size={13} /> Create</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── QR Modal ──────────────────────────────────────────────────────────────────
function QRModal({ room, onClose, onRevoke }) {
  const [countdown, setCountdown] = useState(() => timeLeft(room.expiresAt));
  const link = `${BASE_URL}/r/${room.token}`;

  useEffect(() => {
    if (!room.expiresAt) return;
    const id = setInterval(() => setCountdown(timeLeft(room.expiresAt)), 1000);
    return () => clearInterval(id);
  }, [room.expiresAt]);

  const copy = () => { navigator.clipboard.writeText(link); toast.success('Copied!'); };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span className="modal-title" style={{ marginBottom: 0 }}>Room <span className="token-text">{room.token}</span></span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}><X size={13} /></button>
        </div>
        <div className="qr-box">
          <QRCodeSVG value={link} size={180} bgColor="transparent" fgColor="#f0f0f0" level="M" />
        </div>
        <div className="link-row">
          <code className="link-text">{link}</code>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={copy}><Copy size={12} /></button>
        </div>
        {countdown && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 12, color: 'var(--text-2)' }}>
            <Timer size={11} /> Expires in: <span className="mono text-cyan">{countdown}</span>
          </div>
        )}
        {room.viewOnce && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12, color: 'var(--text-2)' }}>
            <Eye size={11} /> View-once
          </div>
        )}
        <button className="btn btn-danger btn-sm" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }} onClick={onRevoke}>
          <X size={12} /> Revoke
        </button>
      </div>
    </div>
  );
}

// ── Upload Card ───────────────────────────────────────────────────────────────
function UploadCard({ upload, onDelete }) {
  const isImg = upload.file_type?.startsWith('image/');
  const isExp = upload.expires_at && new Date(upload.expires_at) < new Date();
  const copy = () => { navigator.clipboard.writeText(upload.cloudinary_url); toast.success('URL copied!'); };
  const dl = () => { const a = document.createElement('a'); a.href = upload.cloudinary_url; a.download = upload.file_name; a.click(); };

  return (
    <div className={`upload-card ${isExp ? 'upload-card--expired' : ''}`}>
      <div className="upload-thumb">
        {isImg
          ? <img src={upload.cloudinary_url} alt={upload.file_name} loading="lazy" />
          : <div className="upload-thumb-icon"><File size={20} className="text-secondary" /></div>
        }
      </div>
      <div className="upload-info">
        <div className="upload-name mono">{upload.file_name}</div>
        <div className="text-xs text-secondary">
          {new Date(upload.created_at).toLocaleDateString('en-IN')}
          {upload.expires_at && !isExp && (
            <span className="badge badge-amber" style={{ marginLeft: 6 }}>
              <Timer size={9} /> {timeLeft(upload.expires_at)}
            </span>
          )}
          {isExp && <span className="badge badge-grey" style={{ marginLeft: 6 }}>Expired</span>}
        </div>
      </div>
      <div className="upload-actions">
        <button className="btn btn-ghost btn-sm btn-icon" onClick={dl} data-tip="Download"><Download size={12} /></button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={copy} data-tip="Copy URL"><Copy size={12} /></button>
        <button className="btn btn-danger btn-sm btn-icon" onClick={() => onDelete(upload.id)} data-tip="Delete"><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

// ── Room Row — two-step revoke ────────────────────────────────────────────────
function RoomRow({ room, onQR, onRevoke, onChat }) {
  const [countdown, setCountdown] = useState(() => timeLeft(room.expires_at));
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const confirmTimer = useRef(null);

  useEffect(() => {
    if (!room.expires_at) return;
    const id = setInterval(() => setCountdown(timeLeft(room.expires_at)), 1000);
    return () => clearInterval(id);
  }, [room.expires_at]);

  const handleRevoke = () => {
    if (!confirmRevoke) {
      setConfirmRevoke(true);
      confirmTimer.current = setTimeout(() => setConfirmRevoke(false), 2000);
    } else {
      clearTimeout(confirmTimer.current);
      setConfirmRevoke(false);
      onRevoke();
    }
  };

  return (
    <div className="room-row">
      <div className="room-row-left">
        <span className="active-dot" />
        <span className="token-text">{room.token}</span>
        {room.view_once && <span className="badge badge-amber"><Eye size={9} /> once</span>}
        {countdown && <span className="badge badge-blue"><Timer size={9} /> {countdown}</span>}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onChat} data-tip="Chat"><MessageSquare size={13} /></button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onQR} data-tip="QR code"><QrCode size={13} /></button>
        <button
          className={`btn btn-sm btn-icon ${confirmRevoke ? 'btn-danger' : 'btn-ghost'}`}
          onClick={handleRevoke}
          data-tip={confirmRevoke ? 'Click again' : 'Revoke'}
        >
          {confirmRevoke ? <span style={{ fontSize: 10 }}>Sure?</span> : <X size={13} />}
        </button>
      </div>
    </div>
  );
}

// ── MAIN DASHBOARD ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const [uploads, setUploads] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [qrRoom, setQrRoom] = useState(null);
  const [chatRoom, setChatRoom] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalUploads, setTotalUploads] = useState(0);
  const [pasteFlash, setPasteFlash] = useState(false);
  const { socket, joinRoom } = useSocket();

  // Fetch on mount
  useEffect(() => {
    Promise.all([api.get(`/api/uploads?page=${page}`), api.get('/api/rooms')])
      .then(([u, r]) => {
        setUploads(u.data.uploads || []);
        setTotalUploads(u.data.total || 0);
        setRooms((r.data || []).filter(rm => rm.is_active));
      })
      .finally(() => setLoading(false));
  }, [page]);

  // Socket
  useEffect(() => {
    if (!socket || !rooms.length) return;
    rooms.forEach(r => joinRoom(r.token));

    const onFile = (file) => {
      toast.success(`📎 File received in room ${file.roomToken}`, { duration: 4000 });
      if (file.roomToken) setRooms(prev => prev.filter(r => !(r.token === file.roomToken && r.view_once)));
    };
    const onMessage = (msg) => {
      if (chatRoom && msg.roomToken === chatRoom.token) {
        setChatMessages(prev => [...prev, msg]);
      }
      if (msg.sender === 'guest') toast(`💬 Guest: ${msg.content?.slice(0,40) || 'sent a file'}`, { duration: 3000 });
    };
    const onRevoked = ({ token }) => setRooms(prev => prev.filter(r => r.token !== token));

    socket.on('new_file', onFile);
    socket.on('new_message', onMessage);
    socket.on('room_revoked', onRevoked);
    return () => { socket.off('new_file', onFile); socket.off('new_message', onMessage); socket.off('room_revoked', onRevoked); };
  }, [socket, rooms, chatRoom]);

  // Global paste listener
  useEffect(() => {
    const handle = (e) => {
      const img = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
      if (!img) return;
      const file = img.getAsFile();
      if (!file) return;
      setPasteFlash(true);
      setTimeout(() => setPasteFlash(false), 350);
      const defaultName = `screenshot-${new Date().toISOString().slice(0,16).replace('T','-').replace(/:/g,'h')}`;
      setPendingFile({ file, defaultName });
    };
    window.addEventListener('paste', handle);
    return () => window.removeEventListener('paste', handle);
  }, []);

  // Dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    maxSize: 20 * 1024 * 1024,
    onDropAccepted: ([file]) => setPendingFile({ file, defaultName: file.name.replace(/\.[^/.]+$/, '') }),
    onDropRejected: () => toast.error('File too large (max 20 MB)'),
  });

  // Fix 1 — Save Locally (zero network)
  const handleSaveLocal = (name) => {
    const { file } = pendingFile;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    const ext = file.name.split('.').pop() || 'png';
    a.href = url;
    a.download = `${name}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setPendingFile(null);
    toast.success('Saved to Downloads!', { icon: '💾' });
  };

  // Fix 1 — Upload & Save
  const handleUpload = useCallback(async (name, expiresIn) => {
    if (!pendingFile) return;
    const { file } = pendingFile;
    setPendingFile(null);
    setUploading(true); setUploadProgress(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('fileName', name);
    if (expiresIn) fd.append('expiresIn', expiresIn);
    try {
      const res = await api.post('/api/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      navigator.clipboard.writeText(res.data.url).catch(() => {});
      toast.success('Saved! URL copied 📋');
      const uRes = await api.get('/api/uploads?page=1');
      setUploads(uRes.data.uploads || []); setTotalUploads(uRes.data.total || 0); setPage(1);
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); setTimeout(() => setUploadProgress(false), 800); }
  }, [pendingFile]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this upload?')) return;
    try { await api.delete(`/api/uploads/${id}`); setUploads(prev => prev.filter(u => u.id !== id)); toast.success('Deleted'); }
    catch { toast.error('Delete failed'); }
  };

  const handleRevoke = async (token) => {
    try { await api.delete(`/api/rooms/${token}`); setRooms(prev => prev.filter(r => r.token !== token)); if (qrRoom?.token === token) setQrRoom(null); if (chatRoom?.token === token) setChatRoom(null); toast.success('Room revoked'); }
    catch { toast.error('Revoke failed'); }
  };

  // Open chat panel — fetch history
  const openChat = async (room) => {
    setChatRoom(room);
    setChatLoading(true);
    try {
      const res = await api.get(`/api/rooms/${room.token}/messages`);
      setChatMessages(res.data || []);
    } catch { toast.error('Could not load messages'); }
    finally { setChatLoading(false); }
    joinRoom(room.token);
  };

  // Owner sends chat message
  const handleOwnerSendText = async (text) => {
    if (!chatRoom) return;
    try {
      const res = await api.post(`/api/rooms/${chatRoom.token}/messages/text`, { content: text, sender: 'owner' });
      setChatMessages(prev => [...prev, res.data]);
    } catch { toast.error('Failed to send'); }
  };

  const handleOwnerSendFile = async (file) => {
    if (!chatRoom) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('sender', 'owner');
    fd.append('fileName', file.name);
    try {
      const res = await api.post(`/api/rooms/${chatRoom.token}/messages/file`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setChatMessages(prev => [...prev, res.data]);
    } catch { toast.error('Failed to send file'); }
  };

  const handleDeleteMessage = async (id) => {
    try { await api.delete(`/api/rooms/${chatRoom.token}/messages/${id}`); setChatMessages(prev => prev.filter(m => m.id !== id)); }
    catch { toast.error('Failed to delete'); }
  };

  const totalPages = Math.ceil(totalUploads / 10);

  return (
    <div className="dash">
      {uploadProgress && <div className="upload-progress-bar"><div className="progress-bar" /></div>}

      {/* Paste Zone */}
      <div {...getRootProps()} className={`paste-zone ${isDragActive ? 'paste-zone--drag' : ''} ${pasteFlash ? 'paste-zone--flash paste-flash' : ''}`}>
        <input {...getInputProps()} />
        <div className="paste-inner">
          {uploading
            ? <><div className="spinner" /><span className="text-sm">Uploading…</span></>
            : isDragActive
              ? <><Upload size={16} className="text-blue" /><span className="text-sm text-blue">Drop it!</span></>
              : <><Clipboard size={15} className="text-secondary" /><span className="text-sm text-secondary">Press <kbd>Ctrl+V</kbd> to paste — or drag &amp; drop</span></>
          }
        </div>
      </div>

      <div className="dash-grid">
        {/* Gallery */}
        <section className="dash-section">
          <div className="section-header">
            <h2 className="text-lg" style={{ fontWeight: 600 }}>Gallery</h2>
            <span className="text-xs text-secondary">{totalUploads} files</span>
          </div>
          {loading
            ? [...Array(3)].map((_, i) => <div key={i} className="upload-skeleton" />)
            : uploads.length === 0
              ? <div className="empty"><Image size={26} /><p className="text-sm">No uploads yet</p></div>
              : <div className="upload-list">{uploads.map(u => <UploadCard key={u.id} upload={u} onDelete={handleDelete} />)}</div>
          }
          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn btn-ghost btn-sm btn-icon" disabled={page===1} onClick={() => setPage(p=>p-1)}><ChevronLeft size={13}/></button>
              <span className="text-xs text-secondary">{page}/{totalPages}</span>
              <button className="btn btn-ghost btn-sm btn-icon" disabled={page===totalPages} onClick={() => setPage(p=>p+1)}><ChevronRight size={13}/></button>
            </div>
          )}
        </section>

        {/* Rooms */}
        <section className="dash-section">
          <div className="section-header">
            <h2 className="text-lg" style={{ fontWeight: 600 }}>Temp Rooms</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreateRoom(true)}><Plus size={12} /> New</button>
          </div>
          {rooms.length === 0
            ? <div className="empty" style={{ padding: '16px 0' }}><Link2 size={22} /><p className="text-sm">No active rooms</p></div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rooms.map(r => (
                  <RoomRow key={r.id} room={r}
                    onQR={() => setQrRoom({ token: r.token, expiresAt: r.expires_at, viewOnce: r.view_once })}
                    onRevoke={() => handleRevoke(r.token)}
                    onChat={() => openChat(r)}
                  />
                ))}
              </div>
          }
        </section>
      </div>

      {/* Modals */}
      {pendingFile && (
        <NameDialog
          file={pendingFile.file}
          defaultName={pendingFile.defaultName}
          onSaveLocal={handleSaveLocal}
          onUpload={handleUpload}
          onCancel={() => setPendingFile(null)}
        />
      )}
      {showCreateRoom && (
        <CreateRoomModal
          onCreate={r => { setRooms(prev => [{ ...r, is_active: true }, ...prev]); setQrRoom({ token: r.token, expiresAt: r.expiresAt, viewOnce: r.viewOnce }); }}
          onClose={() => setShowCreateRoom(false)}
        />
      )}
      {qrRoom && (
        <QRModal room={qrRoom} onClose={() => setQrRoom(null)} onRevoke={() => { handleRevoke(qrRoom.token); setQrRoom(null); }} />
      )}

      {/* Chat slide-in panel */}
      {chatRoom && (
        <>
          <div className="panel-overlay" onClick={() => setChatRoom(null)} />
          <div className="slide-panel">
            <div className="slide-panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="token-text">{chatRoom.token}</span>
                <span className="text-sm text-secondary">Chat</span>
              </div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setChatRoom(null)}><X size={13} /></button>
            </div>
            <div className="slide-panel-body">
              <ChatWindow
                messages={chatMessages}
                onSendText={handleOwnerSendText}
                onSendFile={handleOwnerSendFile}
                onDelete={handleDeleteMessage}
                canDelete={true}
                loading={chatLoading}
                myRole="owner"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
