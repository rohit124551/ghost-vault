import { useEffect, useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { useSocket } from '../contexts/SocketContext';
import {
  Plus, Link2, Copy, Trash2, QrCode, X,
  Clock, MessageSquare, ShieldOff, Wifi
} from 'lucide-react';
import './RoomsPage.css';

const BASE_URL = window.location.origin;

// ── QR Modal ──────────────────────────────────────────────────────────────────
function QRModal({ room, onClose }) {
  const link = `${BASE_URL}/r/${room.token}`;
  const copyLink = () => {
    navigator.clipboard.writeText(link);
    toast.success('Link copied!');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal qr-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600 }}>{room.label}</h2>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="qr-wrap">
          <QRCodeSVG
            value={link}
            size={220}
            bgColor="transparent"
            fgColor="#f1f5f9"
            level="M"
          />
        </div>
        <p className="text-sm text-muted" style={{ textAlign: 'center', margin: '16px 0 6px' }}>
          Share this link with your friend:
        </p>
        <div className="room-link-box">
          <span className="room-link-text">{link}</span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={copyLink} data-tooltip="Copy">
            <Copy size={15} />
          </button>
        </div>
        <p className="text-xs text-muted" style={{ textAlign: 'center', marginTop: 12 }}>
          Revoke this room anytime from the Rooms manager. Guest needs no login.
        </p>
      </div>
    </div>
  );
}

// ── Create Room Modal ─────────────────────────────────────────────────────────
function CreateRoomModal({ onCreate, onClose }) {
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await api.post('/api/rooms', { label: label.trim() || undefined });
      onCreate(res.data);
      toast.success(`Room created: ${res.data.token}`);
      onClose();
    } catch {
      toast.error('Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 16 }}>Create Share Room</h2>
        <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: 6 }}>
          Room label (optional)
        </label>
        <input
          className="input"
          placeholder="e.g. For Priya, Project files..."
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') onClose(); }}
          autoFocus
        />
        <p className="text-xs text-muted" style={{ marginTop: 8 }}>
          A unique 6-character token will be generated. Anyone with the link can send you files.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? <><span className="spinner" />Creating…</> : <><Plus size={16} /> Create Room</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Room Messages View ────────────────────────────────────────────────────────
function RoomMessages({ room, onClose }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const { socket, joinRoom } = useSocket();
  const bottomRef = useRef(null);

  useEffect(() => {
    joinRoom(room.token);
    api.get(`/api/room-messages/${room.token}`).then(res => {
      setMessages(res.data || []);
    }).finally(() => setLoading(false));
  }, [room.token]);

  useEffect(() => {
    if (!socket) return;
    const handler = (msg) => {
      if (msg.room_id === room.id) {
        setMessages(prev => [...prev, msg]);
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    };
    socket.on('message:new', handler);
    return () => socket.off('message:new', handler);
  }, [socket, room.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleDeleteMsg = async (id) => {
    try {
      await api.delete(`/api/room-messages/${room.token}/${id}`);
      setMessages(prev => prev.filter(m => m.id !== id));
    } catch {
      toast.error('Delete failed');
    }
  };

  const isImage = (mime) => mime?.startsWith('image/');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal messages-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>{room.label}</h2>
            <code className="room-token" style={{ fontSize: 11 }}>{room.token}</code>
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="messages-list">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <div className="spinner" />
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}>
              <MessageSquare size={32} />
              <p>No messages yet. Waiting for guest…</p>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className="message-bubble">
                <div className="message-content">
                  {msg.message_text && <p className="text-sm">{msg.message_text}</p>}
                  {msg.cloudinary_url && isImage(msg.mime_type) && (
                    <a href={msg.cloudinary_url} target="_blank" rel="noreferrer">
                      <img src={msg.cloudinary_url} alt={msg.file_name} className="message-img" />
                    </a>
                  )}
                  {msg.cloudinary_url && !isImage(msg.mime_type) && (
                    <a
                      href={msg.cloudinary_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-sm"
                      style={{ display: 'inline-flex' }}
                    >
                      📎 {msg.file_name}
                    </a>
                  )}
                </div>
                <div className="message-meta">
                  <span className="text-xs text-muted">
                    {new Date(msg.created_at).toLocaleString()}
                  </span>
                  <button
                    className="btn btn-danger btn-sm btn-icon"
                    onClick={() => handleDeleteMsg(msg.id)}
                    data-tooltip="Delete message"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

// ── Main Rooms Page ───────────────────────────────────────────────────────────
export default function RoomsPage() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [qrRoom, setQrRoom] = useState(null);
  const [viewRoom, setViewRoom] = useState(null);
  const { socket } = useSocket();

  useEffect(() => {
    api.get('/api/rooms').then(res => {
      setRooms(res.data || []);
    }).finally(() => setLoading(false));
  }, []);

  // Socket — live room:revoked event
  useEffect(() => {
    if (!socket) return;
    socket.on('room:revoked', ({ token }) => {
      setRooms(prev => prev.map(r => r.token === token ? { ...r, revoked: true } : r));
    });
    return () => socket.off('room:revoked');
  }, [socket]);

  const handleRevoke = async (room) => {
    if (!confirm(`Revoke room "${room.label}"? The guest link will stop working.`)) return;
    try {
      await api.delete(`/api/rooms/${room.id}`);
      setRooms(prev => prev.map(r => r.id === room.id ? { ...r, revoked: true } : r));
      toast.success('Room revoked');
    } catch {
      toast.error('Failed to revoke room');
    }
  };

  const active = rooms.filter(r => !r.revoked);
  const revoked = rooms.filter(r => r.revoked);

  return (
    <div className="rooms-page">
      {/* Header */}
      <div className="rooms-header">
        <div>
          <h1 className="text-2xl">Share Rooms</h1>
          <p className="text-secondary text-sm" style={{ marginTop: 4 }}>
            Create temporary links for guests to send you files — no login required.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Room
        </button>
      </div>

      {/* Active Rooms */}
      <div className="rooms-section">
        <h2 className="text-md" style={{ fontWeight: 600, marginBottom: 14 }}>
          Active Rooms
          <span className="badge badge-green" style={{ marginLeft: 8 }}>{active.length}</span>
        </h2>

        {loading ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[...Array(3)].map((_, i) => <div key={i} className="room-card-skeleton" />)}
          </div>
        ) : active.length === 0 ? (
          <div className="empty-state">
            <Link2 size={36} />
            <p>No active rooms. Create one to share with a friend.</p>
          </div>
        ) : (
          <div className="rooms-grid">
            {active.map(room => (
              <RoomCard
                key={room.id}
                room={room}
                onQR={() => setQrRoom(room)}
                onView={() => setViewRoom(room)}
                onRevoke={() => handleRevoke(room)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Revoked Rooms */}
      {revoked.length > 0 && (
        <div className="rooms-section" style={{ marginTop: 32 }}>
          <h2 className="text-md" style={{ fontWeight: 600, marginBottom: 14 }}>
            Revoked Rooms
            <span className="badge badge-red" style={{ marginLeft: 8 }}>{revoked.length}</span>
          </h2>
          <div className="rooms-grid">
            {revoked.map(room => (
              <div key={room.id} className="room-card card revoked">
                <div className="room-card-top">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{room.label}</div>
                    <code className="room-token">{room.token}</code>
                  </div>
                  <span className="badge badge-red"><ShieldOff size={11} /> Revoked</span>
                </div>
                <div className="text-xs text-muted" style={{ marginTop: 10 }}>
                  <Clock size={11} style={{ display: 'inline', marginRight: 4 }} />
                  {new Date(room.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateRoomModal
          onCreate={(r) => setRooms(prev => [r, ...prev])}
          onClose={() => setShowCreate(false)}
        />
      )}
      {qrRoom && <QRModal room={qrRoom} onClose={() => setQrRoom(null)} />}
      {viewRoom && <RoomMessages room={viewRoom} onClose={() => setViewRoom(null)} />}
    </div>
  );
}

function RoomCard({ room, onQR, onView, onRevoke }) {
  const link = `${BASE_URL}/r/${room.token}`;
  const copyLink = () => {
    navigator.clipboard.writeText(link);
    toast.success('Link copied!');
  };

  return (
    <div className="room-card card">
      <div className="room-card-top">
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{room.label}</div>
          <code className="room-token">{room.token}</code>
        </div>
        <span className="badge badge-green">
          <span className="pulse-dot" style={{ width: 6, height: 6 }} />
          Active
        </span>
      </div>

      <div className="room-card-link">
        <span className="room-link-text-sm">/r/{room.token}</span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={copyLink} data-tooltip="Copy link">
          <Copy size={14} />
        </button>
      </div>

      <div className="text-xs text-muted" style={{ marginTop: 6 }}>
        <Clock size={11} style={{ display: 'inline', marginRight: 4 }} />
        Created {new Date(room.created_at).toLocaleDateString()}
      </div>

      <div className="room-card-actions">
        <button className="btn btn-ghost btn-sm" onClick={onView}>
          <MessageSquare size={14} /> Messages
        </button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onQR} data-tooltip="Show QR">
          <QrCode size={14} />
        </button>
        <button className="btn btn-danger btn-sm btn-icon" onClick={onRevoke} data-tooltip="Revoke">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
