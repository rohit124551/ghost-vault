import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import './LoginPage.css';

export default function LoginPage() {
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail]   = useState('');
  const [sent, setSent]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const inputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    inputRef.current?.classList.remove('input--error');

    const { error: err } = await signInWithMagicLink(email.trim());
    setLoading(false);

    if (err) {
      inputRef.current?.classList.add('input--error');
      setTimeout(() => inputRef.current?.classList.remove('input--error'), 400);
      const msg = err.message?.toLowerCase() || '';
      if (msg.includes('not authorized') || msg.includes('signup') || msg.includes('disabled')) {
        setError('This vault is private.');
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    } else {
      setSent(true);
    }
  };

  return (
    <div className="login-root">
      <div className="login-card">

        {/* ── Logo ── */}
        <div className="login-brand">
          <span className="login-logo">GhostVault</span>
          <p className="login-tagline">Paste. Share. Vanish.</p>
        </div>

        {sent ? (
          /* ── Confirmation ── */
          <div className="login-confirm">
            <CheckCircle2 size={40} color="var(--success)" strokeWidth={1.5} />
            <h2 className="login-confirm-heading">Check your inbox</h2>
            <p className="login-confirm-sub">
              Magic link sent to{' '}
              <span className="login-confirm-email">{email}</span>
            </p>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setSent(false); setEmail(''); }}
            >
              Wrong email? Go back
            </button>
          </div>
        ) : (
          /* ── Form ── */
          <form className="login-form" onSubmit={handleSubmit}>
            <input
              id="email"
              ref={inputRef}
              type="email"
              className="input"
              placeholder="your@email.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              required
              autoFocus
              style={error ? { borderColor: 'var(--danger)' } : {}}
            />

            {error && (
              <div className="login-error">{error}</div>
            )}

            <button
              id="send-link"
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading || !email}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {loading
                ? <><span className="spinner" /> Sending…</>
                : <>Send magic link <ArrowRight size={15} /></>
              }
            </button>

            <p className="login-hint">
              No password. Just click the link in your email.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
