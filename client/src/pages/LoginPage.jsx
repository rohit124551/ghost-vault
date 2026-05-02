import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { ArrowLeft, Terminal, ShieldAlert, Sun, Moon } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function LoginPage() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const inputRef = useRef(null);
  const { theme, toggleTheme } = useTheme();
  const [clientIp, setClientIp] = useState('FETCHING...');

  useEffect(() => {
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => setClientIp(data.ip))
      .catch(() => setClientIp('UNKNOWN_IP'));
  }, []);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError('');

    const { error: err } = await signInWithEmail(email.trim(), password);
    setLoading(false);

    if (err) {
      setError(err.message || 'Invalid credentials');
    }
  };

  return (
    <div className="min-h-screen bg-bgBase text-textPrimary flex flex-col items-center justify-center relative overflow-hidden font-ui">
      
      {/* Background Cyber Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      <div className="absolute inset-0 bg-bgBase/80 backdrop-blur-[2px]"></div>

      {/* Back to Home */}
      <Link to="/" className="absolute top-8 left-8 text-textGhost hover:text-cyan-400 transition-colors flex items-center gap-2 font-mono text-sm z-10 uppercase tracking-widest">
        <ArrowLeft size={16} /> Abort_Login
      </Link>

      {/* Theme Toggle */}
      <button 
        onClick={toggleTheme}
        className="absolute top-8 right-8 text-textGhost hover:text-cyan-400 transition-colors z-10"
        title="Toggle Theme"
      >
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      {/* Login Terminal Card */}
      <div className="w-full max-w-md bg-bgCard border border-borderBase shadow-2xl relative z-10 p-8 rounded-sm hover-glitch">
        
        {/* Terminal Header */}
        <div className="flex flex-col gap-2 border-b border-borderBase pb-4 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs tracking-widest">
              <Terminal size={14} /> SECURE_AUTH_REQ
            </div>
            <ShieldAlert size={16} className="text-textGhost animate-pulse" />
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-textGhost uppercase tracking-widest">
            <span>CLIENT_IP: <span className="text-textSecondary">{clientIp}</span></span>
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></div>
          </div>
        </div>

        {/* Brand */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <img src="/icons/ghost-icon.png" alt="GhostVault Logo" className="w-40 md:w-48 h-auto object-contain" />
        </div>

        {/* Form */}
        <form onSubmit={handleEmailLogin} className="flex flex-col gap-5">
          <div className="relative group">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-textGhost font-mono font-bold group-focus-within:text-cyan-400 transition-colors">{'>'}</span>
            <input
              type="email"
              className="w-full bg-bgHover border border-borderActive text-textPrimary font-mono text-sm px-8 py-3 rounded-sm focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(34,211,238,0.2)] transition-all placeholder:text-textGhost"
              placeholder="IDENTITY_EMAIL"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              ref={inputRef}
            />
          </div>

          <div className="relative group">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-textGhost font-mono font-bold group-focus-within:text-cyan-400 transition-colors">{'>'}</span>
            <input
              type="password"
              className="w-full bg-bgHover border border-borderActive text-textPrimary font-mono text-sm px-8 py-3 rounded-sm focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(34,211,238,0.2)] transition-all placeholder:text-textGhost"
              placeholder="ACCESS_KEY"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="text-danger text-xs font-mono bg-danger/10 border border-danger/30 p-3 rounded-sm animate-pulse flex items-start gap-2 mt-1">
               <span className="font-bold">[!]</span> 
               <span>AUTH_ERROR: {error}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-accent hover:bg-accentHover text-white font-mono font-bold text-sm py-3 rounded-sm flex items-center justify-center gap-2 transition-all mt-4 border border-transparent hover:border-white/20 shadow-lg"
            disabled={loading}
          >
            {loading ? (
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
            ) : (
              'INITIATE_HANDSHAKE'
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-textGhost font-mono text-[10px] uppercase tracking-wider opacity-60">
          Unauth access is heavily monitored.
        </p>
      </div>
    </div>
  );
}
