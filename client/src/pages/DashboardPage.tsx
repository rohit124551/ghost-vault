import React, { useEffect, useState, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../lib/api';
import ChatWindow from '../components/ChatWindow';
import {
  Clipboard, Upload, Trash2, Download, Copy, Link2,
  Plus, QrCode, X, Check, Timer, Eye,
  File, Image as ImageIcon, ChevronLeft, ChevronRight, HardDriveDownload, MessageSquare,
  Terminal, ShieldAlert, Activity, Database, Server, FolderLock, Menu, LogOut, Code, Cpu, Sun, Moon, Ghost
} from 'lucide-react';
import GhostLogo from '../components/GhostLogo';

const BASE_URL = window.location.origin;

// ── Types ─────────────────────────────────────────────────────────────────────
type Room = any;
type UploadedFile = any;

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeLeft(expiresAt: string) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function isRoomValid(room: Room) {
  if (!room.is_active) return false;
  if (room.expires_at && new Date(room.expires_at) < new Date()) return false;
  return true;
}

// ── Modals ────────────────────────────────────────────────────────────────────
function NameDialog({ file, defaultName, onSaveLocal, onUpload, onCancel }: any) {
  const [name, setName] = useState(defaultName);
  const [expiry, setExpiry] = useState('');

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-5 animate-fadeIn" onClick={onCancel}>
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-[420px] bg-bgCard border border-borderActive rounded-sm p-7 shadow-2xl" 
        onClick={e => e.stopPropagation()}
      >
        <div className="font-display text-lg font-bold text-textPrimary mb-6 tracking-tight flex items-center gap-2">
          <Terminal size={18} className="text-accent" /> Save Asset
        </div>

        {file?.type?.startsWith('image/') && (
          <div className="p-1 border border-borderBase rounded-sm bg-bgBase mb-4">
            <img src={URL.createObjectURL(file)} alt="preview" className="w-full max-h-[180px] object-cover rounded-sm" />
          </div>
        )}

        <label className="block text-[10px] font-mono text-textGhost uppercase tracking-widest mb-1.5">Filename</label>
        <input
          className="w-full h-10 px-3.5 bg-bgBase border border-borderBase rounded-sm text-textPrimary text-sm font-mono outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-cyan-400 mb-4"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
          autoFocus
        />

        <label className="block text-[10px] font-mono text-textGhost uppercase tracking-widest mb-1.5">
          Cloud Expiry
        </label>
        <select 
          className="w-full h-10 px-3.5 bg-bgBase border border-borderBase rounded-sm text-textPrimary text-sm font-mono outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all mb-6" 
          value={expiry} 
          onChange={e => setExpiry(e.target.value)}
        >
          <option value="">Persistent</option>
          <option value="1440">24 Hours</option>
          <option value="10080">7 Days</option>
          <option value="43200">30 Days</option>
        </select>

        <div className="flex gap-3">
          <button
            className="flex-1 flex items-center justify-center gap-2 h-10 rounded-sm bg-accent text-white font-medium text-sm hover:bg-accentHover transition-colors border border-accent"
            onClick={() => onSaveLocal(name || defaultName)}
          >
            <HardDriveDownload size={14} /> Local Save
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-2 h-10 rounded-sm bg-transparent border border-borderActive text-textPrimary font-medium text-sm hover:bg-bgHover transition-colors"
            onClick={() => onUpload(name || defaultName, expiry)}
          >
            <Upload size={14} /> Cloud Upload
          </button>
        </div>
        <button 
          className="w-full flex items-center justify-center h-10 mt-3 text-textSecondary hover:text-textPrimary hover:bg-bgHover rounded-sm text-sm transition-colors border border-transparent" 
          onClick={onCancel}
        >
          Cancel
        </button>
      </motion.div>
    </div>
  );
}

function CreateRoomModal({ onCreate, onClose }: any) {
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
    } catch { toast.error('Tunnel creation failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-5 animate-fadeIn" onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-[400px] bg-bgCard border border-borderActive rounded-sm p-7 shadow-2xl" 
        onClick={e => e.stopPropagation()}
      >
        <div className="font-display text-lg font-bold text-textPrimary mb-6 tracking-tight flex items-center gap-2">
          <Server size={18} className="text-cyan-400" /> Init Secure Tunnel
        </div>
        
        <label className="block text-[10px] font-mono text-textGhost uppercase tracking-widest mb-1.5">TTL (Time to Live)</label>
        <select 
          className="w-full h-10 px-3.5 bg-bgBase border border-borderBase rounded-sm text-textPrimary text-sm font-mono outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all mb-5" 
          value={expiry} 
          onChange={e => setExpiry(e.target.value)}
        >
          <option value="">Infinite</option>
          <option value="15">15 Minutes</option>
          <option value="60">1 Hour</option>
          <option value="1440">24 Hours</option>
        </select>
        
        <label className="flex items-center gap-3 cursor-pointer mb-6 p-3 border border-borderBase bg-bgBase rounded-sm hover:border-borderActive transition-colors">
          <input 
            type="checkbox" 
            checked={viewOnce} 
            onChange={e => setViewOnce(e.target.checked)} 
            className="w-4 h-4 rounded-sm text-accent focus:ring-accent bg-bgCard border-borderActive"
          />
          <div className="flex flex-col">
            <span className="text-sm text-textPrimary font-medium">Burn after reading</span>
            <span className="text-xs text-textSecondary font-mono mt-0.5">Auto-revoke on first access</span>
          </div>
        </label>
        
        <div className="flex gap-3 justify-end">
          <button 
            className="px-4 h-10 text-textSecondary hover:text-textPrimary hover:bg-bgHover rounded-sm text-sm transition-colors font-medium border border-transparent" 
            onClick={onClose}
          >
            Abort
          </button>
          <button 
            className="flex items-center gap-2 px-6 h-10 bg-accent hover:bg-accentHover text-white border border-accent rounded-sm text-sm font-medium transition-colors disabled:opacity-50" 
            onClick={handleCreate} 
            disabled={loading}
          >
            {loading ? <><span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Init...</> : <><Link2 size={14} /> Generate</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function QRModal({ room, onClose, onRevoke }: any) {
  const [countdown, setCountdown] = useState(() => timeLeft(room.expiresAt));
  const link = `${BASE_URL}/r/${room.token}`;

  useEffect(() => {
    if (!room.expiresAt) return;
    const id = setInterval(() => setCountdown(timeLeft(room.expiresAt)), 1000);
    return () => clearInterval(id);
  }, [room.expiresAt]);

  const copy = () => { navigator.clipboard.writeText(link); toast.success('Link copied'); };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-5 animate-fadeIn" onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-[360px] bg-bgCard border border-borderActive rounded-sm p-6 shadow-2xl flex flex-col items-center" 
        onClick={e => e.stopPropagation()}
      >
        <div className="w-full flex justify-between items-center mb-6 border-b border-borderBase pb-4">
          <span className="font-mono text-sm font-bold text-textPrimary flex items-center gap-2">
            <QrCode size={16} className="text-cyan-400"/> {room.token}
          </span>
          <button className="text-textSecondary hover:text-textPrimary p-1 rounded-sm hover:bg-bgHover transition-colors" onClick={onClose}><X size={16} /></button>
        </div>
        
        <div className="bg-white p-3 rounded-sm shadow-inner mb-6 border-4 border-bgBase">
          <QRCodeSVG value={link} size={180} bgColor="transparent" fgColor="#020617" level="M" />
        </div>
        
        <div className="w-full flex items-center justify-between bg-bgBase border border-borderBase p-2 rounded-sm mb-4">
          <code className="text-xs text-textSecondary truncate px-2 font-mono">{link}</code>
          <button className="p-1.5 text-textPrimary hover:bg-bgCard rounded-sm transition-colors shrink-0 border border-borderBase bg-bgCard" onClick={copy}><Copy size={14} /></button>
        </div>
        
        <div className="w-full flex gap-2">
          {countdown && (
            <div className="flex-1 flex items-center justify-center gap-1.5 p-2 bg-bgBase border border-borderBase rounded-sm text-xs text-textSecondary font-mono">
              <Timer size={12} className="text-amber-500" /> {countdown}
            </div>
          )}
          {room.viewOnce && (
            <div className="flex-1 flex items-center justify-center gap-1.5 p-2 bg-amber-500/10 border border-amber-500/20 rounded-sm text-xs text-amber-500 font-mono font-bold">
              <Eye size={12} /> BURN
            </div>
          )}
        </div>
        
        <button 
          className="w-full flex items-center justify-center gap-2 h-10 mt-6 border border-danger/30 text-danger hover:bg-danger/10 rounded-sm text-sm font-medium transition-colors" 
          onClick={onRevoke}
        >
          <Trash2 size={14} /> Kill Process
        </button>
      </motion.div>
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function UploadRow({ upload, onDelete }: any) {
  const isImg = upload.file_type?.startsWith('image/');
  const isExp = upload.expires_at && new Date(upload.expires_at) < new Date();
  const copy = () => { navigator.clipboard.writeText(upload.cloudinary_url); toast.success('URL copied'); };
  const dl = () => { const a = document.createElement('a'); a.href = upload.cloudinary_url; a.download = upload.file_name; a.click(); };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`group flex items-center gap-4 p-3 bg-bgBase border border-borderBase rounded-sm mb-2 transition-all hover:border-borderActive hover:bg-bgHover ${isExp ? 'opacity-50 grayscale' : ''}`}
    >
      <div className="w-10 h-10 shrink-0 bg-bgCard border border-borderBase rounded-sm flex items-center justify-center overflow-hidden">
        {isImg
          ? <img src={upload.cloudinary_url} alt={upload.file_name} className="w-full h-full object-cover" loading="lazy" />
          : <File size={20} className="text-cyan-400" />
        }
      </div>
      
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="font-mono text-sm font-medium text-textPrimary truncate mb-1" title={upload.file_name}>{upload.file_name}</div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-textGhost uppercase">
          <span>{new Date(upload.created_at).toISOString().split('T')[0]}</span>
          {upload.expires_at && !isExp && (
            <span className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-1.5 rounded-sm">
              <Timer size={10} /> {timeLeft(upload.expires_at)}
            </span>
          )}
          {isExp && <span className="text-danger bg-danger/10 px-1.5 rounded-sm">DEAD</span>}
        </div>
      </div>
      
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="p-2 text-textSecondary hover:text-cyan-400 hover:bg-bgCard rounded-sm transition-colors border border-transparent hover:border-borderBase" onClick={dl} title="Download"><Download size={14} /></button>
        <button className="p-2 text-textSecondary hover:text-textPrimary hover:bg-bgCard rounded-sm transition-colors border border-transparent hover:border-borderBase" onClick={copy} title="Copy URL"><Copy size={14} /></button>
        <button className="p-2 text-textSecondary hover:text-danger hover:bg-danger/10 hover:border-danger/20 rounded-sm transition-colors border border-transparent" onClick={() => onDelete(upload.id)} title="Delete"><Trash2 size={14} /></button>
      </div>
    </motion.div>
  );
}

function RoomRow({ room, onQR, onRevoke, onPermanentDelete, onChat }: any) {
  const [countdown, setCountdown] = useState(() => timeLeft(room.expires_at));
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef<any>(null);

  useEffect(() => {
    if (!room.expires_at || !room.is_active) return;
    const id = setInterval(() => setCountdown(timeLeft(room.expires_at)), 1000);
    return () => clearInterval(id);
  }, [room.expires_at, room.is_active]);

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

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      confirmTimer.current = setTimeout(() => setConfirmDelete(false), 2000);
    } else {
      clearTimeout(confirmTimer.current);
      setConfirmDelete(false);
      onPermanentDelete();
    }
  };

  const active = isRoomValid(room);

  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex items-center justify-between p-3 bg-bgBase border border-borderBase rounded-sm mb-2 transition-all hover:bg-bgHover hover:border-borderActive ${!active ? 'opacity-50 border-dashed' : ''}`}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-success animate-pulse' : 'bg-textGhost'}`} />
          <span className="font-mono text-sm font-semibold text-textPrimary tracking-widest">{room.token}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest">
          {room.view_once && <span className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-sm"><Eye size={10} /> BURN</span>}
          {active ? (
            countdown && <span className="flex items-center gap-1 text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded-sm"><Timer size={10} /> {countdown}</span>
          ) : (
            <span className="text-textGhost bg-bgCard px-1.5 py-0.5 border border-borderBase rounded-sm">KILLED</span>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-1">
        <button className="p-2 text-textSecondary hover:text-cyan-400 hover:bg-bgCard rounded-sm transition-colors border border-transparent hover:border-borderBase" onClick={onChat} title="Terminal"><MessageSquare size={14} /></button>
        {room.is_active && (
          <>
            <button className="p-2 text-textSecondary hover:text-textPrimary hover:bg-bgCard rounded-sm transition-colors border border-transparent hover:border-borderBase" onClick={onQR} title="QR"><QrCode size={14} /></button>
            <button
              className={`p-2 rounded-sm transition-colors border border-transparent ${confirmRevoke ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' : 'text-textSecondary hover:text-amber-500 hover:bg-amber-500/10 hover:border-amber-500/20'}`}
              onClick={handleRevoke}
              title={confirmRevoke ? 'Confirm Kill' : 'Kill Room'}
            >
              {confirmRevoke ? <span className="text-[10px] font-bold font-mono px-1">SURE?</span> : <X size={14} />}
            </button>
          </>
        )}
        <button
          className={`p-2 rounded-sm transition-colors border border-transparent ${confirmDelete ? 'text-danger bg-danger/10 border-danger/20' : 'text-textSecondary hover:text-danger hover:bg-danger/10 hover:border-danger/20'}`}
          onClick={handleDelete}
          title={confirmDelete ? 'Confirm Purge' : 'Purge DB'}
        >
          {confirmDelete ? <span className="text-[10px] font-bold font-mono px-1">PURGE?</span> : <Trash2 size={14} />}
        </button>
      </div>
    </motion.div>
  );
}

// ── MAIN DASHBOARD ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [uploads, setUploads] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [pendingFile, setPendingFile] = useState<any>(null);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [qrRoom, setQrRoom] = useState<any>(null);
  const [chatRoom, setChatRoom] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalUploads, setTotalUploads] = useState(0);
  const [pasteFlash, setPasteFlash] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { socket, joinRoom } = useSocket();
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [clientIp, setClientIp] = useState<string>('FETCHING...');

  useEffect(() => {
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => setClientIp(data.ip))
      .catch(() => setClientIp('UNKNOWN'));
  }, []);

  useEffect(() => {
    Promise.all([api.get(`/api/uploads?page=${page}`), api.get('/api/rooms')])
      .then(([u, r]) => {
        setUploads(u.data.uploads || []);
        setTotalUploads(u.data.total || 0);
        setRooms(r.data || []);
      })
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    if (!socket || !rooms.length) return;
    rooms.forEach(r => joinRoom(r.token));

    const onFile = (file: any) => {
      toast.success(`[SYS] Data packet in tunnel ${file.roomToken}`, { duration: 4000, style: { background: '#020617', color: '#10b981', border: '1px solid #10b981' } });
      if (file.roomToken) setRooms(prev => prev.filter(r => !(r.token === file.roomToken && r.view_once)));
    };
    const onMessage = (msg: any) => {
      if (chatRoom && msg.roomToken === chatRoom.token) {
        setChatMessages(prev => [...prev, msg]);
      }
      if (msg.sender === 'guest') toast(`[GUEST] ${msg.content?.slice(0,40) || 'uploaded payload'}`, { duration: 3000, style: { background: '#020617', color: '#06b6d4', border: '1px solid #06b6d4' } });
    };
    const onRevoked = ({ token }: any) => setRooms(prev => prev.map(r => r.token === token ? { ...r, is_active: false } : r));

    socket.on('new_file', onFile);
    socket.on('new_message', onMessage);
    socket.on('room_revoked', onRevoked);
    return () => { socket.off('new_file', onFile); socket.off('new_message', onMessage); socket.off('room_revoked', onRevoked); };
  }, [socket, rooms, chatRoom, joinRoom]);

  useEffect(() => {
    const handle = (e: ClipboardEvent) => {
      const img = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
      if (!img) return;
      const file = img.getAsFile();
      if (!file) return;
      setPasteFlash(true);
      setTimeout(() => setPasteFlash(false), 350);
      const defaultName = `dump_${new Date().getTime().toString(16).toUpperCase()}`;
      setPendingFile({ file, defaultName });
    };
    window.addEventListener('paste', handle);
    return () => window.removeEventListener('paste', handle);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    maxSize: 20 * 1024 * 1024,
    onDropAccepted: ([file]) => setPendingFile({ file, defaultName: file.name.replace(/\.[^/.]+$/, '') }),
    onDropRejected: () => toast.error('ERR: Max 20MB allowed'),
  });

  const handleSaveLocal = (name: string) => {
    const { file } = pendingFile;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    const ext = file.name.split('.').pop() || 'png';
    a.href = url;
    a.download = `${name}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setPendingFile(null);
    toast.success('Written to local FS');
  };

  const handleUpload = useCallback(async (name: string, expiresIn: string) => {
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
      toast.success('Deployed. URL copied.');
      const uRes = await api.get('/api/uploads?page=1');
      setUploads(uRes.data.uploads || []); setTotalUploads(uRes.data.total || 0); setPage(1);
    } catch { toast.error('Deploy failed'); }
    finally { setUploading(false); setTimeout(() => setUploadProgress(false), 800); }
  }, [pendingFile]);

  const handleDelete = async (id: string) => {
    if (!confirm('Purge asset?')) return;
    try { await api.delete(`/api/uploads/${id}`); setUploads(prev => prev.filter(u => u.id !== id)); toast.success('Purged'); }
    catch { toast.error('Purge failed'); }
  };

  const handleRevoke = async (token: string) => {
    try {
      await api.delete(`/api/rooms/${token}`);
      setRooms(prev => prev.map(r => r.token === token ? { ...r, is_active: false } : r));
      if (qrRoom?.token === token) setQrRoom(null);
      toast.success('Tunnel closed');
    } catch { toast.error('Close failed'); }
  };

  const handlePermanentDelete = async (token: string) => {
    try {
      await api.delete(`/api/rooms/${token}/permanent`);
      setRooms(prev => prev.filter(r => r.token !== token));
      if (qrRoom?.token === token) setQrRoom(null);
      if (chatRoom?.token === token) setChatRoom(null);
      toast.success('Data wiped');
    } catch { toast.error('Wipe failed'); }
  };

  const openChat = async (room: any) => {
    setChatRoom(room);
    setChatLoading(true);
    try {
      const res = await api.get(`/api/rooms/${room.token}/messages`);
      setChatMessages(res.data || []);
    } catch { toast.error('Failed to init terminal'); }
    finally { setChatLoading(false); }
    joinRoom(room.token);
  };

  const handleOwnerSendText = async (text: string) => {
    if (!chatRoom) return;
    try {
      const res = await api.post(`/api/rooms/${chatRoom.token}/messages/text`, { content: text, sender: 'owner' });
      setChatMessages(prev => [...prev, res.data]);
    } catch { toast.error('TX failed'); }
  };

  const handleOwnerSendFile = async (file: File) => {
    if (!chatRoom) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('sender', 'owner');
    fd.append('fileName', file.name);
    try {
      const res = await api.post(`/api/rooms/${chatRoom.token}/messages/file`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setChatMessages(prev => [...prev, res.data]);
    } catch { toast.error('TX failed'); }
  };

  const handleDeleteMessage = async (id: string) => {
    try { await api.delete(`/api/rooms/${chatRoom.token}/messages/${id}`); setChatMessages(prev => prev.filter(m => m.id !== id)); }
    catch { toast.error('RM failed'); }
  };

  const totalPages = Math.ceil(totalUploads / 10);

  return (
    <div className="flex h-screen w-full bg-bgBase text-textPrimary overflow-hidden font-ui selection:bg-cyan-500/30">
      
      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex static top-0 left-0 h-full bg-bgCard border-borderBase flex-col z-50 transition-all duration-300 overflow-hidden ${desktopSidebarOpen ? 'w-64 border-r' : 'w-0 border-r-0'}`}>
        <div className="p-5 border-b border-borderBase flex items-center justify-between shrink-0 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <GhostLogo className="text-accent w-6 h-6 shrink-0" />
            <div>
              <div className="font-display font-bold text-sm tracking-wide">GhostVault</div>
              <div className="text-[9px] text-cyan-400 font-mono uppercase tracking-widest">Sec_Ops Console</div>
            </div>
          </div>
          <button onClick={() => setDesktopSidebarOpen(false)} className="text-textSecondary hover:text-textPrimary transition-colors" title="Collapse Sidebar">
            <Menu size={18} />
          </button>
        </div>
        
        <div className="flex-1 p-3 space-y-1.5 overflow-y-auto whitespace-nowrap">
          <div className="text-[10px] text-textGhost uppercase font-mono tracking-widest font-bold px-3 py-3">Core Modules</div>
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-sm border transition-colors ${activeTab === 'dashboard' ? 'bg-accent/10 text-accent border-accent/20' : 'text-textSecondary hover:text-textPrimary hover:bg-bgHover border-transparent'}`}>
            <Activity size={16} /> Dashboard
          </button>
          <button onClick={() => setActiveTab('assets')} className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-sm border transition-colors ${activeTab === 'assets' ? 'bg-accent/10 text-accent border-accent/20' : 'text-textSecondary hover:text-textPrimary hover:bg-bgHover border-transparent'}`}>
            <FolderLock size={16} /> Asset Store
          </button>
          <button onClick={() => setActiveTab('nodes')} className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-sm border transition-colors ${activeTab === 'nodes' ? 'bg-accent/10 text-accent border-accent/20' : 'text-textSecondary hover:text-textPrimary hover:bg-bgHover border-transparent'}`}>
            <Database size={16} /> DB Nodes
          </button>
          <button onClick={() => setActiveTab('logs')} className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-sm border transition-colors ${activeTab === 'logs' ? 'bg-accent/10 text-accent border-accent/20' : 'text-textSecondary hover:text-textPrimary hover:bg-bgHover border-transparent'}`}>
            <Code size={16} /> Raw Logs
          </button>
        </div>
        
        <div className="p-4 border-t border-borderBase bg-bgBase/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-sm bg-bgCard flex items-center justify-center border border-borderActive text-cyan-400 font-mono text-sm font-bold shrink-0">
              {user?.email?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono font-medium truncate text-textPrimary">{user?.email}</div>
              <div className="text-[10px] text-success font-mono flex items-center gap-1 mt-0.5"><ShieldAlert size={10}/> Auth Valid</div>
            </div>
          </div>
          <button onClick={logout} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-mono font-bold rounded-sm border border-danger/30 text-danger hover:bg-danger hover:text-white transition-colors uppercase tracking-wider">
            <LogOut size={14} /> Kill Session
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Sheet Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <div className="md:hidden fixed inset-0 z-[100]">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div 
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute bottom-0 left-0 right-0 bg-bgCard border-t border-borderBase rounded-t-3xl p-6 flex flex-col pb-safe-bottom shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-borderActive rounded-full mx-auto mb-8 opacity-50" />
              
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center border border-accent/20 text-accent font-display text-lg font-bold shrink-0">
                  {user?.email?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold truncate text-textPrimary font-display">{user?.email}</div>
                  <div className="text-[10px] text-success font-mono flex items-center gap-1 mt-1 uppercase tracking-wider font-bold"><ShieldAlert size={12}/> Sec_Ops Admin</div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-8">
                <button onClick={() => { setActiveTab('dashboard'); setSidebarOpen(false); }} className={`flex flex-col items-center justify-center gap-3 p-3 rounded-2xl transition-colors ${activeTab === 'dashboard' ? 'bg-accent/10 text-accent' : 'bg-bgBase text-textSecondary hover:text-textPrimary border border-borderBase'}`}>
                  <Activity size={24} />
                  <span className="text-[10px] font-bold">Dash</span>
                </button>
                <button onClick={() => { setActiveTab('assets'); setSidebarOpen(false); }} className={`flex flex-col items-center justify-center gap-3 p-3 rounded-2xl transition-colors ${activeTab === 'assets' ? 'bg-accent/10 text-accent' : 'bg-bgBase text-textSecondary hover:text-textPrimary border border-borderBase'}`}>
                  <FolderLock size={24} />
                  <span className="text-[10px] font-bold">Assets</span>
                </button>
                <button onClick={() => { setActiveTab('nodes'); setSidebarOpen(false); }} className={`flex flex-col items-center justify-center gap-3 p-3 rounded-2xl transition-colors ${activeTab === 'nodes' ? 'bg-accent/10 text-accent' : 'bg-bgBase text-textSecondary hover:text-textPrimary border border-borderBase'}`}>
                  <Database size={24} />
                  <span className="text-[10px] font-bold">Nodes</span>
                </button>
                <button onClick={() => { setActiveTab('logs'); setSidebarOpen(false); }} className={`flex flex-col items-center justify-center gap-3 p-3 rounded-2xl transition-colors ${activeTab === 'logs' ? 'bg-accent/10 text-accent' : 'bg-bgBase text-textSecondary hover:text-textPrimary border border-borderBase'}`}>
                  <Code size={24} />
                  <span className="text-[10px] font-bold">Logs</span>
                </button>
              </div>

              <div className="flex gap-3">
                <button onClick={() => { toggleTheme(); setSidebarOpen(false); }} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border border-borderBase bg-bgBase text-textSecondary hover:text-textPrimary transition-colors text-sm font-bold">
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />} Theme
                </button>
                <button onClick={logout} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-danger/10 text-danger hover:bg-danger hover:text-white transition-colors text-sm font-bold">
                  <LogOut size={18} /> Kill Session
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-bgBase">
        {uploadProgress && <div className="absolute top-0 left-0 right-0 h-0.5 bg-cyan-400 z-50 animate-glowPulse" />}

        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-20 pt-safe-top md:pb-8">
          
          {/* Dashboard Header */}
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end mb-8 gap-6 relative">
            <div className="w-full flex justify-between items-start xl:w-auto xl:justify-start">
              <div>
                <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
                  {!desktopSidebarOpen && (
                    <button onClick={() => setDesktopSidebarOpen(true)} className="hidden md:flex items-center justify-center text-textSecondary hover:text-textPrimary transition-colors" title="Expand Sidebar">
                      <Menu size={24} />
                    </button>
                  )}
                  <GhostLogo className="text-cyan-400 w-7 h-7 shrink-0" /> Command Center
                </h1>
                <div className="text-textSecondary text-xs md:text-sm font-mono flex items-center gap-3 bg-bgCard border border-borderBase px-3 py-1.5 rounded-sm inline-flex">
                  <span className="text-success flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"/> SYS_ONLINE</span>
                  <span className="text-borderActive">|</span>
                  <span>NODE: {user?.email?.split('@')[0]}</span>
                  <span className="text-borderActive hidden sm:inline">|</span>
                  <span className="hidden sm:inline">IP: {clientIp}</span>
                </div>
              </div>
              <button onClick={toggleTheme} className="xl:hidden w-10 h-10 flex items-center justify-center shrink-0 rounded-sm border border-borderBase bg-bgCard text-textSecondary hover:text-textPrimary hover:bg-bgHover transition-colors" title="Toggle Theme">
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>
            
            <div className="flex gap-3 overflow-x-auto w-full xl:w-auto snap-x pb-2 xl:pb-0 scrollbar-hide items-end">
              <button onClick={toggleTheme} className="hidden xl:flex w-12 h-12 items-center justify-center shrink-0 rounded-sm border border-borderBase bg-bgCard text-textSecondary hover:text-textPrimary hover:bg-bgHover transition-colors mb-0 mr-4" title="Toggle Theme">
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <div className="snap-center shrink-0 bg-bgCard border border-borderBase p-3 px-5 rounded-sm flex flex-col shadow-sm min-w-[140px]">
                <span className="text-[10px] text-textGhost font-mono uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5"><Link2 size={12}/> Active Tunnels</span>
                <span className="font-mono text-2xl font-bold text-cyan-400">{rooms.filter(isRoomValid).length}</span>
              </div>
              <div className="snap-center shrink-0 bg-bgCard border border-borderBase p-3 px-5 rounded-sm flex flex-col shadow-sm min-w-[140px]">
                <span className="text-[10px] text-textGhost font-mono uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5"><File size={12}/> Encrypted Assets</span>
                <span className="font-mono text-2xl font-bold text-amber-500">{totalUploads}</span>
              </div>
            </div>
          </div>

          {/* Paste Zone */}
          <div 
            {...getRootProps()} 
            className={`w-full h-20 md:h-24 flex items-center justify-center rounded-sm mb-8 cursor-pointer transition-all duration-200 border-2 border-dashed bg-bgCard ${isDragActive ? 'border-accent bg-accent/5' : 'border-borderActive hover:border-textSecondary'} ${pasteFlash ? 'bg-white/10' : ''}`}
          >
            <input {...getInputProps()} />
            <div className="flex items-center gap-3 text-textSecondary text-xs md:text-sm font-mono z-10 pointer-events-none">
              {uploading
                ? <><span className="w-4 h-4 border-2 border-textSecondary border-t-accent rounded-full animate-spin" /> EXECUTING_UPLOAD...</>
                : isDragActive
                  ? <><Upload size={16} className="text-accent animate-bounce" /><span className="text-accent font-bold">DEPLOY_PAYLOAD</span></>
                  : <><Clipboard size={14} className="text-textGhost" /><span><kbd className="px-1.5 py-0.5 bg-bgBase border border-borderBase rounded-sm text-[10px] text-textPrimary">CTRL+V</kbd> PASTE PAYLOAD OR DRAG_AND_DROP</span></>
              }
            </div>
          </div>

          {activeTab === 'logs' && (
            <div className="flex flex-col items-center justify-center py-20 border border-dashed border-borderBase rounded-sm text-textGhost">
              <Code size={32} className="mb-3 opacity-50" />
              <span className="font-mono text-xs uppercase tracking-widest">NO_LOG_DATA_FOUND</span>
            </div>
          )}

          <div className={`grid grid-cols-1 ${activeTab === 'dashboard' ? 'xl:grid-cols-[1.5fr_1fr]' : ''} gap-6 items-start`}>
            
            {/* File Manager (Replaces Gallery) */}
            {(activeTab === 'dashboard' || activeTab === 'assets') && (
            <section className="bg-bgCard border border-borderBase rounded-sm shadow-md flex flex-col">
              <div className="p-4 border-b border-borderBase flex items-center justify-between bg-bgBase/50">
                <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-textPrimary flex items-center gap-2">
                  <Database size={16} className="text-textSecondary" /> Secure File Manager
                </h2>
                <span className="text-[10px] font-mono text-textGhost border border-borderBase bg-bgCard px-2 py-0.5 rounded-sm">{totalUploads} ITEMS</span>
              </div>
              
              <div className="p-4 flex-1">
                {loading
                  ? <div className="space-y-2">
                      {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-bgBase border border-borderBase rounded-sm animate-pulse" />)}
                    </div>
                  : uploads.length === 0
                    ? <div className="flex flex-col items-center justify-center h-32 border border-dashed border-borderBase rounded-sm text-textGhost">
                        <span className="font-mono text-xs uppercase tracking-widest">NO_DATA_FOUND</span>
                      </div>
                    : <div className="flex flex-col">
                        <AnimatePresence>
                          {uploads.map(u => <UploadRow key={u.id} upload={u} onDelete={handleDelete} />)}
                        </AnimatePresence>
                      </div>
                }
              </div>
              
              {totalPages > 1 && (
                <div className="p-3 border-t border-borderBase bg-bgBase/50 flex items-center justify-between">
                  <button 
                    className="p-1.5 rounded-sm bg-bgCard border border-borderBase text-textSecondary hover:text-textPrimary hover:border-borderActive disabled:opacity-30 transition-colors" 
                    disabled={page===1} 
                    onClick={() => setPage(p=>p-1)}
                  >
                    <ChevronLeft size={14}/>
                  </button>
                  <span className="text-[10px] font-mono font-bold text-textSecondary uppercase tracking-widest">PG {page} / {totalPages}</span>
                  <button 
                    className="p-1.5 rounded-sm bg-bgCard border border-borderBase text-textSecondary hover:text-textPrimary hover:border-borderActive disabled:opacity-30 transition-colors" 
                    disabled={page===totalPages} 
                    onClick={() => setPage(p=>p+1)}
                  >
                    <ChevronRight size={14}/>
                  </button>
                </div>
              )}
            </section>
            )}

            {/* DB Orchestrator / Links (Replaces Rooms) */}
            {(activeTab === 'dashboard' || activeTab === 'nodes') && (
            <section className="bg-bgCard border border-borderBase rounded-sm shadow-md flex flex-col">
              <div className="p-4 border-b border-borderBase flex items-center justify-between bg-bgBase/50">
                <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-textPrimary flex items-center gap-2">
                  <Activity size={16} className="text-textSecondary" /> Network Tunnels
                </h2>
                <button 
                  className="flex items-center gap-1.5 h-7 px-2.5 rounded-sm bg-accent/10 text-accent hover:bg-accent hover:text-white border border-accent/20 transition-colors text-[10px] font-bold uppercase tracking-widest" 
                  onClick={() => setShowCreateRoom(true)}
                >
                  <Plus size={12} /> INIT
                </button>
              </div>
              
              <div className="p-4">
                <div className="text-[10px] font-mono font-bold text-textGhost uppercase tracking-widest mb-3 border-b border-borderBase pb-2">Active Connections</div>
                
                {rooms.filter(isRoomValid).length === 0
                  ? <div className="flex flex-col items-center justify-center py-6 border border-dashed border-borderBase rounded-sm text-textGhost mb-6">
                      <span className="font-mono text-xs uppercase tracking-widest">NO_ACTIVE_TUNNELS</span>
                    </div>
                  : <div className="flex flex-col mb-6">
                      <AnimatePresence>
                        {rooms.filter(isRoomValid).map(r => (
                          <RoomRow key={r.id} room={r}
                            onQR={() => setQrRoom({ token: r.token, expiresAt: r.expires_at, view_once: r.view_once })}
                            onRevoke={() => handleRevoke(r.token)}
                            onPermanentDelete={() => handlePermanentDelete(r.token)}
                            onChat={() => openChat(r)}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                }

                <div className="text-[10px] font-mono font-bold text-textGhost uppercase tracking-widest mb-3 border-b border-borderBase pb-2 mt-2">Log History</div>
                
                {rooms.filter(r => !isRoomValid(r)).length === 0
                  ? <div className="py-4 text-center"><span className="text-[10px] font-mono text-textGhost uppercase tracking-widest">Logs empty</span></div>
                  : <div className="flex flex-col">
                      <AnimatePresence>
                        {rooms.filter(r => !isRoomValid(r)).map(r => (
                          <RoomRow key={r.id} room={r}
                            onChat={() => openChat(r)}
                            onPermanentDelete={() => handlePermanentDelete(r.token)}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                }
              </div>
            </section>
            )}
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden absolute bottom-0 left-0 right-0 h-16 bg-bgCard border-t border-borderBase flex items-center justify-around z-40 pb-safe-bottom">
          <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${activeTab === 'dashboard' ? 'text-accent' : 'text-textSecondary hover:text-textPrimary'}`}>
            <Activity size={20} />
            <span className="text-[9px] font-mono mt-1 font-bold tracking-widest uppercase">Dash</span>
          </button>
          <button onClick={() => setActiveTab('assets')} className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${activeTab === 'assets' ? 'text-accent' : 'text-textSecondary hover:text-textPrimary'}`}>
            <FolderLock size={20} />
            <span className="text-[9px] font-mono mt-1 font-bold tracking-widest uppercase">Assets</span>
          </button>
          <button onClick={() => setActiveTab('nodes')} className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${activeTab === 'nodes' ? 'text-accent' : 'text-textSecondary hover:text-textPrimary'}`}>
            <Database size={20} />
            <span className="text-[9px] font-mono mt-1 font-bold tracking-widest uppercase">Nodes</span>
          </button>
          <button onClick={() => setSidebarOpen(true)} className="flex flex-col items-center justify-center w-16 h-full text-textSecondary hover:text-textPrimary transition-colors">
            <Menu size={20} />
            <span className="text-[9px] font-mono mt-1 font-bold tracking-widest uppercase">More</span>
          </button>
        </nav>
      </main>

      {/* Modals */}
      <AnimatePresence>
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
            onCreate={(r: any) => { setRooms(prev => [{ ...r, is_active: true }, ...prev]); setQrRoom({ token: r.token, expiresAt: r.expiresAt, viewOnce: r.viewOnce }); }}
            onClose={() => setShowCreateRoom(false)}
          />
        )}
        {qrRoom && (
          <QRModal room={qrRoom} onClose={() => setQrRoom(null)} onRevoke={() => { handleRevoke(qrRoom.token); setQrRoom(null); }} />
        )}
      </AnimatePresence>

      {/* Terminal / Chat Panel */}
      <AnimatePresence>
        {chatRoom && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150]" 
              onClick={() => setChatRoom(null)} 
            />
            <motion.div 
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-safe-top right-0 bottom-safe-bottom w-full sm:w-[480px] max-w-full bg-bgBase border-l border-borderActive shadow-2xl z-[200] flex flex-col font-mono"
            >
              <div className="p-4 border-b border-borderBase flex items-center justify-between bg-bgCard">
                <div className="flex items-center gap-3">
                  <Terminal size={18} className="text-cyan-400" />
                  <span className="text-cyan-400 font-bold tracking-wider text-sm">{chatRoom.token}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-bgBase bg-cyan-400 px-1.5 py-0.5 rounded-sm">TTY</span>
                </div>
                <button className="p-1.5 text-textSecondary hover:text-textPrimary hover:bg-bgHover border border-transparent hover:border-borderBase rounded-sm transition-colors" onClick={() => setChatRoom(null)}>
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col bg-[#020617]">
                <ChatWindow
                  messages={chatMessages}
                  onSendText={handleOwnerSendText}
                  onSendFile={handleOwnerSendFile}
                  onDelete={handleDeleteMessage}
                  canDelete={true}
                  loading={chatLoading}
                  myRole="owner"
                  disabled={!isRoomValid(chatRoom)}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
