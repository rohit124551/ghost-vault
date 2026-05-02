import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import GhostLogo from '../components/GhostLogo';
import { ArrowRight, ShieldAlert, Zap, Lock, Code, Mail, Terminal, Sun, Moon } from 'lucide-react';

export default function LandingPage() {
  const { user } = useAuth();
  const [clientIp, setClientIp] = useState('FETCHING...');
  const fullText = "Paste. Share. Vanish.";
  const [typedText, setTypedText] = useState("");
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => setClientIp(data.ip))
      .catch(() => setClientIp('UNKNOWN_IP'));
  }, []);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setTypedText(fullText.slice(0, i));
      i++;
      if (i > fullText.length) clearInterval(interval);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-bgBase text-textPrimary font-ui flex flex-col">
      {/* Navbar */}
      <nav className="w-full h-20 px-6 md:px-12 flex items-center justify-between border-b border-borderBase bg-bgCard/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <GhostLogo className="w-8 h-8 text-cyan-400 animate-float" />
          <div>
            <div className="font-display font-bold tracking-wide text-lg leading-tight">GhostVault</div>
            <div className="text-[10px] text-cyan-400 font-mono uppercase tracking-widest leading-none">Sec_Ops Console</div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-5 text-textGhost border-r border-borderBase pr-6">
            <button onClick={toggleTheme} className="hover:text-textPrimary transition-colors" title="Toggle Theme">
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <a href="https://github.com/rohit124551/ghost-vault" target="_blank" rel="noreferrer" className="hover:text-textPrimary transition-colors" title="View Project on GitHub">
              <Code size={20} />
            </a>
            <a href="mailto:connect@rohitkumarranjan.in" className="hover:text-textPrimary transition-colors" title="Email Admin">
              <Mail size={20} />
            </a>
          </div>
          {user ? (
            <Link to="/dash" className="px-5 py-2.5 rounded-sm bg-accent text-white font-mono font-bold text-sm hover:bg-accentHover transition-colors shadow-lg flex items-center gap-2">
              Command Center <ArrowRight size={16} />
            </Link>
          ) : (
            <Link to="/login" className="px-5 py-2.5 rounded-sm border border-borderActive text-textPrimary font-mono font-bold text-sm hover:bg-bgHover transition-colors flex items-center gap-2">
              System Login <ArrowRight size={16} />
            </Link>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="max-w-4xl w-full text-center mb-16">
          
          {/* Cyber Terminal Connection Banner */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-bgHover/50 border border-borderActive text-xs md:text-sm font-mono text-cyan-400 mb-8 shadow-sm">
            <Terminal size={14} className="text-textSecondary" />
            <span className="text-textSecondary">SECURE_LINK_ESTABLISHED:</span>
            <span className="font-bold tracking-widest">{clientIp}</span>
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse ml-2 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
          </div>

          <h1 className="text-4xl md:text-6xl font-display font-bold tracking-tight mb-6 text-textPrimary h-16 md:h-20">
            {typedText.length > 14 ? "Paste. Share. " : typedText}
            {typedText.length > 14 && (
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-accent">
                {typedText.substring(14)}
              </span>
            )}
            <span className="inline-block w-3 md:w-5 h-8 md:h-12 bg-accent ml-1 animate-pulse align-middle"></span>
          </h1>
          <p className="text-lg md:text-xl text-textSecondary font-mono max-w-2xl mx-auto mb-10">
            A premium, ephemeral DevSecOps terminal designed for maximum speed, security, and anonymity. Secure chats, private vaults, and temporary tunnels.
          </p>
          <div className="flex items-center justify-center gap-4">
            {user ? (
               <Link to="/dash" className="px-8 py-4 rounded-sm bg-cyan-500 text-white font-mono font-bold hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20 text-lg flex items-center gap-2">
                Init Tunnel
               </Link>
            ) : (
               <Link to="/login" className="px-8 py-4 rounded-sm bg-cyan-500 text-white font-mono font-bold hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20 text-lg flex items-center gap-2">
                 Get Access
               </Link>
            )}
          </div>
        </div>

        {/* Infographic Hero Image (Cropped watermark) */}
        <div className="w-full max-w-5xl mx-auto bg-[#070b13] rounded-2xl border border-borderActive shadow-[0_0_50px_rgba(6,182,212,0.10)] overflow-hidden flex flex-col items-center pt-8 px-4">
          <img 
            src="/ghostvault-hero.png" 
            alt="GhostVault Features" 
            className="w-full h-auto object-contain max-w-4xl"
            style={{ clipPath: 'inset(0 0 50px 0)', marginBottom: '-50px' }}
          />
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl mx-auto mt-24">
          <div className="p-6 bg-bgCard border border-borderBase rounded-sm hover-glitch transition-colors">
            <ShieldAlert className="w-10 h-10 text-accent mb-4" />
            <h3 className="font-display font-bold text-xl mb-2">Secure Asset Vault</h3>
            <p className="text-textSecondary text-sm font-mono leading-relaxed">Retain complete history as the admin. Set assets to persist indefinitely, or configure them to self-destruct upon expiration.</p>
          </div>
          <div className="p-6 bg-bgCard border border-borderBase rounded-sm hover-glitch transition-colors">
            <Zap className="w-10 h-10 text-cyan-400 mb-4" />
            <h3 className="font-display font-bold text-xl mb-2">Real-time Tunnels</h3>
            <p className="text-textSecondary text-sm font-mono leading-relaxed">Instantly sync clipboards, send data payloads, and live-chat via Socket.io.</p>
          </div>
          <div className="p-6 bg-bgCard border border-borderBase rounded-sm hover-glitch transition-colors">
            <Lock className="w-10 h-10 text-amber-400 mb-4" />
            <h3 className="font-display font-bold text-xl mb-2">Zero Auth Guests</h3>
            <p className="text-textSecondary text-sm font-mono leading-relaxed">Generate 4-char access tokens. Guests don't need accounts to collaborate.</p>
          </div>
        </div>

        {/* Our Story Section */}
        <div className="w-full max-w-4xl mx-auto mt-32 mb-10 text-center px-4">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6 text-textPrimary">
            Why I Built GhostVault
          </h2>
          <div className="bg-bgCard border border-borderBase rounded-lg p-8 md:p-12 shadow-lg relative overflow-hidden text-left md:text-center">
            {/* Decorative background element */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
            
            <p className="text-textSecondary font-mono text-sm md:text-base leading-relaxed mb-6 relative z-10">
              I built GhostVault to solve a very real, everyday problem: sharing files in class was a nightmare. WhatsApp was way too laggy to open quickly due to endless bulk groups, and Telegram was constantly blocked by my university's strict network protocols.
            </p>
            <p className="text-textSecondary font-mono text-sm md:text-base leading-relaxed mb-6 relative z-10">
              I needed something lightning-fast and unblocked. Now, I can just drop a file, generate a quick "spell" (link), and share it instantly with classmates. Plus, it gives me a secure, zero-friction way for others to drop files privately into my vault without needing an account.
            </p>
            <p className="text-textSecondary font-mono text-sm md:text-base leading-relaxed relative z-10">
              What started as a <strong className="text-cyan-400 font-bold">personal passion project</strong> to beat university firewalls has evolved into a secure, ephemeral terminal for anyone who values speed, minimalism, and privacy.
            </p>
            
            <div className="mt-8 pt-6 border-t border-borderBase flex flex-col md:flex-row items-center justify-center gap-3 relative z-10">
               <div className="text-sm font-display font-bold text-textPrimary">Built by Rohit Kumar Ranjan</div>
               <span className="text-textGhost hidden md:inline">•</span>
               <a href="https://rohitkumarranjan.in" target="_blank" rel="noreferrer" className="text-xs font-mono text-accent hover:text-accentHover transition-colors uppercase tracking-widest">
                 rohitkumarranjan.in
               </a>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-borderBase py-8 px-6 md:px-12 bg-bgCard mt-20 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-textGhost font-mono text-xs uppercase tracking-widest flex items-center gap-2">
          <GhostLogo className="w-4 h-4 text-textGhost" /> GhostVault SecOps &copy; {new Date().getFullYear()}
        </div>
        <div className="flex items-center gap-6">
          <a href="https://github.com/rohit124551/ghost-vault" target="_blank" rel="noreferrer" className="text-textGhost hover:text-textPrimary transition-colors flex items-center gap-2 text-xs font-mono uppercase tracking-widest">
            <Code size={14} /> GitHub
          </a>
          <a href="mailto:connect@rohitkumarranjan.in" className="text-textGhost hover:text-textPrimary transition-colors flex items-center gap-2 text-xs font-mono uppercase tracking-widest">
            <Mail size={14} /> Connect
          </a>
        </div>
      </footer>
    </div>
  );
}
