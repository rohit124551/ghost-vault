import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import GhostLogo from '../components/GhostLogo';
import { ShieldOff, Home, ArrowLeft, Timer } from 'lucide-react';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [countdown, setCountdown] = useState(8);

  // Determine context from the URL to show a better message
  const isRoomLink = location.pathname.startsWith('/r/') || location.pathname.startsWith('/burn/');

  const title = isRoomLink ? 'Tunnel Destroyed' : '404 — Not Found';
  const subtitle = isRoomLink
    ? 'This link has expired, been revoked, or never existed.'
    : 'The page you are looking for does not exist.';

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(id);
          navigate('/', { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-bgBase text-textPrimary flex flex-col items-center justify-center relative overflow-hidden font-ui p-6">
      
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808010_1px,transparent_1px),linear-gradient(to_bottom,#80808010_1px,transparent_1px)] bg-[size:28px_28px] pointer-events-none" />
      
      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(239,68,68,0.05)_0%,transparent_65%)] pointer-events-none" />

      {/* Top-left brand */}
      <div className="absolute top-6 left-6 flex items-center gap-2 z-10">
        <GhostLogo className="w-6 h-6 text-textGhost" />
        <span className="text-xs font-mono text-textGhost uppercase tracking-widest">GhostVault</span>
      </div>

      {/* Main card */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-md w-full">
        
        {/* Icon */}
        <div className="w-24 h-24 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(239,68,68,0.15)]">
          <ShieldOff size={44} className="text-danger" />
        </div>

        {/* Large faded 404 */}
        <div
          className="font-display font-black text-[100px] leading-none tracking-tighter text-textGhost/10 select-none absolute -top-2 pointer-events-none"
          aria-hidden="true"
        >
          404
        </div>

        {/* Title */}
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-textPrimary mb-3 mt-4">
          {title}
        </h1>

        {/* Subtitle */}
        <p className="text-textSecondary font-mono text-sm md:text-base max-w-xs leading-relaxed mb-10">
          {subtitle}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full justify-center">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-sm border border-borderActive text-textSecondary hover:text-textPrimary hover:bg-bgHover transition-colors font-mono text-sm font-bold uppercase tracking-widest"
          >
            <ArrowLeft size={16} /> Go Back
          </button>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent text-white font-mono text-sm font-bold uppercase tracking-widest hover:bg-accentHover transition-colors shadow-lg shadow-accent/20"
          >
            <Home size={16} /> Home Base
          </button>
        </div>

        {/* Auto redirect countdown */}
        <div className="mt-10 flex items-center gap-2 text-xs font-mono text-textGhost">
          <Timer size={12} className="text-textGhost animate-pulse" />
          Auto-redirect in <span className="text-textSecondary font-bold">{countdown}s</span>
        </div>
      </div>
    </div>
  );
}
