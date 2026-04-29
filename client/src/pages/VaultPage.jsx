import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Clipboard, Trash2, Search, LayoutGrid, List,
  Download, Pencil, X, Check, ZoomIn, Camera
} from 'lucide-react';
import './VaultPage.css';

function formatBytes(bytes) {
  if (!bytes) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ── Name dialog modal ─────────────────────────────────────────────────────────
function NameDialog({ defaultName, onConfirm, onCancel }) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: 16, fontSize: 18, fontWeight: 600 }}>Name this screenshot</h2>
        <input
          ref={inputRef}
          className="input"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onConfirm(name || defaultName);
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="Screenshot name..."
          autoFocus
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onConfirm(name || defaultName)}>
            <Check size={16} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({ screenshot, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose} style={{ alignItems: 'flex-start', paddingTop: 60 }}>
      <div className="lightbox" onClick={e => e.stopPropagation()}>
        <div className="lightbox-header">
          <span className="text-sm" style={{ fontWeight: 500 }}>{screenshot.name}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href={screenshot.cloudinary_url}
              download={screenshot.name}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost btn-sm btn-icon"
              data-tooltip="Download"
            >
              <Download size={16} />
            </a>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>
        <img src={screenshot.cloudinary_url} alt={screenshot.name} className="lightbox-img" />
        <div className="lightbox-meta text-xs text-muted">
          {formatBytes(screenshot.size_bytes)} · {new Date(screenshot.created_at).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

// ── Main Vault Page ───────────────────────────────────────────────────────────
export default function VaultPage() {
  const [screenshots, setScreenshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('grid'); // 'grid' | 'list'
  const [pendingFile, setPendingFile] = useState(null); // file awaiting name
  const [lightbox, setLightbox] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);

  // Load screenshots
  useEffect(() => {
    api.get('/api/screenshots').then(res => {
      setScreenshots(res.data || []);
    }).finally(() => setLoading(false));
  }, []);

  // Global paste listener
  useEffect(() => {
    const handlePaste = (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find(item => item.type.startsWith('image/'));
      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;

      const defaultName = `Screenshot ${new Date().toLocaleString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })}`;
      setPendingFile({ file, defaultName });
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Upload screenshot after naming
  const handleNameConfirm = useCallback(async (name) => {
    if (!pendingFile) return;
    const { file } = pendingFile;
    setPendingFile(null);
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);

    try {
      const res = await api.post('/api/screenshots', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setScreenshots(prev => [res.data, ...prev]);
      toast.success('Screenshot saved!');
    } catch (err) {
      toast.error('Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  }, [pendingFile]);

  // Delete screenshot
  const handleDelete = async (id) => {
    if (!confirm('Delete this screenshot?')) return;
    try {
      await api.delete(`/api/screenshots/${id}`);
      setScreenshots(prev => prev.filter(s => s.id !== id));
      toast.success('Deleted');
    } catch {
      toast.error('Delete failed');
    }
  };

  // Rename screenshot
  const handleRename = async (id) => {
    if (!editName.trim()) return;
    try {
      const res = await api.patch(`/api/screenshots/${id}`, { name: editName });
      setScreenshots(prev => prev.map(s => s.id === id ? res.data : s));
      setEditingId(null);
      toast.success('Renamed');
    } catch {
      toast.error('Rename failed');
    }
  };

  const filtered = screenshots.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="vault-page">
      {/* Paste hint overlay */}
      <div
        className={`paste-zone ${pasteHint ? 'paste-zone-active' : ''}`}
        onMouseEnter={() => setPasteHint(true)}
        onMouseLeave={() => setPasteHint(false)}
        onClick={() => {
          toast('Press Ctrl+V to paste a screenshot from your clipboard', { icon: '📋' });
        }}
      >
        <Clipboard size={20} />
        <span>Click here then press <kbd>Ctrl+V</kbd> to paste</span>
      </div>

      {/* Header */}
      <div className="vault-header">
        <h1 className="text-2xl">Screenshot Vault</h1>
        <div className="vault-controls">
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="input"
              style={{ paddingLeft: 34, width: 220 }}
              placeholder="Search screenshots..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            className={`btn btn-ghost btn-sm btn-icon ${view === 'grid' ? 'active-view' : ''}`}
            onClick={() => setView('grid')}
            data-tooltip="Grid view"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            className={`btn btn-ghost btn-sm btn-icon ${view === 'list' ? 'active-view' : ''}`}
            onClick={() => setView('list')}
            data-tooltip="List view"
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {uploading && (
        <div className="uploading-bar">
          <div className="spinner" />
          <span className="text-sm">Uploading screenshot…</span>
        </div>
      )}

      {/* Screenshots */}
      {loading ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
          {[...Array(8)].map((_, i) => <div key={i} className="screenshot-thumb-skeleton" style={{ height: 180 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 48 }}>
          <Camera size={48} />
          <p className="text-lg" style={{ fontWeight: 600 }}>No screenshots yet</p>
          <p className="text-secondary text-sm">Copy any image, then press <kbd className="kbd">Ctrl+V</kbd> anywhere on this page</p>
        </div>
      ) : (
        <div className={view === 'grid' ? 'vault-grid' : 'vault-list'}>
          {filtered.map(s => (
            view === 'grid' ? (
              <div key={s.id} className="vault-card card-sm">
                <div className="vault-img-wrap" onClick={() => setLightbox(s)}>
                  <img src={s.cloudinary_url} alt={s.name} loading="lazy" />
                  <div className="vault-img-overlay">
                    <ZoomIn size={22} />
                  </div>
                </div>
                <div className="vault-card-footer">
                  {editingId === s.id ? (
                    <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                      <input
                        className="input"
                        style={{ fontSize: 12, padding: '4px 8px' }}
                        value={editName}
                        autoFocus
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(s.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <button className="btn btn-sm btn-ghost btn-icon" onClick={() => handleRename(s.id)}>
                        <Check size={13} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="vault-card-name text-xs">{s.name}</span>
                      <div className="vault-card-actions">
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          data-tooltip="Rename"
                          onClick={() => { setEditingId(s.id); setEditName(s.name); }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="btn btn-danger btn-sm btn-icon"
                          data-tooltip="Delete"
                          onClick={() => handleDelete(s.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div key={s.id} className="vault-list-row card-sm card">
                <img
                  src={s.cloudinary_url}
                  alt={s.name}
                  className="vault-list-thumb"
                  onClick={() => setLightbox(s)}
                />
                <div className="vault-list-info">
                  {editingId === s.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        className="input"
                        style={{ fontSize: 13, padding: '5px 10px' }}
                        value={editName}
                        autoFocus
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(s.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleRename(s.id)}>
                        <Check size={14} />
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{s.name}</span>
                  )}
                  <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                    {formatBytes(s.size_bytes)} · {new Date(s.created_at).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditingId(s.id); setEditName(s.name); }}>
                    <Pencil size={14} />
                  </button>
                  <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(s.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {/* Modals */}
      {pendingFile && (
        <NameDialog
          defaultName={pendingFile.defaultName}
          onConfirm={handleNameConfirm}
          onCancel={() => setPendingFile(null)}
        />
      )}

      {lightbox && (
        <Lightbox screenshot={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
