import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import JSZip from 'jszip';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../lib/api';
import ChatWindow from '../components/ChatWindow';
import ErrorBoundary from '../components/ErrorBoundary';
import { useConfirmAction } from '../hooks/useConfirmAction';
import useDialogAccessibility from '../hooks/useDialogAccessibility';
import {
  Clipboard, Upload, Trash2, Download, Copy, Link2,
  Plus, QrCode, X, Check, Timer, Eye, Info,
  File, Image as ImageIcon, ChevronLeft, ChevronRight, ChevronDown, HardDriveDownload, MessageSquare, Search,
  Terminal, ShieldAlert, Activity, Database, Server, FolderLock, Menu, LogOut, Code, Cpu, Sun, Moon, Ghost, Home,
  Bug, Pencil, Zap, RefreshCw, MailOpen, Pause, Play, MoreVertical, Globe, Lock, ShieldCheck, BookOpen
} from 'lucide-react';
import GhostLogo from '../components/GhostLogo';
import { copyToClipboard } from '../utils/clipboard';
import { isFileSystemAccessSupported, selectDownloadDirectory, getDownloadDirectory, verifyPermission, saveFileToDirectory, clearDownloadDirectory } from '../utils/fsAccess';

const BASE_URL = window.location.origin;

// ── Types ─────────────────────────────────────────────────────────────────────
type Room = any;
type UploadedFile = any;

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeLeft(expiresAt: string | null, pausedRemainingSeconds?: number | null) {
  if (pausedRemainingSeconds != null) {
    const s = pausedRemainingSeconds;
    if (s < 60) return `${s}s (Paused)`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s (Paused)`;
    return `${Math.floor(m / 60)}h ${m % 60}m (Paused)`;
  }

  if (!expiresAt) return 'Infinite';
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
  const dialogRef = useDialogAccessibility(onCancel);
  const [name, setName] = useState(defaultName);
  const [expiry, setExpiry] = useState('');

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[10000] p-5 animate-fadeIn" onClick={onCancel}>
      <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Save file" tabIndex={-1}
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

        <label className="block text-xs font-ui text-textGhost  mb-1.5">Filename</label>
        <input
          className="w-full h-10 px-3.5 bg-bgBase border border-borderBase rounded-sm text-textPrimary text-sm font-ui outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-accent mb-4"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
          autoFocus
        />

        <label className="block text-xs font-ui text-textGhost  mb-1.5">
          Cloud Expiry
        </label>
        <select
          className="w-full h-10 px-3.5 bg-bgBase border border-borderBase rounded-sm text-textPrimary text-sm font-ui outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all mb-6"
          value={expiry}
          onChange={e => setExpiry(e.target.value)}
        >
          <option value="">Persistent</option>
          <option value="1440">24 Hours</option>
          <option value="10080">7 Days</option>
          <option value="43200">30 Days</option>
          <option value="burn">Burn After Reading 🔥</option>
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

function CreateRoomModal({ onCreate, onClose, initialVisibility = 'shared' }: any) {
  const dialogRef = useDialogAccessibility(onClose);
  // Options: 'shared_live' (default), 'personal_saved', 'api_project', 'shared_paused'
  const [roomMode, setRoomMode] = useState(
    initialVisibility === 'api' ? 'api_project' :
    initialVisibility === 'personal' ? 'personal_saved' : 'shared_live'
  );
  const [note, setNote] = useState('');
  const [discordUrl, setDiscordUrl] = useState('');
  const [allowedOrigins, setAllowedOrigins] = useState('');
  const [expiry, setExpiry] = useState('60'); // default 1 hour for public tunnels
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (roomMode === 'api_project') {
        const rawSlug = note.trim();
        if (!rawSlug) {
          toast.error('Please enter a project name/slug.');
          setLoading(false);
          return;
        }
        const slug = rawSlug.toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 48);
        const res = await api.post('/api/rooms', {
          visibility: 'api',
          isPaused: false,
          note: slug,
          customToken: slug,
          discord_webhook_url: discordUrl.trim() || null,
          allowed_origins: allowedOrigins.trim() || null,
        });
        onCreate(res.data);
        onClose();
        return;
      }

      const isPaused = roomMode === 'shared_paused' || roomMode === 'personal_saved';
      const visibility = roomMode === 'personal_saved' ? 'personal' : 'shared';

      const res = await api.post('/api/rooms', {
        visibility,
        isPaused,
        note: note.trim(),
        ...(visibility === 'shared' && expiry ? { expiresInMinutes: Number(expiry) } : {}),
      });

      onCreate(res.data);
      onClose();
    } catch (err: any) { 
      toast.error(err.response?.data?.error || err.message || 'Could not create room'); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div className="modal-overlay" onClick={() => { if (!loading) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-label="New Room" tabIndex={-1} className="modal-card" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-semibold mb-1">
          {roomMode === 'api_project' ? '⚡ New Developer API Project' : 'Create Tunnel or Saved Notes'}
        </h2>
        <p className="text-sm text-textSecondary mb-5">
          {roomMode === 'api_project' 
            ? 'Create an inbound webhook feed for bug reports, form feedback, or service alerts.'
            : 'Open a live public tunnel for someone, save private notes, or connect an API.'}
        </p>

        {/* ── Mode Selection Cards ── */}
        <div className="flex flex-col gap-2 mb-5" role="radiogroup" aria-label="Room access mode">
          <label 
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
              roomMode === 'shared_live' 
                ? 'border-accent bg-accent/10 shadow-sm' 
                : 'border-borderBase hover:bg-bgHover'
            }`}
          >
            <input 
              type="radio" 
              name="roomMode" 
              className="mt-1 accent-emerald-500"
              checked={roomMode === 'shared_live'} 
              onChange={() => setRoomMode('shared_live')} 
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-textPrimary">🌐 Public Live Tunnel</span>
                <span className="badge badge-green text-[10px] py-0 px-1.5 font-bold">Default</span>
              </div>
              <p className="text-xs text-textSecondary mt-0.5">Disposable link for fast guest file drop & chat.</p>
            </div>
          </label>

          <label 
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
              roomMode === 'personal_saved' 
                ? 'border-accent bg-accent/10 shadow-sm' 
                : 'border-borderBase hover:bg-bgHover'
            }`}
          >
            <input 
              type="radio" 
              name="roomMode" 
              className="mt-1 accent-emerald-500"
              checked={roomMode === 'personal_saved'} 
              onChange={() => setRoomMode('personal_saved')} 
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-textPrimary">🔒 Private Saved Notes</span>
                <span className="badge badge-cyan text-[10px] py-0 px-1.5 font-bold">Private</span>
              </div>
              <p className="text-xs text-textSecondary mt-0.5">Private scratchpad across your logged-in devices.</p>
            </div>
          </label>

          <label 
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
              roomMode === 'api_project' 
                ? 'border-accent bg-accent/10 shadow-sm' 
                : 'border-borderBase hover:bg-bgHover'
            }`}
          >
            <input 
              type="radio" 
              name="roomMode" 
              className="mt-1 accent-emerald-500"
              checked={roomMode === 'api_project'} 
              onChange={() => setRoomMode('api_project')} 
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-textPrimary">⚡ API Webhook Feed</span>
                <span className="badge badge-green text-[10px] py-0 px-1.5 font-bold">Developer</span>
              </div>
              <p className="text-xs text-textSecondary mt-0.5">Inbound webhook endpoint for side projects, bugs, or forms.</p>
            </div>
          </label>

          <label 
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
              roomMode === 'shared_paused' 
                ? 'border-accent bg-accent/10 shadow-sm' 
                : 'border-borderBase hover:bg-bgHover'
            }`}
          >
            <input 
              type="radio" 
              name="roomMode" 
              className="mt-1 accent-emerald-500"
              checked={roomMode === 'shared_paused'} 
              onChange={() => setRoomMode('shared_paused')} 
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-textPrimary">⏸️ Shared Tunnel (Start Paused)</span>
              </div>
              <p className="text-xs text-textSecondary mt-0.5">Preps the link in advance; guests locked out until resumed.</p>
            </div>
          </label>
        </div>

        <label htmlFor="chat-name" className="block text-sm font-medium mb-1.5 text-textPrimary">
          {roomMode === 'api_project' ? 'Project Name / Ingestion Slug' : roomMode === 'personal_saved' ? 'Topic / Note Name' : 'Tunnel Purpose / Name'}
        </label>
        <input 
          id="chat-name" 
          className="input mb-3" 
          value={note} 
          maxLength={120} 
          onChange={e => setNote(e.target.value)} 
          placeholder={roomMode === 'api_project' ? 'e.g. dodo, portfolio-bugs, feedback' : roomMode === 'personal_saved' ? 'e.g. Personal reading list, API keys…' : 'e.g. Client file drop, Class assignment…'} 
          disabled={loading} 
        />

        {roomMode === 'api_project' && (
          <>
            <label htmlFor="chat-discord" className="block text-xs font-medium mb-1.5 text-textGhost">
              Discord Webhook Relay <span className="text-textGhost">(optional — forwards alerts to Discord)</span>
            </label>
            <input 
              id="chat-discord" 
              className="input mb-3 text-xs" 
              value={discordUrl} 
              onChange={e => setDiscordUrl(e.target.value)} 
              placeholder="https://discord.com/api/webhooks/..." 
              disabled={loading} 
            />

            <label htmlFor="chat-origins" className="block text-xs font-medium mb-1.5 text-textGhost">
              Allowed CORS Origins <span className="text-textGhost">(optional — browser protection whitelist)</span>
            </label>
            <input 
              id="chat-origins" 
              className="input mb-3 text-xs font-mono" 
              value={allowedOrigins} 
              onChange={e => setAllowedOrigins(e.target.value)} 
              placeholder="e.g. https://myportfolio.com, http://localhost:5173" 
              disabled={loading} 
            />
            <p className="text-[10px] text-textGhost -mt-2 mb-3">Leave empty for public access, or enter comma-separated domains to block other websites.</p>

            <div className="p-2.5 rounded bg-bgBase border border-borderBase text-[11px] text-textSecondary mb-2">
              <strong className="text-accent block mb-0.5">Direct Endpoint:</strong>
              <code>POST /api/ingest/{note.trim() ? note.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 48) : ':slug'}</code>
            </div>
          </>
        )}

        {roomMode !== 'personal_saved' && roomMode !== 'api_project' && (
          <>
            <label htmlFor="chat-expiry" className="block text-sm font-medium mb-1.5 text-textPrimary">Tunnel Auto-Expiry</label>
            <select id="chat-expiry" className="input mb-4" value={expiry} onChange={e => setExpiry(e.target.value)} disabled={loading}>
              <option value="15">In 15 minutes</option>
              <option value="60">In 1 hour (Recommended)</option>
              <option value="1440">In 24 hours</option>
              <option value="10080">In 7 days</option>
              <option value="">No expiry (Until revoked)</option>
            </select>
          </>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button className="btn btn-secondary" disabled={loading} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading} onClick={handleCreate}>
            {loading ? 'Creating…' : roomMode === 'api_project' ? 'Create Project Feed' : roomMode === 'personal_saved' ? 'Create Saved Notes' : roomMode === 'shared_paused' ? 'Create Paused Tunnel' : 'Create Live Tunnel'}
          </button>
        </div>
      </section>
    </div>
  );
}

// ── Edit Room Modal ───────────────────────────────────────────────────────────
function EditRoomModal({ room, onClose, onUpdated, onVisibilityChange }: any) {
  const dialogRef = useDialogAccessibility(onClose);
  const [note, setNote] = useState(room.note || '');
  const [webhookUrl, setWebhookUrl] = useState(room.discord_webhook_url || '');
  const [allowedOrigins, setAllowedOrigins] = useState(room.allowed_origins || '');
  const [extendOption, setExtendOption] = useState('');
  const [isActive, setIsActive] = useState(room.is_active);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const body: any = { 
        note, 
        discord_webhook_url: webhookUrl.trim() || null,
        allowed_origins: allowedOrigins.trim() || null,
      };
      if (!isActive && room.is_active) {
        body.isActive = false;
      } else if (isActive && !room.is_active) {
        body.isActive = true;
        // Also ensure expiry is in the future
        if (room.expires_at && new Date(room.expires_at) < new Date()) {
          body.clearExpiry = true; // Reactivating an expired room — clear TTL
        }
      }
      if (extendOption === 'infinite') {
        body.clearExpiry = true;
      } else if (extendOption === '30') {
        body.addMinutes = 30;
      } else if (extendOption === '60') {
        body.addMinutes = 60;
      } else if (extendOption === '120') {
        body.addMinutes = 120;
      } else if (extendOption === '1440') {
        body.addMinutes = 1440;
      }
      const res = await api.patch(`/api/rooms/${room.token}`, body);
      toast.success('Tunnel updated');
      onUpdated(res.data.room);
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const active = isRoomValid(room);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[10000] p-5 animate-fadeIn" onClick={onClose}>
      <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Edit tunnel" tabIndex={-1}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-[400px] bg-bgCard border border-borderActive rounded-sm p-7 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="font-display text-lg font-bold text-textPrimary mb-1 tracking-tight flex items-center gap-2">
          <Pencil size={16} className="text-accent" /> {room.visibility === 'api' ? '⚡ Edit API Project Feed' : 'Edit Tunnel'}
        </div>
        <div className="font-ui text-xs text-accent mb-6 font-mono">
          {room.visibility === 'api' ? `/api/ingest/${room.note || room.token}` : `/r/${room.token}`}
        </div>

        <div className="access-settings mb-5">
          <strong>
            {room.visibility === 'api' 
              ? '⚡ Developer API Project · webhook feed' 
              : room.visibility === 'personal' 
              ? '🔒 Personal Saved Notes · only you' 
              : '🌐 Shared Tunnel · anyone with the link'}
          </strong>
          <p>
            {room.visibility === 'api' 
              ? 'Accepts incoming JSON telemetry from your external apps.' 
              : 'Sharing applies to every message and upload in this room.'}
          </p>
          {room.visibility !== 'api' && (
            <button className="btn btn-secondary" onClick={() => { onClose(); onVisibilityChange(room); }}>
              {room.visibility === 'personal' ? 'Make Public Tunnel…' : 'Make Personal Notes…'}
            </button>
          )}
        </div>
        <label className="block text-xs font-ui text-textGhost  mb-1.5">
          {room.visibility === 'api' ? 'Project Slug / Name' : 'Note / Purpose'}
        </label>
        <input
          className="w-full h-10 px-3.5 bg-bgBase border border-borderBase rounded-sm text-textPrimary text-sm font-ui outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all mb-5"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={room.visibility === 'api' ? 'e.g. dodo, bugs' : 'e.g. For John - Invoice'}
        />

        {/* ── Ingestion Gateway ── */}
        <div className="mb-5 p-3 border border-borderBase bg-bgBase rounded-sm">
          <label className="block text-xs font-ui text-accent font-medium mb-2">📡 Ingestion API Endpoint</label>
          <div className="flex items-center gap-2 mb-2">
            <code className="flex-1 text-xs text-textSecondary bg-bgCard px-2.5 py-1.5 rounded-sm border border-borderBase break-all select-all font-mono">
              POST {window.location.origin.replace(/:\d+$/, ':4000')}/api/ingest/{note || room.note || room.token}
            </code>
          </div>
          <p className="text-[10px] text-textGhost font-ui">Send any JSON to this endpoint from your projects. Messages appear here in real-time.</p>
        </div>

        <label className="block text-xs font-ui text-textGhost mb-1.5">Discord Webhook URL <span className="text-textGhost">(optional — forwards ingested payloads)</span></label>
        <input
          className="w-full h-10 px-3.5 bg-bgBase border border-borderBase rounded-sm text-textPrimary text-sm font-ui outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all mb-4"
          value={webhookUrl}
          onChange={e => setWebhookUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/..."
        />

        {room.visibility === 'api' && (
          <>
            <label className="block text-xs font-ui text-textGhost mb-1.5">Allowed CORS Origins <span className="text-textGhost">(optional — browser protection whitelist)</span></label>
            <input
              className="w-full h-10 px-3.5 bg-bgBase border border-borderBase rounded-sm text-textPrimary text-sm font-ui font-mono outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all mb-1"
              value={allowedOrigins}
              onChange={e => setAllowedOrigins(e.target.value)}
              placeholder="e.g. https://myportfolio.com, http://localhost:5173"
            />
            <p className="text-[10px] text-textGhost mb-5">Comma-separated list of allowed website origins. If empty, any website can post here.</p>
          </>
        )}

        {room.visibility !== 'personal' && room.visibility !== 'api' && (
          <>
            <label className="block text-xs font-ui text-textGhost  mb-1.5">Extend TTL</label>
            <select
              className="w-full h-10 px-3.5 bg-bgBase border border-borderBase rounded-sm text-textPrimary text-sm font-ui outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all mb-5"
              value={extendOption}
              onChange={e => setExtendOption(e.target.value)}
            >
              <option value="">No change</option>
              <option value="30">+ 30 Minutes</option>
              <option value="60">+ 1 Hour</option>
              <option value="120">+ 2 Hours</option>
              <option value="1440">+ 24 Hours</option>
              <option value="infinite">Set Infinite (Never Expire)</option>
            </select>
          </>
        )}

        <label className="flex items-center gap-3 cursor-pointer mb-6 p-3 border border-borderBase bg-bgBase rounded-sm hover:border-borderActive transition-colors">
          <input
            type="checkbox"
            checked={isActive}
            onChange={e => setIsActive(e.target.checked)}
            className="w-4 h-4 rounded-sm text-accent focus:ring-accent bg-bgCard border-borderActive"
          />
          <div className="flex flex-col">
            <span className="text-sm text-textPrimary font-medium">Active</span>
            <span className="text-xs text-textSecondary font-ui mt-0.5">
              {isActive && !active ? 'Will reactivate this tunnel' : isActive ? 'Currently live' : 'Will kill this tunnel'}
            </span>
          </div>
        </label>

        <div className="flex gap-3 justify-end">
          <button
            className="px-4 h-10 text-textSecondary hover:text-textPrimary hover:bg-bgHover rounded-sm text-sm transition-colors font-medium border border-transparent"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="flex items-center gap-2 px-6 h-10 bg-accent hover:bg-accentHover text-white border border-accent rounded-sm text-sm font-medium transition-colors disabled:opacity-50"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? <><span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Saving...</> : <><Zap size={14} /> Apply Changes</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Admin Bug Report Modal ─────────────────────────────────────────────────────
function AdminBugModal({ onClose }: any) {
  const dialogRef = useDialogAccessibility(onClose);
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | success | error
  const [errMsg, setErrMsg] = useState('');

  const handleSubmit = async () => {
    if (description.trim().length < 10) {
      setErrMsg('Please describe the bug in at least 10 characters.');
      return;
    }
    setStatus('sending');
    setErrMsg('');
    try {
      await api.post('/api/bugs', {
        description: description.trim(),
        page: 'admin-dashboard',
        role: 'owner',
      });
      setStatus('success');
    } catch (err: any) {
      setErrMsg(err.response?.data?.error || 'Failed to submit report. Please try again.');
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[10000] p-5 animate-fadeIn" onClick={onClose}>
      <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Report a bug" tabIndex={-1}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-[420px] bg-bgCard border border-borderActive rounded-sm p-7 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {status === 'success' ? (
          <div className="flex flex-col items-center text-center gap-4 py-4">
            <div className="text-5xl">✅</div>
            <div className="font-display text-xl font-bold text-textPrimary">Bug Reported!</div>
            <p className="text-sm text-textSecondary">Report logged. Our team will review it.</p>
            <p className="text-xs text-textGhost">Or email: <a href="mailto:support@rohitkumarranjan.in" className="text-accent hover:underline">support@rohitkumarranjan.in</a></p>
            <button className="mt-2 px-6 py-2 text-sm font-bold bg-accent text-white rounded-sm hover:bg-accentHover transition-colors" onClick={onClose}>Close</button>
          </div>
        ) : (
          <>
            <div className="font-display text-lg font-bold text-textPrimary mb-2 tracking-tight flex items-center gap-2">
              <Bug size={18} className="text-accent" /> Report a Bug
            </div>
            <p className="text-xs text-textGhost font-ui mb-5">Direct support: <a href="mailto:support@rohitkumarranjan.in" className="text-accent hover:underline">support@rohitkumarranjan.in</a></p>

            <label className="block text-xs font-ui text-textGhost  mb-1.5">Description <span className="text-danger">*</span></label>
            <textarea
              className="w-full min-h-[100px] px-3.5 py-3 bg-bgBase border border-borderBase rounded-sm text-textPrimary text-sm font-ui outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all resize-y mb-5"
              placeholder="Describe what happened and how to reproduce it..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={status === 'sending'}
            />

            {errMsg && <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-sm p-3 mb-4">{errMsg}</div>}

            <div className="flex gap-3 justify-end">
              <button
                className="px-4 h-10 text-textSecondary hover:text-textPrimary hover:bg-bgHover rounded-sm text-sm transition-colors font-medium border border-transparent"
                onClick={onClose}
                disabled={status === 'sending'}
              >
                Cancel
              </button>
              <button
                className="flex items-center gap-2 px-5 h-10 bg-accent hover:bg-accent text-white rounded-sm text-sm font-medium transition-colors disabled:opacity-50"
                onClick={handleSubmit}
                disabled={status === 'sending' || !description.trim()}
              >
                {status === 'sending'
                  ? <><span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Submitting...</>
                  : <><Bug size={14} /> Submit</>}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

function QRModal({ room, onClose, onRevoke }: any) {
  const dialogRef = useDialogAccessibility(onClose);
  const [countdown, setCountdown] = useState(() => timeLeft(room.expiresAt, room.paused_remaining_seconds));
  const [copied, setCopied] = useState(false);
  const link = `${BASE_URL}/r/${room.token}`;

  useEffect(() => {
    if (!room.expiresAt && !room.paused_remaining_seconds) return;
    const id = setInterval(() => setCountdown(timeLeft(room.expiresAt, room.paused_remaining_seconds)), 1000);
    return () => clearInterval(id);
  }, [room.expiresAt, room.paused_remaining_seconds]);

  const copy = () => { 
    copyToClipboard(link, null); // suppress global toast
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[10000] p-5 animate-fadeIn" onClick={onClose}>
      <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Share tunnel" tabIndex={-1}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-[360px] bg-bgCard border border-borderActive rounded-sm p-6 shadow-2xl flex flex-col items-center"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-full flex justify-between items-center mb-6 border-b border-borderBase pb-4">
          <span className="font-ui text-sm font-bold text-textPrimary flex items-center gap-2">
            <QrCode size={16} className="text-accent" /> {room.token}
          </span>
          <button className="text-textSecondary hover:text-textPrimary p-1 rounded-sm hover:bg-bgHover transition-colors" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="bg-white p-3 rounded-sm shadow-inner mb-6 border-4 border-bgBase">
          <QRCodeSVG value={link} size={180} bgColor="transparent" fgColor="#020617" level="M" />
        </div>

        <div className="w-full flex items-center justify-between bg-bgBase border border-borderBase p-2 rounded-sm mb-4 relative">
          <code className="text-xs text-textSecondary truncate px-2 font-ui">{link}</code>
          <button className="p-1.5 text-textPrimary hover:bg-bgCard rounded-sm transition-colors shrink-0 border border-borderBase bg-bgCard" onClick={copy}>
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          </button>
          
          <AnimatePresence>
            {copied && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: 5 }} 
                className="absolute -top-8 right-0 bg-success/10 border border-success/30 text-success text-[11px] font-bold px-2 py-1 rounded-sm shadow-md whitespace-nowrap"
              >
                Copied to clipboard!
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="w-full flex gap-2">
          {countdown && (
            <div className="flex-1 flex items-center justify-center gap-1.5 p-2 bg-bgBase border border-borderBase rounded-sm text-xs text-textSecondary font-ui">
              <Timer size={12} className="text-amber-500" /> {countdown}
            </div>
          )}
          {room.viewOnce && (
            <div className="flex-1 flex items-center justify-center gap-1.5 p-2 bg-amber-500/10 border border-amber-500/20 rounded-sm text-xs text-amber-500 font-ui font-bold">
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

// ── API Ingestion Docs Modal ──────────────────────────────────────────────────
function ApiDocsModal({ room, onClose }: any) {
  const dialogRef = useDialogAccessibility(onClose);
  const [activeLang, setActiveLang] = useState<'js' | 'curl' | 'html' | 'python'>('js');
  const [selectedCategory, setSelectedCategory] = useState<'bug' | 'feedback' | 'feature' | 'telemetry'>('bug');
  const [sendingTest, setSendingTest] = useState(false);

  const slug = room.note || room.token;
  const baseUrl = `${window.location.origin.replace(/:\d+$/, ':4000')}/api/ingest/${slug}`;
  const endpoint = selectedCategory === 'bug' ? `${baseUrl}/bugs` :
                   selectedCategory === 'feedback' ? `${baseUrl}/feedback` :
                   selectedCategory === 'feature' ? `${baseUrl}/features` : `${baseUrl}/logs`;

  const jsCode = selectedCategory === 'bug' ? `// 🐛 Report a Bug from frontend
await fetch('${endpoint}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Rohit',
    error: 'TypeError: Cannot read properties of undefined',
    page: window.location.pathname,
    status: 'urgent'
  })
});` : selectedCategory === 'feedback' ? `// 💡 User Contact / Feedback Form
await fetch('${endpoint}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Rohit',
    email: 'rohit@example.com',
    message: 'Love the new speed improvements!',
    rating: '5/5'
  })
});` : selectedCategory === 'feature' ? `// 🚀 Feature Request / Changelog Event
await fetch('${endpoint}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Export to PDF requested',
    description: 'Clients are requesting one-click PDF export.',
    user: 'client_789'
  })
});` : `// 📊 Background Scraper / Telemetry Log
await fetch('${endpoint}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    endpoint: '/api/search-by-name',
    latency: '741ms',
    client_ip: '128.185.168.194',
    product_name: 'MultiPurpose Kit Bag',
    pages_scanned: '1/4'
  })
});`;

  const curlCode = `# ⚡ cURL (${selectedCategory.toUpperCase()})
curl -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Rohit",
    "query": "Telemetry payload test",
    "category": "${selectedCategory}"
  }'`;

  const htmlCode = `<!-- ⚡ HTML Form (${selectedCategory}) -->
<form onsubmit="event.preventDefault(); 
  fetch('${endpoint}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: this.elements.name.value,
      query: this.elements.query.value
    })
  }).then(() => alert('Submitted!'));">
  <input name="name" placeholder="Name" required />
  <textarea name="query" placeholder="Details..." required></textarea>
  <button type="submit">Send</button>
</form>`;

  const pythonCode = `# ⚡ Python (requests)
import requests

requests.post("${endpoint}", json={
    "name": "Rohit",
    "query": "Telemetry report",
    "category": "${selectedCategory}"
})`;

  const activeSnippet = activeLang === 'js' ? jsCode : activeLang === 'curl' ? curlCode : activeLang === 'html' ? htmlCode : pythonCode;

  const handleSendTest = async () => {
    setSendingTest(true);
    try {
      const payload: any = {
        name: 'Rohit (Test User)',
        device: 'Web Client',
      };

      if (selectedCategory === 'bug') {
        payload.error = 'Uncaught ReferenceError: variable is not defined';
        payload.query = 'Testing categorized bug report routing';
        payload.page = '/checkout';
      } else if (selectedCategory === 'feedback') {
        payload.email = 'dev@ghostvault.local';
        payload.query = 'The new categorized feed works beautifully!';
        payload.rating = '5 stars';
      } else if (selectedCategory === 'feature') {
        payload.title = 'Add dark mode toggle for mobile';
        payload.query = 'User suggested a quick toggle switch in drawer.';
      } else {
        payload.endpoint = '/api/cron-sync';
        payload.latency = '320ms';
        payload.query = 'Nightly database vacuum completed successfully';
      }

      await api.post(`/api/ingest/${slug}/${selectedCategory}`, payload);
      toast.success(`Test ${selectedCategory} payload sent! Check your feed.`);
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to send test payload');
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[10000] p-4 animate-fadeIn" onClick={onClose}>
      <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label="API Documentation" tabIndex={-1}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-[660px] bg-bgCard border border-borderActive rounded-sm p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 border-b border-borderBase pb-3">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-accent" />
            <h3 className="font-ui text-base font-bold text-textPrimary tracking-tight">API Ingestion Guide · {slug}</h3>
          </div>
          <button className="text-textSecondary hover:text-textPrimary p-1 rounded-sm hover:bg-bgHover transition-colors" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* ── Category Selector Tabs ── */}
        <div className="mb-4">
          <label className="block text-[11px] font-bold text-textGhost uppercase tracking-wider mb-1.5">
            Select Category Target:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'bug', label: '🐛 Bug Reports', sub: '/bugs' },
              { id: 'feedback', label: '💡 Feedback', sub: '/feedback' },
              { id: 'feature', label: '🚀 Features', sub: '/features' },
              { id: 'telemetry', label: '📊 Telemetry', sub: '/logs' },
            ].map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id as any)}
                className={`p-2 rounded-sm border text-left transition-all ${
                  selectedCategory === cat.id
                    ? 'border-accent bg-accent/10 shadow-sm'
                    : 'border-borderBase bg-bgBase hover:border-borderActive'
                }`}
              >
                <span className="text-xs font-bold text-textPrimary block">{cat.label}</span>
                <code className="text-[10px] text-accent block mt-0.5">{cat.sub}</code>
              </button>
            ))}
          </div>
        </div>

        {/* ── Endpoint Card ── */}
        <div className="mb-4 p-3 bg-bgBase border border-borderBase rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold text-textGhost uppercase tracking-wider block mb-0.5">POST Endpoint</span>
            <code className="text-xs text-accent font-mono break-all select-all">{endpoint}</code>
          </div>
          <button
            onClick={() => copyToClipboard(endpoint, 'Endpoint URL copied!')}
            className="px-3 py-1.5 bg-bgCard hover:bg-bgHover border border-borderBase text-xs text-textPrimary rounded-sm transition-colors shrink-0 font-medium"
          >
            Copy URL
          </button>
        </div>

        {/* ── How It Works & Handles Parameters ── */}
        <div className="mb-4 p-3.5 bg-accent/5 border border-accent/20 rounded-sm text-xs text-textSecondary space-y-2">
          <div className="font-bold text-accent flex items-center gap-1.5 text-xs">
            <Info size={14} /> Automatic Category Normalization & Zero Confusion:
          </div>
          <ul className="list-disc pl-4 space-y-1.5 leading-relaxed text-[11px]">
            <li><strong>Flexible Sub-routes & Aliases:</strong> You don't have to worry about exact wording! <code className="text-textPrimary bg-bgCard px-1 py-0.5 rounded border border-borderBase">/bugs</code>, <code className="text-textPrimary bg-bgCard px-1 py-0.5 rounded border border-borderBase">/bug-report</code>, <code className="text-textPrimary bg-bgCard px-1 py-0.5 rounded border border-borderBase">/error</code>, and <code className="text-textPrimary bg-bgCard px-1 py-0.5 rounded border border-borderBase">/issues</code> all automatically route into 🐛 <strong>Bug Reports</strong>.</li>
            <li><strong>Payload Alternative:</strong> Alternatively, POST to <code className="text-textPrimary">/api/ingest/{slug}</code> and supply <code className="text-textPrimary">"category": "bug"</code> or <code className="text-textPrimary">"type": "feedback"</code> in JSON.</li>
            <li><strong>Custom Categories Supported:</strong> If you use custom categories like <code className="text-textPrimary">/payments</code> or <code className="text-textPrimary">/leads</code>, GhostVault automatically creates a distinct colored badge and chat filter without errors.</li>
            <li><strong>In-Chat Filter Bar:</strong> Inside your chat, click the category pills (<code className="text-textPrimary">🐛 Bugs</code>, <code className="text-textPrimary">💡 Feedback</code>, etc.) to isolate and review specific streams in one click.</li>
            <li><strong>Discord Color Badging:</strong> Discord webhook alerts automatically receive the matching colored embed and category header tag.</li>
          </ul>
        </div>

        {/* ── Language Tabs ── */}
        <div className="flex border-b border-borderBase mb-2">
          {[
            { id: 'js', label: 'JavaScript (Fetch)' },
            { id: 'curl', label: 'cURL' },
            { id: 'html', label: 'HTML Form' },
            { id: 'python', label: 'Python' },
          ].map(lang => (
            <button
              key={lang.id}
              onClick={() => setActiveLang(lang.id as any)}
              className={`px-3 py-1.5 text-xs font-ui font-medium border-b-2 transition-colors ${
                activeLang === lang.id
                  ? 'border-accent text-accent font-bold bg-accent/5'
                  : 'border-transparent text-textSecondary hover:text-textPrimary'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>

        {/* ── Code Box ── */}
        <div className="relative bg-bgBase border border-borderBase rounded-sm p-3 mb-5 font-mono text-[11px] text-textPrimary overflow-x-auto">
          <button
            onClick={() => copyToClipboard(activeSnippet, 'Code snippet copied!')}
            className="absolute top-2 right-2 px-2 py-1 bg-bgCard hover:bg-bgHover border border-borderBase text-[10px] text-textSecondary hover:text-textPrimary rounded-sm transition-colors"
          >
            Copy Snippet
          </button>
          <pre className="whitespace-pre">{activeSnippet}</pre>
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-borderBase">
          <button
            type="button"
            onClick={handleSendTest}
            disabled={sendingTest}
            className="flex items-center gap-1.5 px-3 py-2 bg-accent/20 hover:bg-accent text-accent hover:text-white border border-accent/40 rounded-sm text-xs font-bold transition-all disabled:opacity-50"
          >
            {sendingTest ? <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" /> : <Zap size={13} />}
            Send Test {selectedCategory === 'bug' ? '🐛 Bug' : selectedCategory === 'feedback' ? '💡 Feedback' : selectedCategory === 'feature' ? '🚀 Feature' : '📊 Telemetry'} Now
          </button>

          <button
            className="px-4 py-2 text-textSecondary hover:text-textPrimary hover:bg-bgHover rounded-sm text-xs font-medium transition-colors border border-transparent"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function UploadRow({ upload, onDelete }: any) {
  const [copied, setCopied] = useState(false);
  const isImg = upload.file_type?.startsWith('image/');
  const isBurn = upload.expires_at === '1970-01-01T00:00:01+00:00' || upload.expires_at === '1970-01-01T00:00:01.000Z';
  const isExp = !isBurn && upload.expires_at && new Date(upload.expires_at) < new Date();
  
  const copy = () => { 
    const isText = upload.file_type === 'text/plain' || upload.file_type === 'application/json';
    let shareUrl = upload.cloudinary_url;
    if (isBurn) shareUrl = `${BASE_URL}/burn/${upload.id}`;
    else if (isText) shareUrl = `${BASE_URL}/v/${upload.id}`;
    
    copyToClipboard(shareUrl, 'URL copied'); 
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const dl = () => { const a = document.createElement('a'); a.href = upload.cloudinary_url; a.download = upload.file_name; a.click(); };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`asset-row group flex items-center gap-4 p-3 bg-bgBase border border-borderBase rounded-sm mb-2 transition-all hover:border-borderActive hover:bg-bgHover ${isExp ? 'opacity-50 grayscale' : ''}`}
    >
      <div className="w-10 h-10 shrink-0 bg-bgCard border border-borderBase rounded-sm flex items-center justify-center overflow-hidden">
        {isImg
          ? <img src={upload.cloudinary_url} alt={upload.file_name} className="w-full h-full object-cover" loading="lazy" />
          : <File size={20} className="text-accent" />
        }
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="font-ui text-sm font-medium text-textPrimary truncate mb-1" title={upload.file_name}>{upload.file_name}</div>
        <div className="flex items-center gap-3 text-xs font-ui text-textGhost uppercase">
          <span>{new Date(upload.created_at).toISOString().split('T')[0]}</span>
          {upload.expires_at && !isExp && !isBurn && (
            <span className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-1.5 rounded-sm">
              <Timer size={10} /> {timeLeft(upload.expires_at)}
            </span>
          )}
          {isBurn && (
            <span className="flex items-center gap-1 text-orange-500 bg-orange-500/10 px-1.5 rounded-sm">
              🔥 BURN ON READ
            </span>
          )}
          {isExp && <span className="text-danger bg-danger/10 px-1.5 rounded-sm">DEAD</span>}
        </div>
      </div>

      <div className="row-actions flex items-center gap-1">
        <button className="p-2 text-textSecondary hover:text-accent hover:bg-bgCard rounded-sm transition-colors border border-transparent hover:border-borderBase" onClick={dl} title="Download"><Download size={14} /></button>
        <button className="p-2 text-textSecondary hover:text-textPrimary hover:bg-bgCard rounded-sm transition-colors border border-transparent hover:border-borderBase" onClick={copy} title="Copy URL">
          {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
        </button>
        <button className="p-2 text-textSecondary hover:text-danger hover:bg-danger/10 hover:border-danger/20 rounded-sm transition-colors border border-transparent" onClick={() => onDelete(upload.id)} title="Delete"><Trash2 size={14} /></button>
      </div>
    </motion.div>
  );
}

function RoomRow({ room, onQR, onRevoke, onTogglePause, onPermanentDelete, onChat, onEdit, onDocs, isSelected }: any) {
  const [countdown, setCountdown] = useState(() => timeLeft(room.expires_at, room.paused_remaining_seconds));
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    if (!room.expires_at && !room.paused_remaining_seconds) return;
    const id = setInterval(() => setCountdown(timeLeft(room.expires_at, room.paused_remaining_seconds)), 1000);
    return () => clearInterval(id);
  }, [room.expires_at, room.is_active, room.paused_remaining_seconds]);

  const active = isRoomValid(room);
  const isApi = room.visibility === 'api';
  const isPersonal = room.visibility === 'personal';

  const slug = room.note || room.token;
  const ingestUrl = `${window.location.origin.replace(/:\d+$/, ':4000')}/api/ingest/${slug}`;

  const handleCopyEndpoint = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyToClipboard(ingestUrl, 'API Ingestion URL copied to clipboard!');
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  if (isApi) {
    const originCount = room.allowed_origins ? room.allowed_origins.split(',').map((s: string) => s.trim()).filter(Boolean).length : 0;
    const hasDiscord = Boolean(room.discord_webhook_url && room.discord_webhook_url.trim());

    return (
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className={`room-row flex items-center justify-between p-3 border border-borderBase rounded-sm mb-2 transition-all hover:bg-bgHover hover:border-borderActive ${isSelected ? 'bg-accent/10 border-accent/30' : 'bg-bgBase'} ${!active ? 'opacity-50 border-dashed' : ''}`}
      >
        <div className="flex flex-col gap-1.5 flex-1 min-w-0 pr-2">
          {/* Top Line: Dot, Slug, API badge, Shield icon, Discord */}
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-accent animate-pulse' : 'bg-textGhost'}`} />
            <span className="font-ui text-sm font-semibold text-textPrimary tracking-wide truncate shrink-0 max-w-[120px] sm:max-w-none">
              {slug}
            </span>
            <span className="audience-badge audience-badge--api">
              ⚡ API
            </span>
            {originCount > 0 ? (
              <span 
                title={`Allowed origins (${originCount}): ${room.allowed_origins}`} 
                className="audience-badge text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 text-[10px] px-1.5 py-0.5 rounded-sm flex items-center gap-1 font-semibold cursor-help" 
                aria-label={`${originCount} whitelisted origin(s)`}
              >
                <ShieldCheck size={11} />
                <span>{originCount}</span>
              </span>
            ) : (
              <span 
                title="Public ingestion (any origin)" 
                className="audience-badge text-textGhost bg-bgCard border border-borderBase text-[10px] px-1.5 py-0.5 rounded-sm flex items-center gap-1 cursor-help" 
                aria-label="Public ingestion shield"
              >
                <Globe size={11} />
                <span>Public</span>
              </span>
            )}
            {hasDiscord && (
              <span className="audience-badge text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 text-[10px] px-1.5 py-0.5 rounded-sm font-semibold">
                Discord
              </span>
            )}
          </div>

          {/* Bottom Line: Endpoint pill with 1-click copy */}
          <div className="flex items-center gap-1.5 text-xs font-ui font-mono truncate">
            <span className="text-[10px] text-accent font-bold">POST</span>
            <span className="truncate max-w-[180px] sm:max-w-xs text-textSecondary select-all">
              /api/ingest/{slug}
            </span>
            <button
              type="button"
              onClick={handleCopyEndpoint}
              className="text-textGhost hover:text-accent transition-colors p-0.5 shrink-0"
              title="Copy full ingestion endpoint URL"
            >
              {copiedUrl ? <Check size={11} className="text-success" /> : <Copy size={11} />}
            </button>
          </div>
        </div>

        {/* Action Buttons: Clean & uniform with other rows */}
        <div className="flex items-center gap-1 shrink-0">
          <button className="p-2 text-textSecondary hover:text-accent hover:bg-bgCard rounded-sm transition-colors border border-transparent hover:border-borderBase shrink-0" onClick={onChat} title="Terminal"><MessageSquare size={14} /></button>
          <button className="p-2 text-textSecondary hover:text-accent hover:bg-accent/10 rounded-sm transition-colors border border-transparent hover:border-accent/20 shrink-0" onClick={onEdit} title="Edit Project"><Pencil size={14} /></button>
          <button
            className="p-2 rounded-sm text-textSecondary hover:text-danger hover:bg-danger/10 shrink-0"
            onClick={onPermanentDelete}
            title="Delete project permanently"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`room-row flex items-center justify-between p-3 border border-borderBase rounded-sm mb-2 transition-all hover:bg-bgHover hover:border-borderActive ${isSelected ? 'bg-accent/10 border-accent/30' : 'bg-bgBase'} ${!active ? 'opacity-50 border-dashed' : ''}`}
    >
      <div className="flex flex-col gap-1.5 flex-1 min-w-0 pr-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? (room.is_paused ? 'bg-amber-500' : 'bg-success animate-pulse') : 'bg-textGhost'}`} />
          <span className="font-ui text-sm font-semibold text-textPrimary tracking-widest truncate shrink-0 max-w-[100px] md:max-w-none">
            {room.token}
          </span>
          <span className={isPersonal ? 'audience-badge' : room.is_paused ? 'audience-badge audience-badge--paused' : 'audience-badge audience-badge--shared'}>
            {isPersonal ? '🔒 Saved Notes' : room.is_paused ? '⏸️ Paused' : '🌐 Live'}
          </span>
          {room.note && <span className="font-ui text-xs text-textSecondary bg-bgCard border border-borderBase px-2 py-0.5 rounded-sm truncate" title={room.note}>{room.note}</span>}
        </div>
        <div className="flex items-center gap-2 text-xs font-ui font-bold truncate">
          {room.view_once && <span className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-sm shrink-0"><Eye size={10} /> BURN</span>}
          {active ? (
            countdown && <span className="flex items-center gap-1 text-accent bg-accent/10 px-1.5 py-0.5 rounded-sm shrink-0"><Timer size={10} /> {countdown}</span>
          ) : (
            <span className="text-textGhost bg-bgCard px-1.5 py-0.5 border border-borderBase rounded-sm shrink-0">KILLED</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button className="p-2 text-textSecondary hover:text-accent hover:bg-bgCard rounded-sm transition-colors border border-transparent hover:border-borderBase shrink-0" onClick={onChat} title="Terminal"><MessageSquare size={14} /></button>
        <button className="p-2 text-textSecondary hover:text-accent hover:bg-accent/10 rounded-sm transition-colors border border-transparent hover:border-accent/20 shrink-0" onClick={onEdit} title="Edit Tunnel"><Pencil size={14} /></button>
        {active && !isPersonal && (
          <>
            <button className="p-2 text-textSecondary hover:text-textPrimary hover:bg-bgCard rounded-sm transition-colors border border-transparent hover:border-borderBase shrink-0" onClick={onQR} title="QR"><QrCode size={14} /></button>
            {room.is_paused ? (
              <button className="p-2 rounded-sm text-textSecondary hover:text-success hover:bg-success/10 transition-colors" onClick={onTogglePause} title="Resume Tunnel"><Play size={14} /></button>
            ) : (
              <button className="p-2 rounded-sm text-textSecondary hover:text-amber-500 hover:bg-amber-500/10 transition-colors" onClick={onTogglePause} title="Pause Tunnel"><Pause size={14} /></button>
            )}
            <button
              className="p-2 rounded-sm text-textSecondary hover:text-amber-500 hover:bg-amber-500/10"
              onClick={onRevoke}
              title="Revoke tunnel access"
            >
              <X size={14} />
            </button>
          </>
        )}
        {(!active || isPersonal) && (
          <button
            className="p-2 rounded-sm text-textSecondary hover:text-danger hover:bg-danger/10"
            onClick={onPermanentDelete}
            title="Delete tunnel permanently"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

function CompactRoomRow({ room, onQR, onRevoke, onTogglePause, onPermanentDelete, onChat, onEdit, onDocs, isSelected }: any) {
  const active = isRoomValid(room);
  const isApi = room.visibility === 'api';
  const isPersonal = room.visibility === 'personal';
  const [copiedUrl, setCopiedUrl] = useState(false);

  const slug = room.note || room.token;
  const ingestUrl = `${window.location.origin.replace(/:\d+$/, ':4000')}/api/ingest/${slug}`;

  const handleCopyEndpoint = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyToClipboard(ingestUrl, 'API Ingestion URL copied!');
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  if (isApi) {
    const originCount = room.allowed_origins ? room.allowed_origins.split(',').map((s: string) => s.trim()).filter(Boolean).length : 0;
    const hasDiscord = Boolean(room.discord_webhook_url && room.discord_webhook_url.trim());
    return (
      <div
        className={`compact-room-row group flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer mb-1.5 ${
          isSelected ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-transparent border-transparent hover:bg-bgHover'
        }`}
      >
        <button type="button" onClick={onChat} aria-label={`Open API Feed ${slug}`} aria-pressed={!!isSelected} className="flex flex-1 text-left items-center gap-2 min-w-0 pr-1">
          <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 animate-pulse" />
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`font-ui text-xs font-bold tracking-wide truncate ${isSelected ? 'text-accent' : 'text-textPrimary'}`}>
                {slug}
              </span>
              <span className="audience-badge audience-badge--api text-[9px] px-1 py-0">
                ⚡ API
              </span>
              {originCount > 0 ? (
                <span className="audience-badge text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 text-[9px] px-1 py-0 flex items-center gap-0.5" title={`Allowed origins (${originCount}): ${room.allowed_origins}`}>
                  <ShieldCheck size={10} />
                  <span>{originCount}</span>
                </span>
              ) : (
                <span className="audience-badge text-textGhost bg-bgCard border border-borderBase text-[9px] px-1 py-0 flex items-center gap-0.5" title="Public ingestion">
                  <Globe size={10} />
                </span>
              )}
              {hasDiscord && (
                <span className="audience-badge text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 text-[9px] px-1 py-0">
                  Discord
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-textGhost font-mono">
              <span className="truncate max-w-[130px]">/ingest/{slug}</span>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-0.5 shrink-0 row-actions">
          <button
            className="p-1.5 text-textGhost hover:text-accent transition-colors shrink-0"
            onClick={handleCopyEndpoint}
            title="Copy Ingest URL"
          >
            {copiedUrl ? <Check size={11} className="text-success" /> : <Copy size={11} />}
          </button>
          <button
            className="p-1.5 text-textGhost hover:text-accent transition-colors shrink-0"
            onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
            title="Edit Project"
          >
            <Pencil size={11} />
          </button>
          <button
            className="p-1.5 text-textGhost hover:text-danger transition-colors shrink-0"
            onClick={(e) => { e.stopPropagation(); onPermanentDelete(); }}
            title="Delete Permanently"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`compact-room-row group flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer mb-1 ${isSelected ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-transparent border-transparent hover:bg-bgHover'}`}
    >
      <button type="button" onClick={onChat} aria-label={`Open tunnel ${room.token}`} aria-pressed={!!isSelected} className="flex flex-1 text-left items-center gap-2.5 min-w-0 pr-2">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? (room.is_paused ? 'bg-amber-500' : 'bg-success animate-pulse') : 'bg-textGhost'}`} />
        <div className="flex flex-col min-w-0">
          <span className={`font-ui text-xs font-bold tracking-widest truncate ${isSelected ? 'text-accent' : 'text-textPrimary'}`}>
            {room.token}
          </span>
          <span className={isPersonal ? 'audience-badge' : room.is_paused ? 'audience-badge audience-badge--paused' : 'audience-badge audience-badge--shared'}>
            {isPersonal ? '🔒 Saved' : room.is_paused ? '⏸️ Paused' : '🌐 Live'}
          </span>
        </div>
      </button>

      <div className="flex items-center gap-0.5 shrink-0 row-actions">
        <button className="p-1.5 text-textGhost hover:text-accent transition-colors shrink-0" onClick={(e) => { e.stopPropagation(); onEdit?.(); }} title="Edit"><Pencil size={11} /></button>
        {active && !isPersonal && (
          <>
            <button className="p-1.5 text-textGhost hover:text-textPrimary transition-colors shrink-0" onClick={(e) => { e.stopPropagation(); onQR(); }} title="QR Code"><QrCode size={12} /></button>
            {room.is_paused ? (
              <button className="p-1.5 text-textGhost hover:text-success transition-colors shrink-0" onClick={(e) => { e.stopPropagation(); onTogglePause?.(); }} title="Resume Tunnel"><Play size={12} /></button>
            ) : (
              <button className="p-1.5 text-textGhost hover:text-amber-500 transition-colors shrink-0" onClick={(e) => { e.stopPropagation(); onTogglePause?.(); }} title="Pause Tunnel"><Pause size={12} /></button>
            )}
            <button className="p-1.5 text-textGhost hover:text-danger transition-colors shrink-0" onClick={(e) => { e.stopPropagation(); onRevoke?.(); }} title="Revoke access"><X size={12} /></button>
          </>
        )}
        {(!active || isPersonal) && (
          <button
            className="p-1.5 text-textGhost hover:text-danger transition-colors shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onPermanentDelete();
            }}
            title="Delete Permanently"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── MAIN DASHBOARD ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [confirmAction, confirmationDialog] = useConfirmAction();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [chatScope, setChatScope] = useState('shared');
  const [uploads, setUploads] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [pendingFile, setPendingFile] = useState<any>(null);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [qrRoom, setQrRoom] = useState<any>(null);
  const [editRoom, setEditRoom] = useState<any>(null);
  const [docsRoom, setDocsRoom] = useState<any>(null);
  const [showBugModal, setShowBugModal] = useState(false);
  const [chatRoom, setChatRoom] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalUploads, setTotalUploads] = useState(0);
  const [pasteFlash, setPasteFlash] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { socket, joinRoom } = useSocket();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const chatMenuRef = useRef<HTMLDivElement>(null);


  const [showHistory, setShowHistory] = useState(false);
  const [clientIp, setClientIp] = useState<string>('FETCHING...');
  const [tunnelSearch, setTunnelSearch] = useState('');
  const [bugReports, setBugReports] = useState<any[]>([]);
  const [bugLoading, setBugLoading] = useState(false);
  const [downloadDir, setDownloadDir] = useState<any>(null);

  useEffect(() => {
    if (isFileSystemAccessSupported()) {
      getDownloadDirectory().then(dir => {
        if (dir) setDownloadDir(dir);
      });
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(event.target as Node)) {
        setShowChatMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSetDownloadDir = async () => {
    try {
      const dir = await selectDownloadDirectory();
      if (dir) {
        setDownloadDir(dir);
        toast.success(`Vault folder set to: ${dir.name}`);
      }
    } catch (err) {
      toast.error('Failed to set folder');
    }
  };

  const handleClearDownloadDir = async () => {
    await clearDownloadDirectory();
    setDownloadDir(null);
    toast.success('Cleared local vault folder');
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
    if (activeTab !== 'bugs') return;
    setBugLoading(true);
    api.get('/api/bugs')
      .then(res => setBugReports(res.data.reports || []))
      .catch(() => toast.error('Failed to load bug reports'))
      .finally(() => setBugLoading(false));
  }, [activeTab]);

  useEffect(() => {
    if (!socket || !rooms.length) return;
    rooms.forEach(r => joinRoom(r.token));

    const onFile = (file: any) => {
      toast.success(`[SYS] Data packet in tunnel ${file.roomToken}`, { duration: 4000, style: { background: '#020617', color: '#10b981', border: '1px solid #10b981' } });
      if (file.roomToken) setRooms(prev => prev.filter(r => !(r.token === file.roomToken && r.view_once)));
    };
    const onMessage = (msg: any) => {
      if (chatRoom && msg.roomToken === chatRoom.token) {
        setChatMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
      if (msg.sender === 'guest') {
        toast(`[GUEST] ${msg.content?.slice(0, 40) || 'uploaded payload'}`, { 
          duration: 3000, 
          icon: '👤',
          style: { background: '#020617', color: '#06b6d4', border: '1px solid #06b6d4' } 
        });
      }
    };
    const onRevoked = ({ token }: any) => setRooms(prev => prev.map(r => r.token === token ? { ...r, is_active: false } : r));
    const onMessageDeleted = ({ id, roomToken }: any) => {
      if (chatRoom && roomToken === chatRoom.token) {
        setChatMessages(prev => prev.filter(m => m.id !== id));
      }
    };
    const onMessageReacted = ({ messageId, reactions, roomToken }: any) => {
      if (chatRoom && roomToken === chatRoom.token) {
        setChatMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
      }
    };
    const onRoomUpdated = ({ token, expiresAt, note: newNote, isActive, visibility, isPaused }: any) => {
      setRooms(prev => prev.map(r => r.token === token
        ? { ...r, expires_at: expiresAt, note: newNote, is_active: isActive ?? r.is_active, visibility: visibility ?? r.visibility, is_paused: isPaused ?? r.is_paused }
        : r
      ));
      if (chatRoom?.token === token) {
        setChatRoom((prev: any) => ({ ...prev, expires_at: expiresAt, note: newNote, is_active: isActive ?? prev?.is_active, visibility: visibility ?? prev?.visibility, is_paused: isPaused ?? prev?.is_paused }));
      }
    };
    const onMessageViewed = ({ id, viewed_at, roomToken }: any) => {
      if (chatRoom && roomToken === chatRoom.token) {
        setChatMessages(prev => prev.map(m => m.id === id ? { ...m, viewed_at } : m));
      }
    };
    const onMessageBurned = ({ id, roomToken }: any) => {
      if (chatRoom && roomToken === chatRoom.token) {
        setChatMessages(prev => prev.map(m => m.id === id ? { ...m, type: 'burned', content: null, file_url: null, file_name: null } : m));
      }
    };

    const onMessagePinned = ({ messageId, is_pinned, roomToken }: any) => {
      if (chatRoom && roomToken === chatRoom.token) {
        setChatMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_pinned } : m));
      }
    };

    const onMessagesBatchDeleted = ({ ids, roomToken }: any) => {
      if (chatRoom && roomToken === chatRoom.token && Array.isArray(ids)) {
        setChatMessages(prev => prev.filter(m => !ids.includes(m.id)));
      }
    };

    socket.on('new_file', onFile);
    socket.on('new_message', onMessage);
    socket.on('room_revoked', onRevoked);
    socket.on('message_deleted', onMessageDeleted);
    socket.on('messages_batch_deleted', onMessagesBatchDeleted);
    socket.on('message_reacted', onMessageReacted);
    socket.on('room_updated', onRoomUpdated);
    socket.on('message_viewed', onMessageViewed);
    socket.on('message_burned', onMessageBurned);
    socket.on('message_pinned', onMessagePinned);
    return () => {
      socket.off('new_file', onFile);
      socket.off('new_message', onMessage);
      socket.off('room_revoked', onRevoked);
      socket.off('message_deleted', onMessageDeleted);
      socket.off('messages_batch_deleted', onMessagesBatchDeleted);
      socket.off('message_reacted', onMessageReacted);
      socket.off('room_updated', onRoomUpdated);
      socket.off('message_viewed', onMessageViewed);
      socket.off('message_burned', onMessageBurned);
      socket.off('message_pinned', onMessagePinned);
    };
  }, [socket, rooms, chatRoom, joinRoom]);

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash !== '#chat' && chatRoom) {
        setChatRoom(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.querySelector('.fs-viewer-overlay')) return;
        
        if (chatRoom) closeChat();
        if (showCreateRoom) setShowCreateRoom(false);
        if (qrRoom) setQrRoom(null);
      }
      if (e.key === '/' && (chatRoom || activeTab === 'nodes') && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        const searchInput = document.getElementById('tunnel-search');
        searchInput?.focus();
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [chatRoom, showCreateRoom, qrRoom, activeTab]);

  const closeChat = () => {
    setChatRoom(null);
    if (window.location.hash === '#chat') {
      window.history.back();
    }
  };

  const performDeleteBug = async (id: string) => {
    try {
      await api.delete(`/api/bugs/${id}`);
      setBugReports(prev => prev.filter(b => b.id !== id));
      toast.success('Bug report deleted');
    } catch (err) {
      toast.error('Failed to delete bug report'); return false;
    }
  };

  useEffect(() => {
    const handle = (e: ClipboardEvent) => {
      if (chatRoom) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      let file: File | null = null;
      let defaultName = `dump_${new Date().getTime().toString(16).toUpperCase()}`;

      const img = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
      if (img) {
        file = img.getAsFile();
      } else {
        const text = e.clipboardData?.getData('text/plain');
        if (text && text.trim()) {
          const isJson = text.trim().startsWith('{') || text.trim().startsWith('[');
          const ext = isJson ? 'json' : 'txt';
          file = new File([text], `snippet_${new Date().getTime()}.${ext}`, { type: isJson ? 'application/json' : 'text/plain' });
          defaultName = `snippet_${new Date().getTime().toString(16)}`;
        }
      }

      if (!file) return;
      setPasteFlash(true);
      setTimeout(() => setPasteFlash(false), 350);
      setPendingFile({ file, defaultName });
    };
    window.addEventListener('paste', handle);
    return () => window.removeEventListener('paste', handle);
  }, [chatRoom]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: true,
    maxSize: 50 * 1024 * 1024, // Allow up to 50MB for folders
    onDropAccepted: async (files) => {
      if (files.length === 1) {
        setPendingFile({ file: files[0], defaultName: files[0].name.replace(/\.[^/.]+$/, '') });
      } else if (files.length > 1) {
        // Zip multiple files / folder
        setUploading(true);
        toast('Zipping folder...', { icon: '🗂️' });
        try {
          const zip = new JSZip();
          files.forEach(f => {
            // @ts-ignore - path is added by react-dropzone
            const filePath = f.path || f.webkitRelativePath || f.name;
            // clean up leading slash if present
            const cleanPath = filePath.replace(/^\//, '');
            zip.file(cleanPath, f);
          });
          const content = await zip.generateAsync({ type: 'blob' });
          const zipFile = new File([content], 'archive.zip', { type: 'application/zip' });
          setPendingFile({ file: zipFile, defaultName: `archive_${new Date().getTime().toString(16)}` });
        } catch (err) {
          toast.error('Failed to zip folder');
        } finally {
          setUploading(false);
        }
      }
    },
    onDropRejected: () => toast.error('ERR: Drop rejected (Max 50MB)'),
  });

  const handleSaveLocal = async (name: string) => {
    const { file } = pendingFile;
    let ext = file.name && file.name.includes('.') ? file.name.split('.').pop() : null;
    if (!ext) {
      ext = file.type ? file.type.split('/')[1] : 'png';
    }
    const fullFileName = `${name}.${ext}`;

    try {
      if (isFileSystemAccessSupported() && downloadDir) {
        if (await verifyPermission(downloadDir, true)) {
           await saveFileToDirectory(downloadDir, fullFileName, file);
           toast.success('Written to local vault', { style: { background: '#020617', color: '#10b981', border: '1px solid #10b981' } });
           setPendingFile(null);
           return;
        }
      }
    } catch (e) {
      console.error('Direct local save failed, falling back', e);
    }

    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = fullFileName;
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
      copyToClipboard(res.data.url, 'Share link copied to clipboard!');
      toast.success('Deployed. URL copied.');
      const uRes = await api.get('/api/uploads?page=1');
      setUploads(uRes.data.uploads || []); setTotalUploads(uRes.data.total || 0); setPage(1);
    } catch { toast.error('Deploy failed'); }
    finally { setUploading(false); setTimeout(() => setUploadProgress(false), 800); }
  }, [pendingFile]);

  const performDelete = async (id: string) => {
    try { await api.delete(`/api/uploads/${id}`); setUploads(prev => prev.filter(u => u.id !== id)); toast.success('File deleted'); }
    catch { toast.error('Failed to delete file'); return false; }
  };

  const fetchRooms = async () => {
    try {
      const res = await api.get('/api/rooms');
      setRooms(res.data || []);
      setChatRoom(prev => {
        if (!prev) return null;
        const updated = (res.data || []).find((r: any) => r.token === prev.token);
        return updated || prev;
      });
    } catch { /* ignore */ }
  };

  const performRevoke = async (token: string) => {
    try {
      await api.delete(`/api/rooms/${token}`);
      if (qrRoom?.token === token) setQrRoom(null);
      if (chatRoom?.token === token) setChatRoom(null);
      toast.success('Tunnel access revoked');
      fetchRooms();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to revoke access'); return false;
    }
  };

  const handleTogglePause = async (token: string, currentStatus: boolean) => {
    try {
      await api.patch(`/api/rooms/${token}`, { isPaused: !currentStatus });
      toast.success(currentStatus ? 'Tunnel resumed' : 'Tunnel paused');
      fetchRooms();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update tunnel');
    }
  };

  const performPermanentDelete = async (token: string) => {
    try {
      await api.delete(`/api/rooms/${token}/permanent`);
      setRooms(prev => prev.filter(r => r.token !== token));
      if (qrRoom?.token === token) setQrRoom(null);
      if (chatRoom?.token === token) setChatRoom(null);
      toast.success('Data wiped');
    } catch { toast.error('Wipe failed'); return false; }
  };

  const openChat = async (room: any) => {
    setActiveTab('nodes');
    setChatRoom(room);
    setDesktopSidebarOpen(false); // Auto-close main sidebar for focus
    // Set hash so back button works reliably on mobile
    window.location.hash = 'chat';
    setChatLoading(true);
    try {
      const res = await api.get(`/api/rooms/${room.token}/messages`);
      setChatMessages(res.data || []);
    } catch { toast.error('Failed to init terminal'); }
    finally { setChatLoading(false); }
    joinRoom(room.token);
  };

  const handleOwnerSendText = async (text: string, burn_after_seconds: number | null = null, reply_to_id: string | null = null, is_thread_reply = false) => {
    if (!chatRoom) return;
    const res = await api.post(`/api/rooms/${chatRoom.token}/messages/text`, { content: text, sender: 'owner', burn_after_seconds, reply_to_id, is_thread_reply });
    setChatMessages(prev => {
      if (prev.some(m => m.id === res.data.id)) return prev;
      return [...prev, res.data];
    });
  };

  const handleOwnerSendFile = async (file: File, burn_after_seconds: number | null = null, reply_to_id: string | null = null, onProgress?: (progressEvent: any) => void, isThreadReply = false) => {
    if (!chatRoom) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('sender', 'owner');
    if (isThreadReply) fd.append('is_thread_reply', 'true');
    fd.append('fileName', file.name);
    if (burn_after_seconds) {
      fd.append('burn_after_seconds', burn_after_seconds.toString());
    }
    if (reply_to_id) {
      fd.append('reply_to_id', reply_to_id);
    }
    const res = await api.post(`/api/rooms/${chatRoom.token}/messages/file`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
    });
    setChatMessages(prev => {
      if (prev.some(m => m.id === res.data.id)) return prev;
      return [...prev, res.data];
    });
  };

  const handleDeleteMessage = async (id: string) => {
    if (!chatRoom) return;
    try {
      await api.delete(`/api/rooms/${chatRoom.token}/messages/${id}`);
      setChatMessages(prev => prev.filter(m => m.id !== id));
      toast.success('Message deleted');
    } catch {
      toast.error('Failed to delete message');
      return false;
    }
  };

  const handleBatchDeleteMessages = async (ids: string[]) => {
    if (!chatRoom || !ids.length) return false;
    try {
      await api.post(`/api/rooms/${chatRoom.token}/messages/batch-delete`, { ids });
      setChatMessages(prev => prev.filter(m => !ids.includes(m.id)));
      toast.success(`${ids.length} message${ids.length > 1 ? 's' : ''} deleted`);
      return true;
    } catch {
      toast.error('Failed to delete messages');
      return false;
    }
  };

  const handlePinMessage = async (id: string) => {
    if (!chatRoom) return;
    try {
      const res = await api.post(`/api/rooms/${chatRoom.token}/messages/${id}/pin`);
      setChatMessages(prev => prev.map(m => m.id === id ? { ...m, is_pinned: res.data.is_pinned } : m));
    } catch {
      toast.error('Failed to toggle pin');
    }
  };

  const handleReact = async (msgId: string, emoji: string, forceRemove: boolean) => {
    if (!chatRoom) return;
    try {
      await api.post(`/api/rooms/${chatRoom.token}/messages/${msgId}/react`, {
        emoji,
        userId: 'owner',
        forceRemove
      });
    } catch {
      toast.error('Failed to react');
    }
  };

  const handleViewMessage = async (msgId: string) => {
    if (!chatRoom) return;
    try {
      const res = await api.post(`/api/rooms/${chatRoom.token}/messages/${msgId}/view`);
      if (res.data.viewed_at) {
        setChatMessages(prev => prev.map(m => m.id === msgId ? { ...m, viewed_at: res.data.viewed_at } : m));
      }
    } catch {}
  };

  const handleBurnMessage = async (msgId: string) => {
    if (!chatRoom) return;
    try {
      await api.post(`/api/rooms/${chatRoom.token}/messages/${msgId}/burn`);
      setChatMessages(prev => prev.map(m => m.id === msgId ? { ...m, type: 'burned', content: null, file_url: null, file_name: null } : m));
    } catch {}
  };

  const handleExportChat = () => {
    if (!chatRoom || chatMessages.length === 0) {
      toast('No messages to export', { icon: 'ℹ️' });
      return;
    }

    let text = `# GhostVault Chat Export: Room ${chatRoom.token}\n`;
    text += `Generated: ${new Date().toLocaleString()}\n\n---\n\n`;
    
    chatMessages.forEach((m: any) => {
      const time = new Date(m.created_at).toLocaleString();
      const sender = m.sender === 'owner' ? 'Owner' : 'Guest';
      
      text += `**${sender}** _(${time})_  \n`;
      
      if (m.type === 'text') {
        // Replace single newlines with markdown line breaks (two spaces + newline)
        const formattedContent = m.content.replace(/\n/g, '  \n');
        text += `${formattedContent}\n\n`;
      } else if (m.type === 'image' || m.type === 'file') {
        text += `> 📎 [${m.type.toUpperCase()}] ${m.file_name}\n\n`;
      } else if (m.type === 'burned') {
        text += `> 🔥 [BURNED MESSAGE]\n\n`;
      }
    });

    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GhostVault_Chat_${chatRoom.token}_${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Chat exported successfully');
  };

  const handleRoomUpdate = (updatedRoom: any) => {
    setRooms(prev => prev.map(r => r.token === updatedRoom.token ? { ...r, ...updatedRoom } : r));
    if (chatRoom?.token === updatedRoom.token) {
      setChatRoom((prev: any) => ({ ...prev, ...updatedRoom }));
    }
  };


  const handleDelete = (id: string) => confirmAction({
    title: 'Delete file?', item: uploads.find(u => u.id === id)?.file_name || 'Selected file',
    description: 'This permanently deletes the file from your vault. Its shared link will stop working. This cannot be undone.',
    label: 'Delete file', action: () => performDelete(id),
  });
  const handleDeleteBug = (id: string) => confirmAction({
    title: 'Delete bug report?', item: bugReports.find(b => b.id === id)?.description || 'Selected bug report',
    description: 'This permanently removes the report. This cannot be undone.',
    label: 'Delete report', action: () => performDeleteBug(id),
  });
  const handleRevoke = (token: string) => confirmAction({
    title: 'Revoke tunnel access?', item: token,
    description: 'Guests will be disconnected and this link will stop accepting access. The tunnel remains in your history.',
    label: 'Revoke access', action: () => performRevoke(token),
  });
  const handlePermanentDelete = (token: string) => confirmAction({
    title: 'Permanently delete tunnel?', item: token,
    description: 'This deletes the tunnel and its messages and files. This cannot be undone.',
    label: 'Delete tunnel', action: () => performPermanentDelete(token),
  });

  const changeVisibility = (room: any) => {
    const next = room.visibility === 'personal' ? 'shared' : 'personal';
    setShowChatMenu(false);
    confirmAction({
      title: next === 'shared' ? 'Share the entire chat?' : 'Make this chat personal?',
      item: room.note || room.token,
      description: next === 'shared'
        ? 'Anyone with the link will be able to read ALL existing notes and files, and send messages. Previously shared links will work again. Review your history before continuing.'
        : 'Guest access will close. Only your signed-in account can open the chat. Previously downloaded files and copied file URLs cannot be recalled.',
      label: next === 'shared' ? 'Share entire chat' : 'Make personal',
      action: async () => {
        const res = await api.patch('/api/rooms/' + room.token, { visibility: next, confirmPublish: next === 'shared' });
        if (res.data.room?.visibility !== next) throw new Error('Server does not support personal chats yet');
        handleRoomUpdate(res.data.room);
        setChatScope(next);
        toast.success(next === 'personal' ? 'Chat is now personal' : 'Chat is now shared by link');
      },
    });
  };
  const scopedRooms = rooms.filter(r => (r.visibility || 'shared') === chatScope);
  const totalPages = Math.ceil(totalUploads / 10);

  return (
    <div className="dashboard-shell flex h-screen w-full bg-bgBase text-textPrimary overflow-hidden font-ui selection:bg-accent/30">

      {confirmationDialog}
      {/* Desktop Sidebar */}
      <aside className={`dashboard-sidebar shrink-0 hidden md:flex static top-0 left-0 h-full bg-bgCard border-borderBase flex-col z-50 transition-all duration-300 overflow-hidden ${desktopSidebarOpen ? 'w-64 border-r' : 'w-0 border-r-0'}`}>
        <div className="p-5 border-b border-borderBase flex items-center justify-between shrink-0 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <GhostLogo className="text-accent w-6 h-6 shrink-0" />
            <div>
              <div className="font-display font-bold text-sm tracking-wide">GhostVault</div>
              <div className="text-[11px] text-accent font-ui ">Personal workspace</div>
            </div>
          </div>
          <button onClick={() => setDesktopSidebarOpen(false)} className="text-textSecondary hover:text-textPrimary transition-colors" title="Collapse Sidebar">
            <Menu size={18} />
          </button>
        </div>

        <div className="flex-1 p-3 space-y-1.5 overflow-y-auto whitespace-nowrap">
          <div className="text-xs text-textGhost uppercase font-ui tracking-widest font-bold px-3 py-3">Workspace</div>

          <button onClick={() => { setActiveTab('dashboard'); setChatRoom(null); }} className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-sm border transition-colors ${activeTab === 'dashboard' ? 'bg-accent/10 text-accent border-accent/20' : 'text-textSecondary hover:text-textPrimary hover:bg-bgHover border-transparent'}`}>
            <Activity size={16} /> Dashboard
          </button>
          <button onClick={() => { setActiveTab('assets'); setChatRoom(null); }} className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-sm border transition-colors ${activeTab === 'assets' ? 'bg-accent/10 text-accent border-accent/20' : 'text-textSecondary hover:text-textPrimary hover:bg-bgHover border-transparent'}`}>
            <FolderLock size={16} /> Files
          </button>
          <button onClick={() => { setActiveTab('nodes'); if (chatRoom) setDesktopSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-sm border transition-colors ${activeTab === 'nodes' ? 'bg-accent/10 text-accent border-accent/20' : 'text-textSecondary hover:text-textPrimary hover:bg-bgHover border-transparent'}`}>
            <MessageSquare size={16} /> Chats
          </button>
          <button onClick={() => { setActiveTab('bugs'); setChatRoom(null); }} className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-sm border transition-colors ${activeTab === 'bugs' ? 'bg-accent/10 text-accent border-accent/20' : 'text-textSecondary hover:text-textPrimary hover:bg-bgHover border-transparent'}`}>
            <Bug size={16} /> Bug Reports
            {bugReports.length > 0 && <span className="ml-auto text-[11px] font-ui font-bold bg-accent/20 text-accent px-1.5 py-0.5 rounded-sm border border-accent/20">{bugReports.length}</span>}
          </button>

          <button onClick={() => { navigate('/', { state: { fromSidebar: true } }); setChatRoom(null); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-sm border transition-colors text-textSecondary hover:text-textPrimary hover:bg-bgHover border-transparent">
            <Info size={16} /> About System
          </button>
        </div>



        <div className="p-4 border-t border-borderBase bg-bgBase/50">
          {isFileSystemAccessSupported() && (
            <div className="mb-4 flex flex-col gap-2">
              <button onClick={handleSetDownloadDir} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-ui font-bold rounded-sm border border-accent/30 bg-accent/5 text-accent hover:bg-accent/10 transition-colors uppercase tracking-wider">
                <FolderLock size={14} /> {downloadDir ? 'Vault: ' + downloadDir.name : 'Set Save Folder'}
              </button>
              {downloadDir && (
                <button onClick={handleClearDownloadDir} className="text-xs text-textSecondary hover:text-danger font-ui transition-colors text-center uppercase">
                  Clear Folder
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-sm bg-bgCard flex items-center justify-center border border-borderActive text-accent font-ui text-sm font-bold shrink-0">
              {user?.email?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-ui font-medium truncate text-textPrimary">{user?.email}</div>
              <div className="text-xs text-success font-ui flex items-center gap-1 mt-0.5"><ShieldAlert size={10} /> Signed in</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={toggleTheme} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-sm border border-borderBase bg-bgCard text-textSecondary hover:text-textPrimary hover:bg-bgHover transition-colors" title="Toggle Theme">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button onClick={logout} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-ui font-bold rounded-sm border border-danger/30 text-danger hover:bg-danger hover:text-white transition-colors uppercase tracking-wider">
              <LogOut size={14} /> Sign out
            </button>
          </div>
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
              className="dashboard-more-sheet absolute bottom-0 left-0 right-0 bg-bgCard border-t border-borderBase rounded-t-3xl p-6 flex flex-col pb-safe-bottom shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-borderActive rounded-full mx-auto mb-8 opacity-50" />

              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center border border-accent/20 text-accent font-display text-lg font-bold shrink-0">
                  {user?.email?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold truncate text-textPrimary font-display">{user?.email}</div>
                  <div className="text-xs text-success font-ui flex items-center gap-1 mt-1 uppercase tracking-wider font-bold"><ShieldAlert size={12} /> Sec_Ops Admin</div>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-3 mb-8">
                <button onClick={() => { setActiveTab('dashboard'); setSidebarOpen(false); }} className={`flex flex-col items-center justify-center gap-3 p-3 rounded-2xl transition-colors ${activeTab === 'dashboard' ? 'bg-accent/10 text-accent' : 'bg-bgBase text-textSecondary hover:text-textPrimary border border-borderBase'}`}>
                  <Activity size={24} />
                  <span className="text-xs font-bold">Dash</span>
                </button>
                <button onClick={() => { setActiveTab('assets'); setSidebarOpen(false); }} className={`flex flex-col items-center justify-center gap-3 p-3 rounded-2xl transition-colors ${activeTab === 'assets' ? 'bg-accent/10 text-accent' : 'bg-bgBase text-textSecondary hover:text-textPrimary border border-borderBase'}`}>
                  <FolderLock size={24} />
                  <span className="text-xs font-bold">Assets</span>
                </button>
                <button onClick={() => { setActiveTab('nodes'); setSidebarOpen(false); }} className={`flex flex-col items-center justify-center gap-3 p-3 rounded-2xl transition-colors ${activeTab === 'nodes' ? 'bg-accent/10 text-accent' : 'bg-bgBase text-textSecondary hover:text-textPrimary border border-borderBase'}`}>
                  <MessageSquare size={24} />
                  <span className="text-xs font-bold">Tunnels</span>
                </button>
                <button onClick={() => { setActiveTab('bugs'); setSidebarOpen(false); }} className={`flex flex-col items-center justify-center gap-3 p-3 rounded-2xl transition-colors relative ${activeTab === 'bugs' ? 'bg-accent/10 text-accent' : 'bg-bgBase text-textSecondary hover:text-textPrimary border border-borderBase'}`}>
                  <Bug size={24} />
                  <span className="text-xs font-bold">Bugs</span>
                  {bugReports.length > 0 && <span className="absolute top-1 right-1 w-4 h-4 text-[8px] flex items-center justify-center bg-accent text-white rounded-full font-bold">{bugReports.length > 9 ? '9+' : bugReports.length}</span>}
                </button>
                <button onClick={() => { setSidebarOpen(false); navigate('/', { state: { fromSidebar: true } }); }} className="flex flex-col items-center justify-center gap-3 p-3 rounded-2xl transition-colors bg-bgBase text-textSecondary hover:text-textPrimary border border-borderBase">
                  <Info size={24} />
                  <span className="text-xs font-bold">About</span>
                </button>
              </div>


              {isFileSystemAccessSupported() && (
                <div className="mb-4 flex flex-col gap-2">
                  <div className="text-xs font-ui text-textGhost  text-center">Local Vault Directory</div>
                  <button onClick={handleSetDownloadDir} className="flex items-center justify-center gap-2 py-2 rounded-xl border border-accent/30 bg-accent/5 text-accent hover:bg-accent/10 transition-colors text-sm font-bold w-full">
                    <FolderLock size={16} /> {downloadDir ? `Vault: ${downloadDir.name}` : 'Set Save Folder'}
                  </button>
                  {downloadDir && (
                    <button onClick={handleClearDownloadDir} className="text-xs text-textSecondary hover:text-danger font-ui transition-colors">
                      Clear configured folder
                    </button>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => { toggleTheme(); setSidebarOpen(false); }} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border border-borderBase bg-bgBase text-textSecondary hover:text-textPrimary transition-colors text-sm font-bold">
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />} Theme
                </button>
                <button onClick={logout} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-danger/10 text-danger hover:bg-danger hover:text-white transition-colors text-sm font-bold">
                  <LogOut size={18} /> Sign out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main
        className="dashboard-main min-w-0 flex-1 flex flex-col h-full overflow-hidden relative bg-bgBase cursor-default"

      >
        {uploadProgress && <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent z-50 animate-glowPulse" />}

        {activeTab === 'nodes' ? (
          <div className="flex flex-1 h-full overflow-hidden bg-bgBase animate-fadeIn relative">
            {/* Split Pane Sidebar */}
            <div className={`tunnel-list shrink-0 w-full md:w-80 flex-col border-r border-borderBase bg-bgCard z-10 pb-16 md:pb-0 ${chatRoom ? 'hidden md:flex' : 'flex'}`}>
              <div className="p-4 border-b border-borderBase bg-bgBase/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {!desktopSidebarOpen && (
                    <button aria-label="Expand sidebar" onClick={() => setDesktopSidebarOpen(true)} className="hidden md:flex p-1.5 text-textSecondary hover:text-textPrimary hover:bg-bgHover rounded-md transition-colors mr-1">
                      <Menu size={16} />
                    </button>
                  )}
                  <h2 className="font-ui text-sm font-bold  text-textPrimary flex items-center gap-2">
                    <MessageSquare size={16} className="text-textSecondary" /> Chats
                  </h2>
                </div>

                <button
                  className="flex items-center gap-1.5 h-7 px-2.5 rounded-sm bg-accent/10 text-accent hover:bg-accent hover:text-white border border-accent/20 transition-colors text-xs font-bold "
                  onClick={() => setShowCreateRoom(true)}
                >
                  <Plus size={12} /> Create
                </button>
              </div>

              <div className="chat-scope-tabs" role="tablist" aria-label="Chat audience">
                {[
                  { id: 'shared', label: '🌐 Shared' },
                  { id: 'personal', label: '🔒 Notes' },
                  { id: 'api', label: '⚡ APIs' },
                ].map(scope => (
                  <button key={scope.id} role="tab" aria-selected={chatScope === scope.id} onClick={() => setChatScope(scope.id)}>
                    <span>{scope.label}</span>
                    <span className="count">{rooms.filter(r => (r.visibility || 'shared') === scope.id && isRoomValid(r)).length}</span>
                  </button>
                ))}
              </div>
              {/* Search Bar */}
              <div className="px-4 pb-2">
                <div className="relative group">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textGhost group-focus-within:text-accent transition-colors" size={14} />
                  <input
                    id="tunnel-search"
                    type="text"
                    placeholder="Search chats…"
                    value={tunnelSearch}
                    onChange={(e) => setTunnelSearch(e.target.value)}
                    className="w-full bg-bgBase border border-borderBase rounded-md py-1.5 pl-8 pr-3 text-[11px] font-ui focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all placeholder:text-textGhost"
                  />
                  {tunnelSearch && (
                    <button onClick={() => setTunnelSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-textGhost hover:text-textPrimary">
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                <div className="text-xs font-ui font-bold text-textGhost  px-2 mb-1 flex justify-between">
                  <span>
                    {chatScope === 'personal'
                      ? 'Your personal notes'
                      : chatScope === 'api'
                      ? 'Developer API Webhooks'
                      : 'Shared conversations'}
                  </span>
                  {tunnelSearch && <span className="text-accent/60 lowercase italic">filtering...</span>}
                </div>
                {scopedRooms.filter(isRoomValid).length === 0 && (
                  <div className="chat-list-empty">
                    <p>
                      {chatScope === 'personal'
                        ? 'A quiet place for your notes.'
                        : chatScope === 'api'
                        ? 'No API webhook feeds yet. Create one to receive payloads from external apps!'
                        : 'No shared conversations yet.'}
                    </p>
                    <button className="btn btn-secondary" onClick={() => setShowCreateRoom(true)}>
                      {chatScope === 'api' ? 'Create Project Feed' : 'Create a chat'}
                    </button>
                  </div>
                )}
                {scopedRooms
                  .filter(isRoomValid)
                  .filter(r => r.token.toLowerCase().includes(tunnelSearch.toLowerCase()) || (r.note && r.note.toLowerCase().includes(tunnelSearch.toLowerCase())))
                  .map(r => (
                    <CompactRoomRow
                      key={r.id}
                      room={r}
                      onQR={() => setQrRoom({ token: r.token, expiresAt: r.expires_at, view_once: r.view_once })}
                      onRevoke={() => handleRevoke(r.token)}
                      onTogglePause={() => handleTogglePause(r.token, r.is_paused)}
                      onPermanentDelete={() => handlePermanentDelete(r.token)}
                      onChat={() => openChat(r)}
                      onEdit={() => setEditRoom(r)}
                      onDocs={() => setDocsRoom(r)}
                      isSelected={chatRoom && r.token === chatRoom.token}
                    />
                  ))}

                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full flex items-center justify-between text-xs font-ui font-bold text-textGhost  mt-4 px-2 py-2 hover:text-textPrimary transition-colors border-t border-borderBase"
                >
                  <span>Closed chats</span>
                  {showHistory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                <AnimatePresence>
                  {showHistory && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden flex flex-col gap-1.5"
                    >
                      {scopedRooms.filter(r => !isRoomValid(r)).map(r => (
                        <CompactRoomRow
                          key={r.id}
                          room={r}
                          onTogglePause={() => handleTogglePause(r.token, isRoomValid(r))}
                          onPermanentDelete={() => handlePermanentDelete(r.token)}
                          onChat={() => openChat(r)}
                          onEdit={() => setEditRoom(r)}
                          onDocs={() => setDocsRoom(r)}
                          isSelected={chatRoom && r.token === chatRoom.token}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Chat Area */}
            <div className={`flex-1 flex-col h-full bg-bgBase relative z-20 min-w-0 overflow-hidden ${!chatRoom ? 'hidden md:flex' : 'flex'}`}>
              {chatRoom ? (
                <>
                  <div className="p-4 border-b border-borderBase flex items-center justify-between bg-bgCard/80 backdrop-blur-md z-30">
                    <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                      <button className="md:hidden p-2 text-textSecondary hover:text-textPrimary hover:bg-bgHover rounded-md transition-colors" aria-label="Back to tunnels" onClick={closeChat}>
                        <ChevronLeft size={20} />
                      </button>
                      {!desktopSidebarOpen && (
                        <button aria-label="Expand sidebar" onClick={() => setDesktopSidebarOpen(true)} className="hidden md:flex p-2 text-textSecondary hover:text-textPrimary hover:bg-bgHover rounded-md transition-colors">
                          <Menu size={18} />
                        </button>
                      )}

                      <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                        <Terminal size={18} className="text-accent" />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-accent font-bold tracking-wider text-sm truncate">{chatRoom.note || chatRoom.token}</span>
                          <span className={chatRoom.visibility === 'personal' ? 'audience-badge' : chatRoom.is_paused ? 'audience-badge audience-badge--paused' : 'audience-badge audience-badge--shared'}>
                            {chatRoom.visibility === 'personal' ? '🔒 Saved Notes' : chatRoom.is_paused ? '⏸️ Paused' : '🌐 Live Tunnel'}
                          </span>
                          {chatRoom.visibility !== 'personal' && (isRoomValid(chatRoom) ? (
                            chatRoom.is_paused ? (
                              <span className="text-[11px] font-bold  text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-sm flex items-center gap-1 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                                PAUSED
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold  text-bgBase bg-accent px-1.5 py-0.5 rounded-sm flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-bgBase animate-pulse" /> LIVE
                              </span>
                            )
                          ) : (
                            <span className="text-[11px] font-bold  text-textGhost bg-bgCard border border-borderBase px-1.5 py-0.5 rounded-sm">
                              Closed
                            </span>
                          ))}
                        </div>
                        {chatRoom.note ? (
                          <span className="text-xs text-textSecondary font-ui truncate">{chatRoom.note}</span>
                        ) : (
                          <span className="text-xs text-textGhost font-ui truncate">Secure Connection established</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="p-2 text-textSecondary hover:text-textPrimary hover:bg-bgHover rounded-md transition-colors" onClick={handleExportChat} title="Export Chat Log">
                        <Download size={18} />
                      </button>
                      <button className="p-2 text-accent hover:text-accent hover:bg-accent/10 rounded-md transition-colors" onClick={() => setShowBugModal(true)} title="Report a Bug">
                        <Bug size={18} />
                      </button>

                      {/* Dropdown Menu */}
                      <div className="relative" ref={chatMenuRef}>
                        <button 
                          onClick={() => setShowChatMenu(!showChatMenu)}
                          className={`p-2 rounded-md transition-colors ${showChatMenu ? 'bg-bgHover text-textPrimary' : 'text-textSecondary hover:text-textPrimary hover:bg-bgHover'}`}
                        >
                          <MoreVertical size={18} />
                        </button>
                        
                        <AnimatePresence>
                          {showChatMenu && (
                            <motion.div
                              initial={{ opacity: 0, y: 5, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 5, scale: 0.95 }}
                              transition={{ duration: 0.15 }}
                              className="absolute right-0 top-full mt-2 w-48 bg-bgCard border border-borderBase rounded-md shadow-2xl overflow-hidden z-50 flex flex-col p-1"
                            >
                              {chatRoom.visibility !== 'personal' && chatRoom.visibility !== 'api' && <>
                              <button
                                onClick={() => { copyToClipboard(`${BASE_URL}/r/${chatRoom.token}`); setShowChatMenu(false); }}
                                className="w-full text-left px-3 py-2 text-xs font-ui font-bold  text-textSecondary hover:text-textPrimary hover:bg-bgHover rounded-sm flex items-center gap-2 transition-colors"
                              >
                                <Copy size={14} /> Copy Link
                              </button>
                              
                              <button
                                onClick={() => { setQrRoom({ token: chatRoom.token, expiresAt: chatRoom.expires_at, viewOnce: chatRoom.view_once }); setShowChatMenu(false); }}
                                className="w-full text-left px-3 py-2 text-xs font-ui font-bold  text-textSecondary hover:text-textPrimary hover:bg-bgHover rounded-sm flex items-center gap-2 transition-colors"
                              >
                                <QrCode size={14} /> View QR
                              </button>
                              </>}

                              {chatRoom.visibility === 'api' && (
                                <>
                                  <button
                                    onClick={() => {
                                      setDocsRoom(chatRoom);
                                      setShowChatMenu(false);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-ui font-bold text-accent hover:bg-bgHover rounded-sm flex items-center gap-2 transition-colors"
                                  >
                                    <Info size={14} /> How to Send Data
                                  </button>
                                  <button
                                    onClick={() => {
                                      const base = window.location.origin.replace(/:\d+$/, ':4000');
                                      copyToClipboard(`${base}/api/ingest/${chatRoom.note || chatRoom.token}`, 'Webhook URL copied!');
                                      setShowChatMenu(false);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-ui font-bold text-textSecondary hover:text-textPrimary hover:bg-bgHover rounded-sm flex items-center gap-2 transition-colors"
                                  >
                                    <Zap size={14} /> Copy Ingest URL
                                  </button>
                                </>
                              )}
                              
                              <button
                                onClick={() => { setEditRoom(chatRoom); setShowChatMenu(false); }}
                                className="w-full text-left px-3 py-2 text-xs font-ui font-bold  text-textSecondary hover:text-textPrimary hover:bg-bgHover rounded-sm flex items-center gap-2 transition-colors"
                              >
                                <Pencil size={14} /> {chatRoom.visibility === 'api' ? 'Project Settings' : 'Edit Room'}
                              </button>

                              {chatRoom.visibility !== 'personal' && chatRoom.visibility !== 'api' && isRoomValid(chatRoom) && (
                                <button
                                  onClick={() => { handleTogglePause(chatRoom.token, chatRoom.is_paused); setShowChatMenu(false); }}
                                  className={`w-full text-left px-3 py-2 text-xs font-ui font-bold  hover:bg-bgHover rounded-sm flex items-center gap-2 transition-colors ${chatRoom.is_paused ? 'text-accent hover:text-accent' : 'text-amber-500 hover:text-amber-400'}`}
                                >
                                  {chatRoom.is_paused ? <Play size={14} /> : <Pause size={14} />}
                                  {chatRoom.is_paused ? 'Resume' : 'Pause'}
                                </button>
                              )}

                              {chatRoom.visibility !== 'api' && (
                                <button className="btn btn-secondary" onClick={() => changeVisibility(chatRoom)}>{chatRoom.visibility === 'personal' ? 'Share chat…' : 'Make personal…'}</button>
                              )}
                              <div className="h-px bg-borderBase my-1 mx-2" />

                              <button
                                onClick={() => { handleRevoke(chatRoom.token); setShowChatMenu(false); }}
                                className="w-full text-left px-3 py-2 text-xs font-ui font-bold  text-danger hover:bg-danger/10 rounded-sm flex items-center gap-2 transition-colors"
                              >
                                <X size={14} /> {chatRoom.visibility === 'api' ? 'Deactivate feed' : 'Revoke access'}
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <button className="hidden md:flex p-2 text-textSecondary hover:text-textPrimary hover:bg-bgHover border border-transparent hover:border-borderBase rounded-md transition-colors" aria-label="Back to tunnels" onClick={closeChat}>
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                  <div className={chatRoom.visibility === 'personal' ? 'access-notice' : chatRoom.visibility === 'api' ? 'access-notice access-notice--api' : chatRoom.is_paused ? 'access-notice access-notice--paused' : 'access-notice access-notice--shared'}>
                    {chatRoom.visibility === 'api' ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full py-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold flex items-center gap-1 text-accent text-xs">
                            <Zap size={13} className="shrink-0" />
                            Ingest:
                          </span>
                          <code className="text-[11px] bg-bgCard px-2 py-0.5 rounded border border-borderBase font-mono select-all text-textPrimary">
                            POST /api/ingest/{chatRoom.note || chatRoom.token}
                          </code>
                          <button 
                            type="button"
                            onClick={() => {
                              const base = window.location.origin.replace(/:\d+$/, ':4000');
                              const url = `${base}/api/ingest/${chatRoom.note || chatRoom.token}`;
                              copyToClipboard(url, 'Webhook URL copied!');
                            }}
                            className="text-[10px] px-2 py-0.5 rounded bg-bgHover hover:bg-borderBase border border-borderBase text-textSecondary hover:text-textPrimary transition-colors"
                          >
                            Copy URL
                          </button>
                          <button 
                            type="button"
                            onClick={() => {
                              const base = window.location.origin.replace(/:\d+$/, ':4000');
                              const url = `${base}/api/ingest/${chatRoom.note || chatRoom.token}`;
                              const snippet = `fetch('${url}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Rohit',
    query: 'User feedback or issue details',
    page: window.location.href
  })
});`;
                              copyToClipboard(snippet, 'Frontend fetch() code snippet copied!');
                            }}
                            className="text-[10px] px-2 py-0.5 rounded bg-accent/20 hover:bg-accent text-accent hover:text-white border border-accent/40 transition-colors font-medium"
                          >
                            📋 Copy fetch() Snippet
                          </button>
                          <button 
                            type="button"
                            onClick={() => setDocsRoom(chatRoom)}
                            className="text-[10px] px-2 py-0.5 rounded bg-bgHover hover:bg-borderBase border border-borderBase text-accent hover:text-white transition-colors font-semibold flex items-center gap-1"
                          >
                            📖 How to Send Data
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${chatRoom.discord_webhook_url ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-bgCard text-textGhost border-borderBase'}`}>
                            {chatRoom.discord_webhook_url ? '● Discord Relay Active' : '○ Discord Relay Off'}
                          </span>
                          <button onClick={() => setEditRoom(chatRoom)} className="text-[10px] text-textSecondary hover:text-textPrimary underline">
                            Settings
                          </button>
                        </div>
                      </div>
                    ) : chatRoom.visibility === 'personal' ? (
                      <>
                        <span><Lock size={13} className="shrink-0" /> Personal Saved Notes · Only your account can view these notes</span>
                        <div className="actions">
                          <button onClick={() => changeVisibility(chatRoom)}>Make Public Tunnel…</button>
                        </div>
                      </>
                    ) : chatRoom.is_paused ? (
                      <>
                        <span><Pause size={13} className="shrink-0" /> Shared Tunnel (Paused) · Guest access blocked. Messages remain private until resumed</span>
                        <div className="actions">
                          <button onClick={() => handleTogglePause(chatRoom.token, true)} className="flex items-center gap-1"><Play size={11} /> Resume Live</button>
                          <button onClick={() => changeVisibility(chatRoom)}>Make Personal</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span><Globe size={13} className="shrink-0" /> Public Live Tunnel · Anyone with the 4-char link can view & chat</span>
                        <div className="actions">
                          <button onClick={() => handleTogglePause(chatRoom.token, false)} className="flex items-center gap-1"><Pause size={11} /> Pause Access</button>
                          <button onClick={() => changeVisibility(chatRoom)}>Make Personal</button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                    <ErrorBoundary title="Chat Stream Error" onReset={() => openChat(chatRoom)}>
                      <ChatWindow
                        key={chatRoom.token}
                        socket={socket} token={chatRoom.token} updateMessages={setChatMessages}
                        paused={chatRoom.is_paused} slug={chatRoom.note || chatRoom.token} invite={BASE_URL + "/r/" + chatRoom.token}
                        messages={chatMessages}
                        onSendText={handleOwnerSendText}
                        onSendFile={handleOwnerSendFile}
                        onDelete={handleDeleteMessage}
                        onBatchDelete={handleBatchDeleteMessages}
                        onReact={handleReact}
                        onView={handleViewMessage}
                        onBurn={handleBurnMessage}
                        onPin={handlePinMessage}
                        canDelete={true}
                        loading={chatLoading}
                        myRole="owner"
                        audience={chatRoom.visibility === 'personal' ? 'personal' : chatRoom.visibility === 'api' ? 'api' : 'shared'}
                        disabled={!isRoomValid(chatRoom)}
                      />
                    </ErrorBoundary>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-bgBase">
                  <div className="w-20 h-20 rounded-full bg-bgCard border border-borderBase flex items-center justify-center mb-6 shadow-sm">
                    <MessageSquare size={32} className="text-textGhost" />
                  </div>
                  <h3 className="text-lg font-display font-bold text-textPrimary mb-2 ">Open a conversation</h3>
                  <p className="text-sm text-textSecondary font-ui max-w-xs mx-auto">Keep notes in Personal, or open Shared to talk with someone using a link.</p>
                  <button
                    onClick={() => setShowCreateRoom(true)}
                    className="mt-8 px-6 py-2.5 rounded-sm bg-accent text-white font-ui text-xs font-bold  hover:bg-accent/90 transition-all shadow-lg shadow-accent/20"
                  >
                    Initialize Tunnel
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'bugs' ? (
          <div className="dashboard-scroll flex-1 overflow-y-auto p-4 md:p-8 pb-20 md:pb-8 animate-fadeIn">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
                  {!desktopSidebarOpen && (
                    <button aria-label="Expand sidebar" onClick={() => setDesktopSidebarOpen(true)} className="hidden md:flex items-center justify-center text-textSecondary hover:text-textPrimary transition-colors">
                      <Menu size={24} />
                    </button>
                  )}
                  <Bug size={26} className="text-accent" /> Bug Reports
                </h1>
                <p className="text-xs text-textGhost font-ui mt-2">Review issues reported by guests and admins.</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setBugLoading(true);
                    api.get('/api/bugs')
                      .then(res => setBugReports(res.data.reports || []))
                      .catch(() => toast.error('Refresh failed'))
                      .finally(() => setBugLoading(false));
                  }}
                  className="flex items-center gap-2 px-3 h-9 rounded-sm border border-borderBase bg-bgCard text-textSecondary hover:text-textPrimary hover:bg-bgHover text-xs font-ui font-bold  transition-colors disabled:opacity-40"
                  disabled={bugLoading}
                >
                  <RefreshCw size={13} className={bugLoading ? 'animate-spin' : ''} /> Refresh
                </button>
                <div className="font-ui text-xs text-accent bg-accent/10 border border-accent/20 px-3 py-1.5 rounded-sm">
                  {bugReports.length} TOTAL
                </div>
              </div>
            </div>

            {/* Support email banner */}
            <div className="flex items-center gap-3 p-4 mb-6 bg-accent/5 border border-accent/20 rounded-sm">
              <MailOpen size={18} className="text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-ui text-textGhost ">Direct support channel</div>
                <a href="mailto:support@rohitkumarranjan.in" className="break-all text-sm font-bold text-accent hover:underline">support@rohitkumarranjan.in</a>
              </div>
              <span className="text-[11px] font-ui text-textGhost  border border-borderBase px-2 py-1 rounded-sm shrink-0">Admin Only</span>
            </div>

            {/* Reports list */}
            {bugLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-28 bg-bgCard border border-borderBase rounded-sm animate-pulse" />
                ))}
              </div>
            ) : bugReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-borderBase rounded-sm text-center">
                <Bug size={40} className="text-textGhost mb-4 opacity-30" />
                <div className="font-ui text-sm text-textGhost ">No reports yet</div>
                <p className="text-xs text-textGhost mt-2 opacity-60">Bug reports from guests and admins will appear here</p>
              </div>
            ) : (
              <AnimatePresence>
                <div className="flex flex-col gap-3">
                  {bugReports.map((report: any, i: number) => (
                    <motion.div
                      key={report.id || i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.2 }}
                      className="bg-bgCard border border-borderBase rounded-sm p-5 hover:border-accent/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[11px] font-ui font-bold  px-2 py-0.5 rounded-sm border ${
                            report.role === 'owner'
                              ? 'bg-accent/10 text-accent border-accent/20'
                              : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          }`}>
                            {report.role === 'owner' ? '👤 Admin' : '🧑 Guest'}
                          </span>
                          <span className={`text-[11px] font-ui font-bold  px-2 py-0.5 rounded-sm border ${
                            report.source === 'supabase'
                              ? 'bg-green-500/10 text-green-400 border-green-500/20'
                              : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                          }`}>
                            {report.source === 'supabase' ? 'DB: Supabase' : 'DB: Local'}
                          </span>
                          {report.page && (
                            <span className="text-[11px] font-ui text-textGhost bg-bgBase border border-borderBase px-2 py-0.5 rounded-sm">
                              {report.page}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-ui text-textGhost shrink-0">
                          {new Date(report.created_at).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                      </div>

                      <p className="break-words text-sm text-textPrimary leading-relaxed font-ui whitespace-pre-wrap mb-4 bg-bgBase border border-borderBase rounded-sm p-3">
                        {report.description}
                      </p>

                      <div className="flex flex-wrap gap-3 items-center justify-between border-t border-borderBase pt-3">
                        {report.email ? (
                          <a href={`mailto:${report.email}`} className="flex items-center gap-1.5 text-xs font-ui text-accent hover:underline">
                            <MailOpen size={11} /> {report.email}
                          </a>
                        ) : (
                          <span className="text-xs font-ui text-textGhost italic">No contact email</span>
                        )}
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-ui text-textGhost opacity-40">#{i + 1} of {bugReports.length}</span>
                          <button
                            onClick={() => handleDeleteBug(report.id)}
                            className="p-1.5 text-textGhost hover:text-danger hover:bg-danger/10 rounded-sm transition-colors"
                            title="Delete Bug Report"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </AnimatePresence>
            )}
          </div>
        ) : (
          <>
            <div className="dashboard-scroll flex-1 overflow-y-auto p-4 md:p-8 pb-20 pt-safe-top md:pb-8">

              {/* Dashboard Header */}
              <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end mb-8 gap-6 relative">
                <div className="w-full flex justify-between items-start xl:w-auto xl:justify-start">
                  <div>
                    <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
                      {!desktopSidebarOpen && (
                        <button aria-label="Expand sidebar" onClick={() => setDesktopSidebarOpen(true)} className="hidden md:flex items-center justify-center text-textSecondary hover:text-textPrimary transition-colors" title="Expand Sidebar">
                          <Menu size={24} />
                        </button>
                      )}
                      <GhostLogo className="text-accent w-7 h-7 shrink-0" /> Your workspace
                    </h1>
                    <div className="dashboard-status text-textSecondary text-xs md:text-sm font-ui flex items-center gap-3 bg-bgCard border border-borderBase px-3 py-1.5 rounded-sm inline-flex">
                      <span className="text-success flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> Connected</span>
                      <span className="text-borderActive">|</span>
                      <span>NODE: {user?.email?.split('@')[0]}</span>
                      <span className="text-borderActive hidden sm:inline">|</span>
                      <span className="hidden sm:inline">IP: {clientIp}</span>
                      <span className="text-borderActive hidden md:inline">|</span>
                      <span className="hidden md:inline font-bold text-accent uppercase tracking-tighter">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' })} UTC</span>
                    </div>

                  </div>
                  <button onClick={toggleTheme} className="xl:hidden w-10 h-10 flex items-center justify-center shrink-0 rounded-sm border border-borderBase bg-bgCard text-textSecondary hover:text-textPrimary hover:bg-bgHover transition-colors" title="Toggle Theme">
                    {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                  </button>
                </div>

                {/* ── Interactive 4-Metric Command Deck ── */}
                <div className="flex gap-2.5 overflow-x-auto w-full xl:w-auto snap-x pb-2 xl:pb-0 scrollbar-hide items-stretch">
                  <button onClick={toggleTheme} className="hidden xl:flex w-11 items-center justify-center shrink-0 rounded-sm border border-borderBase bg-bgCard text-textSecondary hover:text-textPrimary hover:bg-bgHover transition-colors mr-1 self-stretch" title="Toggle Theme">
                    {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                  </button>

                  {/* Card 1: Public Tunnels */}
                  <button
                    type="button"
                    onClick={() => { setActiveTab('nodes'); setChatScope('shared'); setChatRoom(null); }}
                    className={`command-card group snap-center shrink-0 bg-bgCard border rounded-sm p-2.5 px-3.5 flex flex-col text-left shadow-sm min-w-[135px] transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 ${
                      activeTab === 'nodes' && chatScope === 'shared'
                        ? 'border-accent bg-accent/10 ring-1 ring-accent/30'
                        : 'border-borderBase hover:border-accent/40 hover:bg-bgHover'
                    }`}
                    title="Jump to Public Live Tunnels"
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-0.5">
                      <span className="text-[11px] text-textGhost group-hover:text-textSecondary font-ui font-bold flex items-center gap-1.5 transition-colors">
                        <Globe size={13} className="text-emerald-400" /> Tunnels
                      </span>
                      <span className="text-[10px] text-textGhost group-hover:text-accent font-ui transition-colors">→</span>
                    </div>
                    <span className="font-ui text-2xl font-bold text-accent">
                      {rooms.filter(r => (r.visibility || 'shared') === 'shared' && isRoomValid(r)).length}
                    </span>
                    <span className="text-[10px] text-textGhost truncate font-ui mt-0.5">Live guest links</span>
                  </button>

                  {/* Card 2: Private Notes */}
                  <button
                    type="button"
                    onClick={() => { setActiveTab('nodes'); setChatScope('personal'); setChatRoom(null); }}
                    className={`command-card group snap-center shrink-0 bg-bgCard border rounded-sm p-2.5 px-3.5 flex flex-col text-left shadow-sm min-w-[135px] transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 ${
                      activeTab === 'nodes' && chatScope === 'personal'
                        ? 'border-sky-400 bg-sky-500/10 ring-1 ring-sky-400/30'
                        : 'border-borderBase hover:border-sky-400/40 hover:bg-bgHover'
                    }`}
                    title="Jump to Encrypted Private Notes"
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-0.5">
                      <span className="text-[11px] text-textGhost group-hover:text-textSecondary font-ui font-bold flex items-center gap-1.5 transition-colors">
                        <Lock size={13} className="text-sky-400" /> Notes
                      </span>
                      <span className="text-[10px] text-textGhost group-hover:text-sky-400 font-ui transition-colors">→</span>
                    </div>
                    <span className="font-ui text-2xl font-bold text-sky-400">
                      {rooms.filter(r => r.visibility === 'personal' && isRoomValid(r)).length}
                    </span>
                    <span className="text-[10px] text-textGhost truncate font-ui mt-0.5">Encrypted scratchpads</span>
                  </button>

                  {/* Card 3: API Feeds */}
                  <button
                    type="button"
                    onClick={() => { setActiveTab('nodes'); setChatScope('api'); setChatRoom(null); }}
                    className={`command-card group snap-center shrink-0 bg-bgCard border rounded-sm p-2.5 px-3.5 flex flex-col text-left shadow-sm min-w-[135px] transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 ${
                      activeTab === 'nodes' && chatScope === 'api'
                        ? 'border-accent bg-accent/15 ring-1 ring-accent/30'
                        : 'border-borderBase hover:border-accent/40 hover:bg-bgHover'
                    }`}
                    title="Jump to Developer API Webhook Feeds"
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-0.5">
                      <span className="text-[11px] text-textGhost group-hover:text-textSecondary font-ui font-bold flex items-center gap-1.5 transition-colors">
                        <Zap size={13} className="text-accent" /> API Feeds
                      </span>
                      <span className="text-[10px] text-textGhost group-hover:text-accent font-ui transition-colors">→</span>
                    </div>
                    <span className="font-ui text-2xl font-bold text-accent">
                      {rooms.filter(r => r.visibility === 'api' && isRoomValid(r)).length}
                    </span>
                    <span className="text-[10px] text-textGhost truncate font-ui mt-0.5">Webhook inboxes</span>
                  </button>

                  {/* Card 4: Vault Assets */}
                  <button
                    type="button"
                    onClick={() => { setActiveTab('assets'); setChatRoom(null); }}
                    className={`command-card group snap-center shrink-0 bg-bgCard border rounded-sm p-2.5 px-3.5 flex flex-col text-left shadow-sm min-w-[135px] transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 ${
                      activeTab === 'assets'
                        ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30'
                        : 'border-borderBase hover:border-amber-500/40 hover:bg-bgHover'
                    }`}
                    title="Jump to Vault Files & Assets"
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-0.5">
                      <span className="text-[11px] text-textGhost group-hover:text-textSecondary font-ui font-bold flex items-center gap-1.5 transition-colors">
                        <Database size={13} className="text-amber-500" /> Assets
                      </span>
                      <span className="text-[10px] text-textGhost group-hover:text-amber-500 font-ui transition-colors">→</span>
                    </div>
                    <span className="font-ui text-2xl font-bold text-amber-500">
                      {totalUploads}
                    </span>
                    <span className="text-[10px] text-textGhost truncate font-ui mt-0.5">Cloud & burn files</span>
                  </button>
                </div>

              </div>

              {/* Paste Zone */}
              <div
                {...getRootProps()}
                className={`upload-dropzone w-full h-20 md:h-24 flex items-center justify-center rounded-sm mb-8 cursor-pointer transition-all duration-200 border-2 border-dashed bg-bgCard ${isDragActive ? 'border-accent bg-accent/5' : 'border-borderActive hover:border-textSecondary'} ${pasteFlash ? 'bg-white/10' : ''}`}
              >
                <input {...getInputProps()} />
                <div className="flex items-center gap-3 text-textSecondary text-xs md:text-sm font-ui z-10 pointer-events-none">
                  {uploading
                    ? <><span className="w-4 h-4 border-2 border-textSecondary border-t-accent rounded-full animate-spin" /> Uploading...</>
                    : isDragActive
                      ? <><Upload size={16} className="text-accent animate-bounce" /><span className="text-accent font-bold">Drop files to upload</span></>
                      : <><Clipboard size={14} className="text-textGhost" /><span><kbd className="px-1.5 py-0.5 bg-bgBase border border-borderBase rounded-sm text-xs text-textPrimary">CTRL+V</kbd> Paste, drop files, or tap to browse</span></>
                  }
                </div>
              </div>



              <div className={`grid grid-cols-1 ${activeTab === 'dashboard' ? 'xl:grid-cols-[1.5fr_1fr]' : ''} gap-6 items-start`}>

                {/* File Manager (Replaces Gallery) */}
                {(activeTab === 'dashboard' || activeTab === 'assets') && (
                  <section className="bg-bgCard border border-borderBase rounded-sm shadow-md flex flex-col order-2 xl:order-1">
                    <div className="p-4 border-b border-borderBase flex items-center justify-between bg-bgBase/50">
                      <h2 className="font-ui text-sm font-bold  text-textPrimary flex items-center gap-2">
                        <Database size={16} className="text-textSecondary" /> Recent files
                      </h2>
                      <span className="text-xs font-ui text-textGhost border border-borderBase bg-bgCard px-2 py-0.5 rounded-sm">{totalUploads} ITEMS</span>
                    </div>

                    <div className="p-4 flex-1">
                      {loading
                        ? <div className="space-y-2">
                          {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-bgBase border border-borderBase rounded-sm animate-pulse" />)}
                        </div>
                        : uploads.length === 0
                          ? <div className="flex flex-col items-center justify-center h-32 border border-dashed border-borderBase rounded-sm text-textGhost">
                            <span className="font-ui text-xs ">NO_DATA_FOUND</span>
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
                          aria-label="Previous page" disabled={page === 1}
                          onClick={() => setPage(p => p - 1)}
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="text-xs font-ui font-bold text-textSecondary ">PG {page} / {totalPages}</span>
                        <button
                          className="p-1.5 rounded-sm bg-bgCard border border-borderBase text-textSecondary hover:text-textPrimary hover:border-borderActive disabled:opacity-30 transition-colors"
                          aria-label="Next page" disabled={page === totalPages}
                          onClick={() => setPage(p => p + 1)}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    )}
                  </section>
                )}

                {/* DB Orchestrator / Links (Replaces Rooms) */}
                {activeTab === 'dashboard' && (
                  <section className="bg-bgCard border border-borderBase rounded-sm shadow-md flex flex-col order-1 xl:order-2">
                    <div className="p-4 border-b border-borderBase flex items-center justify-between bg-bgBase/50">
                      <h2 className="font-ui text-sm font-bold  text-textPrimary flex items-center gap-2">
                        <Activity size={16} className="text-textSecondary" /> Conversations
                      </h2>
                      <button
                        className="flex items-center gap-1.5 h-7 px-2.5 rounded-sm bg-accent/10 text-accent hover:bg-accent hover:text-white border border-accent/20 transition-colors text-xs font-bold "
                        onClick={() => setShowCreateRoom(true)}
                      >
                        <Plus size={12} /> Create
                      </button>
                    </div>

                    <div className="p-4">
                      <div className="text-xs font-ui font-bold text-textGhost  mb-3 border-b border-borderBase pb-2">Active Connections</div>

                      {rooms.filter(isRoomValid).length === 0
                        ? <div className="flex flex-col items-center justify-center py-6 border border-dashed border-borderBase rounded-sm text-textGhost mb-6">
                          <span className="font-ui text-xs ">No active tunnels. Create one to start sharing.</span>
                        </div>
                        : <div className="flex flex-col mb-6">
                          <AnimatePresence>
                            {rooms.filter(isRoomValid).map(r => (
                              <RoomRow key={r.id} room={r}
                                onQR={() => setQrRoom({ token: r.token, expiresAt: r.expires_at, view_once: r.view_once })}
                                onRevoke={() => handleRevoke(r.token)}
                                onTogglePause={() => handleTogglePause(r.token, r.is_paused)}
                                onPermanentDelete={() => handlePermanentDelete(r.token)}
                                onChat={() => openChat(r)}
                                onEdit={() => setEditRoom(r)}
                                onDocs={() => setDocsRoom(r)}
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                      }

                      <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="w-full flex items-center justify-between text-xs font-ui font-bold text-textGhost  mb-3 border-b border-borderBase pb-2 mt-2 hover:text-textPrimary transition-colors"
                      >
                        <span>Closed chats</span>
                        {showHistory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>

                      <AnimatePresence initial={false}>
                        {showHistory && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            {rooms.filter(r => !isRoomValid(r)).length === 0
                              ? <div className="py-4 text-center"><span className="text-xs font-ui text-textGhost ">Logs empty</span></div>
                              : <div className="flex flex-col">
                                {rooms
                                  .filter(r => !isRoomValid(r))
                                  .filter(r => r.token.toLowerCase().includes(tunnelSearch.toLowerCase()) || (r.note && r.note.toLowerCase().includes(tunnelSearch.toLowerCase())))
                                  .map(r => (
                                    <RoomRow key={r.id} room={r}
                                      onChat={() => openChat(r)}
                                      onPermanentDelete={() => handlePermanentDelete(r.token)}
                                      onEdit={() => setEditRoom(r)}
                                      onDocs={() => setDocsRoom(r)}
                                    />
                                  ))}
                              </div>
                            }
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </section>
                )}
              </div>
            </div>

          </>
        )}
        {/* Mobile Bottom Navigation - Visible on all tabs unless in active chat */}
        {!chatRoom && (
          <nav aria-label="Main navigation" className="dashboard-bottom-nav md:hidden fixed bottom-0 left-0 right-0 h-16 bg-bgCard border-t border-borderBase flex items-center justify-around z-40 pb-safe-bottom">
            <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center justify-center w-14 h-full transition-colors ${activeTab === 'dashboard' ? 'text-accent' : 'text-textSecondary hover:text-textPrimary'}`}>
              <Activity size={20} />
              <span className="text-[11px] font-ui mt-1 font-bold tracking-widest uppercase">Dash</span>
            </button>
            <button onClick={() => setActiveTab('assets')} className={`flex flex-col items-center justify-center w-14 h-full transition-colors ${activeTab === 'assets' ? 'text-accent' : 'text-textSecondary hover:text-textPrimary'}`}>
              <FolderLock size={20} />
              <span className="text-[11px] font-ui mt-1 font-bold tracking-widest uppercase">Assets</span>
            </button>
            <button onClick={() => setActiveTab('nodes')} className={`flex flex-col items-center justify-center w-14 h-full transition-colors ${activeTab === 'nodes' ? 'text-accent' : 'text-textSecondary hover:text-textPrimary'}`}>
              <MessageSquare size={20} />
              <span className="text-[11px] font-ui mt-1 font-bold tracking-widest uppercase">Tunnels</span>
            </button>
            <button onClick={() => setActiveTab('bugs')} className={`relative flex flex-col items-center justify-center w-14 h-full transition-colors ${activeTab === 'bugs' ? 'text-accent' : 'text-textSecondary hover:text-textPrimary'}`}>
              <Bug size={20} />
              <span className="text-[11px] font-ui mt-1 font-bold tracking-widest uppercase">Bugs</span>
              {bugReports.length > 0 && <span className="absolute top-1 right-2 w-4 h-4 text-[8px] flex items-center justify-center bg-accent text-white rounded-full font-bold">{bugReports.length > 9 ? '9+' : bugReports.length}</span>}
            </button>
            <button onClick={() => setSidebarOpen(true)} className="flex flex-col items-center justify-center w-14 h-full text-textSecondary hover:text-textPrimary transition-colors">
              <Menu size={20} />
              <span className="text-[11px] font-ui mt-1 font-bold tracking-widest uppercase">More</span>
            </button>
          </nav>
        )}

        {/* Bug Report FAB (Admin) */}
        <button
          className={`${chatRoom ? 'hidden' : 'flex'} fixed bottom-20 md:bottom-6 right-5 w-11 h-11 rounded-full bg-accent/20 border border-accent/30 text-accent hover:bg-accent hover:text-white hover:border-accent items-center justify-center transition-all shadow-lg hover:shadow-accent/30 z-40`}
          onClick={() => setShowBugModal(true)}
          title="Report a Bug"
        >
          <Bug size={16} />
        </button>
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
            initialVisibility={chatScope || 'shared'}
            onCreate={(r: any) => { setRooms(prev => [r, ...prev]); setChatScope(r.visibility); openChat(r); }}
            onClose={() => setShowCreateRoom(false)}
          />
        )}
        {qrRoom && (
          <QRModal room={qrRoom} onClose={() => setQrRoom(null)} onRevoke={() => { handleRevoke(qrRoom.token); setQrRoom(null); }} />
        )}
        {editRoom && (
          <EditRoomModal
            room={editRoom}
            onVisibilityChange={changeVisibility}
            onClose={() => setEditRoom(null)}
            onUpdated={(updated: any) => { handleRoomUpdate(updated); setEditRoom(null); }}
          />
        )}
        {docsRoom && (
          <ApiDocsModal
            room={docsRoom}
            onClose={() => setDocsRoom(null)}
          />
        )}
        {showBugModal && (
          <AdminBugModal onClose={() => setShowBugModal(false)} />
        )}
      </AnimatePresence>


    </div>
  );
}
