import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Flame, AlertTriangle, ShieldAlert, Check, Copy } from 'lucide-react';
import api from '../lib/api';
import GhostLogo from '../components/GhostLogo';
import { motion, AnimatePresence } from 'framer-motion';

export default function BurnViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState(null);
  const [error, setError] = useState('');
  const [isImage, setIsImage] = useState(false);
  const [isText, setIsText] = useState(false);

  const revealSecret = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/burn/${id}`, { responseType: 'blob' });
      const contentType = res.headers['content-type'];
      
      setIsImage(contentType.startsWith('image/'));
      setIsText(contentType.startsWith('text/') || contentType.startsWith('application/json'));
      
      if (contentType.startsWith('text/') || contentType.startsWith('application/json')) {
        const text = await res.data.text();
        setContent(text);
      } else {
        const url = URL.createObjectURL(res.data);
        setContent(url);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'This message has self-destructed or does not exist.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (isText && content) {
      navigator.clipboard.writeText(content);
    }
  };

  return (
    <div className="min-h-screen bg-bgBase flex flex-col items-center justify-center p-4">
      <div className="absolute top-6 left-6 flex items-center gap-2">
        <GhostLogo className="w-6 h-6 text-textGhost" />
        <span className="text-xs font-mono text-textGhost uppercase tracking-widest hidden sm:inline">GhostVault</span>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-2xl w-full bg-bgCard border border-orange-500/30 shadow-[0_0_50px_-12px_rgba(249,115,22,0.15)] rounded-2xl p-8 overflow-hidden relative"
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-red-600" />
        
        <AnimatePresence mode="wait">
          {!content && !error && (
            <motion.div key="intro" exit={{ opacity: 0, y: -20 }} className="text-center">
              <div className="w-20 h-20 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-orange-500/20">
                <Flame size={40} className="text-orange-500" />
              </div>
              <h1 className="text-3xl font-display font-bold tracking-tight mb-4 text-textPrimary">Burn After Reading</h1>
              <p className="text-textSecondary mb-8 max-w-md mx-auto leading-relaxed">
                You have received a secure, self-destructing message. Once you reveal it, it will be permanently wiped from our servers.
              </p>
              
              <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4 flex items-start gap-3 text-left mb-8">
                <AlertTriangle size={20} className="text-orange-500 shrink-0 mt-0.5" />
                <p className="text-sm text-orange-400/90 font-medium">Do not refresh the page after revealing. You will not be able to view this asset again.</p>
              </div>

              <button 
                onClick={revealSecret}
                disabled={loading}
                className="w-full sm:w-auto px-8 py-3.5 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-all disabled:opacity-50 disabled:cursor-wait shadow-[0_0_20px_-5px_rgba(249,115,22,0.4)] flex items-center justify-center mx-auto gap-2"
              >
                {loading ? <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <ShieldAlert size={18} />}
                {loading ? 'Decrypting...' : 'Reveal Secret'}
              </button>
            </motion.div>
          )}

          {error && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
              <div className="w-16 h-16 bg-bgBase rounded-full flex items-center justify-center mx-auto mb-6 border border-borderBase">
                <Flame size={32} className="text-textGhost" />
              </div>
              <h2 className="text-xl font-bold text-textPrimary mb-2">Message Destroyed</h2>
              <p className="text-textSecondary">{error}</p>
              <button onClick={() => navigate('/')} className="mt-8 text-cyan-400 hover:text-cyan-300 font-medium text-sm">Return Home</button>
            </motion.div>
          )}

          {content && (
            <motion.div key="content" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-danger font-mono text-sm font-bold animate-pulse">
                  <Flame size={16} /> Asset Destroyed from Server
                </div>
                {isText && (
                  <button onClick={handleCopy} className="text-textSecondary hover:text-textPrimary transition-colors" title="Copy Text">
                    <Copy size={16} />
                  </button>
                )}
              </div>
              
              <div className="bg-bgBase border border-borderBase rounded-xl p-1 overflow-auto max-h-[60vh]">
                {isImage ? (
                  <img src={content} alt="Secret content" className="w-full h-auto rounded-lg" />
                ) : isText ? (
                  <pre className="p-4 text-sm font-mono text-textPrimary whitespace-pre-wrap break-words">{content}</pre>
                ) : (
                  <div className="p-8 text-center text-textSecondary">
                    File ready to download.
                    <a href={content} download="secret_file" className="block mt-4 text-cyan-400 hover:text-cyan-300">Download File</a>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
