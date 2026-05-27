import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Copy, Check, FileText, Download } from 'lucide-react';
import api from '../lib/api';
import GhostLogo from '../components/GhostLogo';
import { motion } from 'framer-motion';

// Syntax highlighting
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export default function AssetViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [content, setContent] = useState('');
  const [upload, setUpload] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchAsset = async () => {
      try {
        // We fetch the metadata first to ensure it exists and get the cloudinary URL
        // Normally this is public so we can just fetch the cloudinary URL directly if we had it,
        // but since we only have the ID in the URL, we need to ask the server or just fetch from /api/uploads
        // Oh wait, /api/uploads/:id is not a public route in the backend currently.
        // Wait! The user just wants a public URL. Let's create a quick public route for getting upload metadata.
        const res = await api.get(`/api/uploads/${id}/public`);
        setUpload(res.data);
        
        // Now fetch the actual text content from Cloudinary
        const contentRes = await fetch(res.data.cloudinary_url);
        const text = await contentRes.text();
        setContent(text);
      } catch (err) {
        setError('Asset not found or expired');
      } finally {
        setLoading(false);
      }
    };
    fetchAsset();
  }, [id]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLanguage = () => {
    if (!upload) return 'text';
    if (upload.file_type === 'application/json' || upload.file_name?.endsWith('.json')) return 'json';
    if (upload.file_name?.endsWith('.js') || upload.file_name?.endsWith('.jsx')) return 'javascript';
    if (upload.file_name?.endsWith('.ts') || upload.file_name?.endsWith('.tsx')) return 'typescript';
    if (upload.file_name?.endsWith('.py')) return 'python';
    if (upload.file_name?.endsWith('.html')) return 'html';
    if (upload.file_name?.endsWith('.css')) return 'css';
    if (upload.file_name?.endsWith('.md')) return 'markdown';
    return 'text';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bgBase flex items-center justify-center">
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bgBase flex flex-col items-center justify-center p-4 text-center">
        <FileText size={48} className="text-textGhost mb-4" />
        <h2 className="text-xl font-bold text-textPrimary mb-2">Asset Not Found</h2>
        <p className="text-textSecondary mb-8">{error}</p>
        <button onClick={() => navigate('/')} className="text-cyan-400 hover:text-cyan-300">Return Home</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bgBase flex flex-col p-4 md:p-8">
      <header className="flex items-center justify-between mb-8 max-w-5xl mx-auto w-full">
        <GhostLogo />
        
        <div className="flex items-center gap-3">
          <a 
            href={upload?.cloudinary_url}
            download={upload?.file_name}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bgCard border border-borderBase text-textSecondary hover:text-textPrimary hover:border-borderActive transition-colors text-sm font-medium"
          >
            <Download size={16} /> Raw
          </a>
          <button 
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white hover:bg-accentHover transition-colors text-sm font-medium"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full flex flex-col min-h-0">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 bg-bgCard border border-borderBase rounded-xl overflow-hidden flex flex-col shadow-2xl"
        >
          <div className="h-12 border-b border-borderBase bg-[#1a1b26] flex items-center px-4 gap-4">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <div className="text-xs font-mono text-textSecondary px-2 py-1 bg-black/20 rounded">
              {upload?.file_name || 'snippet.txt'}
            </div>
          </div>
          
          <div className="flex-1 overflow-auto bg-[#1d1f21] custom-scrollbar">
            <SyntaxHighlighter
              language={getLanguage()}
              style={atomDark}
              customStyle={{
                margin: 0,
                padding: '1.5rem',
                background: 'transparent',
                fontSize: '14px',
                lineHeight: '1.5',
              }}
              showLineNumbers={true}
              wrapLines={true}
            >
              {content}
            </SyntaxHighlighter>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
