import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Upload, MessageSquare, HardDrive, X, Ghost, Check, AlertTriangle, File as FileIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

export default function ShareTargetPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [sharedData, setSharedData] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState(null); // { type: 'cloud'|'room', id?: string }

  // 1. Get data from Service Worker / IndexedDB
  useEffect(() => {
    const fetchSharedData = async () => {
      try {
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open('shared_data_db', 1);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        
        const tx = db.transaction('shared_files', 'readonly');
        const store = tx.objectStore('shared_files');
        const data = await new Promise((resolve) => {
          const getReq = store.get('latest');
          getReq.onsuccess = () => resolve(getReq.result);
          getReq.onerror = () => resolve(null);
        });

        if (!data) {
          toast.error('No shared data found');
          navigate('/dash');
          return;
        }

        setSharedData(data);
      } catch (err) {
        console.error('Share Target Error:', err);
        toast.error('Failed to load shared content');
        navigate('/dash');
      } finally {
        setLoading(false);
      }
    };

    fetchSharedData();
  }, [navigate]);

  // 2. Load active rooms for the owner
  useEffect(() => {
    if (user) {
      api.get('/api/rooms')
        .then(res => setRooms(res.data.filter(r => r.is_active)))
        .catch(() => console.error('Failed to load rooms'));
    }
  }, [user]);

  const handleShare = async () => {
    if (!selectedDestination || !sharedData) return;
    setUploading(true);
    
    try {
      const formData = new FormData();
      if (sharedData.files && sharedData.files.length > 0) {
        // Currently we handle the first file for simplicity, or we could loop
        formData.append('file', sharedData.files[0]);
        formData.append('fileName', sharedData.files[0].name);
      } else {
        // If it's just text
        const textBlob = new Blob([sharedData.text || sharedData.url || ''], { type: 'text/plain' });
        formData.append('file', textBlob, 'shared-text.txt');
        formData.append('fileName', 'shared-text.txt');
      }

      if (selectedDestination.type === 'room') {
        const roomToken = selectedDestination.token;
        // Upload via the messages/file endpoint
        await api.post(`/api/rooms/${roomToken}/messages/file`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success('Shared to room successfully');
        navigate(`/dash`); // Or go to that specific room view if implemented
      } else {
        // Upload to personal cloud
        await api.post('/api/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success('Saved to cloud successfully');
        navigate('/dash');
      }
    } catch (err) {
      toast.error('Sharing failed');
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-bgBase flex flex-col items-center justify-center p-6 text-center">
        <Ghost className="w-12 h-12 text-accent animate-pulse mb-4" />
        <p className="text-textGhost font-mono text-sm uppercase tracking-widest">Intercepting Shared Payload...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bgBase text-textPrimary p-4 md:p-8 font-sans overflow-x-hidden">
      <div className="max-w-2xl mx-auto pt-10 pb-20">
        
        {/* Header */}
        <header className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent/10 border border-accent/20 rounded-sm flex items-center justify-center">
              <Upload className="text-accent w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold tracking-tight text-white">Incoming Share</h1>
              <p className="text-textGhost text-xs font-mono uppercase tracking-widest">Source: External System</p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/dash')}
            className="p-2 hover:bg-bgCard rounded-sm border border-transparent hover:border-borderBase transition-all"
          >
            <X className="w-6 h-6 text-textSecondary" />
          </button>
        </header>

        {/* Content Preview */}
        <section className="bg-bgCard border border-borderBase rounded-sm p-6 mb-8 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <Terminal size={14} className="text-accent" />
            <span className="text-[10px] font-mono text-textGhost uppercase tracking-widest">Content Preview</span>
          </div>
          
          <div className="space-y-4">
            {sharedData.title && (
              <div>
                <label className="text-[10px] text-textGhost font-mono uppercase block mb-1">Title</label>
                <div className="text-lg font-medium text-white">{sharedData.title}</div>
              </div>
            )}
            
            {(sharedData.text || sharedData.url) && (
              <div>
                <label className="text-[10px] text-textGhost font-mono uppercase block mb-1">Message / Link</label>
                <div className="p-3 bg-bgBase border border-borderBase rounded-sm text-sm text-textSecondary whitespace-pre-wrap break-all italic">
                  {sharedData.text || sharedData.url}
                </div>
              </div>
            )}

            {sharedData.files && sharedData.files.length > 0 && (
              <div>
                <label className="text-[10px] text-textGhost font-mono uppercase block mb-1">Attachments ({sharedData.files.length})</label>
                <div className="grid grid-cols-1 gap-2">
                  {Array.from(sharedData.files).map((file, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-bgBase border border-borderBase rounded-sm">
                      <div className="w-10 h-10 bg-bgCard flex items-center justify-center rounded-sm border border-borderBase">
                        {file.type.startsWith('image/') ? (
                          <img src={URL.createObjectURL(file)} className="w-full h-full object-cover rounded-sm" alt="preview" />
                        ) : (
                          <FileIcon className="w-5 h-5 text-textGhost" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-textPrimary truncate">{file.name}</div>
                        <div className="text-[10px] text-textGhost font-mono">{(file.size / 1024).toFixed(1)} KB • {file.type}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Destination Selection */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <MessageSquare size={14} className="text-cyan-400" />
            <span className="text-[10px] font-mono text-textGhost uppercase tracking-widest">Select Destination</span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {/* Option: Personal Cloud */}
            <button
              onClick={() => setSelectedDestination({ type: 'cloud' })}
              className={`flex items-center gap-4 p-5 rounded-sm border transition-all text-left ${
                selectedDestination?.type === 'cloud' 
                ? 'bg-accent/5 border-accent shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                : 'bg-bgCard border-borderBase hover:border-borderActive'
              }`}
            >
              <div className={`w-12 h-12 rounded-sm flex items-center justify-center border ${
                selectedDestination?.type === 'cloud' ? 'bg-accent text-white border-accent' : 'bg-bgBase text-textGhost border-borderBase'
              }`}>
                <HardDrive className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="font-display font-bold text-white text-lg">My Personal Cloud</div>
                <div className="text-xs text-textGhost">Save as a persistent asset in your private vault</div>
              </div>
              {selectedDestination?.type === 'cloud' && <Check className="text-accent" />}
            </button>

            {/* Option: Active Rooms */}
            {rooms.length > 0 ? (
              <div className="space-y-3 mt-4">
                <div className="text-[10px] font-mono text-textGhost uppercase tracking-widest pl-1">Active Secure Tunnels</div>
                {rooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => setSelectedDestination({ type: 'room', id: room.id, token: room.token })}
                    className={`w-full flex items-center gap-4 p-5 rounded-sm border transition-all text-left ${
                      selectedDestination?.id === room.id 
                      ? 'bg-cyan-500/5 border-cyan-500 shadow-[0_0_15px_rgba(34,211,238,0.1)]' 
                      : 'bg-bgCard border-borderBase hover:border-borderActive'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-sm flex items-center justify-center border ${
                      selectedDestination?.id === room.id ? 'bg-cyan-500 text-white border-cyan-500' : 'bg-bgBase text-textGhost border-borderBase'
                    }`}>
                      <Ghost className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="font-display font-bold text-white text-lg">Tunnel: {room.token}</div>
                      <div className="text-xs text-textGhost italic">{room.note || 'No description provided'}</div>
                    </div>
                    {selectedDestination?.id === room.id && <Check className="text-cyan-500" />}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 p-4 border border-dashed border-borderBase rounded-sm bg-bgCard/30 text-center">
                <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto mb-2 opacity-50" />
                <p className="text-xs text-textGhost italic">No active secure tunnels found. Create one in the dashboard first.</p>
              </div>
            )}
          </div>
        </section>

        {/* Action Button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-bgBase/80 backdrop-blur-md border-t border-borderBase">
          <div className="max-w-2xl mx-auto flex gap-3">
            <button
              onClick={() => navigate('/dash')}
              className="flex-1 h-12 rounded-sm border border-borderBase text-textSecondary font-medium hover:bg-bgHover transition-all"
              disabled={uploading}
            >
              Abort
            </button>
            <button
              onClick={handleShare}
              disabled={!selectedDestination || uploading}
              className={`flex-[2] h-12 rounded-sm font-bold flex items-center justify-center gap-2 transition-all ${
                !selectedDestination || uploading
                ? 'bg-bgCard text-textGhost border border-borderBase cursor-not-allowed'
                : selectedDestination.type === 'cloud' 
                  ? 'bg-accent text-white border border-accent hover:bg-accentHover shadow-[0_0_20px_rgba(59,130,246,0.2)]'
                  : 'bg-cyan-500 text-white border border-cyan-500 hover:bg-cyan-600 shadow-[0_0_20px_rgba(34,211,238,0.2)]'
              }`}
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Transferring...
                </>
              ) : (
                <>
                  Transmit Data
                  <Upload size={16} />
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
