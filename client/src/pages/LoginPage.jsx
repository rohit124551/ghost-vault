import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ArrowRight, CheckCircle2, Shield } from 'lucide-react';

export default function LoginPage() {
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');

    // Remove error class before attempt
    inputRef.current?.classList.remove('input--error');

    const { error: err } = await signInWithMagicLink(email.trim());
    setLoading(false);

    if (err) {
      // Trigger shake animation
      inputRef.current?.classList.add('input--error');
      setTimeout(() => inputRef.current?.classList.remove('input--error'), 400);

      const msg = err.message?.toLowerCase() || '';
      if (msg.includes('not authorized') || msg.includes('signup') || msg.includes('disabled')) {
        setError('This app is private. Access not allowed.');
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    } else {
      setSent(true);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 340 }}>

        {/* Logo + Tagline */}
        <div style={{ marginBottom: 36, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 36, height: 36,
              background: 'var(--blue)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shield size={18} color="#fff" />
            </div>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--text-1)',
              letterSpacing: '-0.3px',
            }}>Ghost Vault</span>
          </div>
          <p style={{ color: 'var(--text-2)', fontSize: 13 }}>
            Your personal screenshot vault &amp; quick-share tool
          </p>
        </div>

        {sent ? (
          /* ── Confirmation screen ── */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <CheckCircle2 size={36} color="var(--green)" />
            <div style={{ fontWeight: 600, fontSize: 16 }}>Check your email</div>
            <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.6 }}>
              Email sent to <strong style={{ color: 'var(--text-1)' }}>{email}</strong>.<br />
              Click the link inside to sign in.
            </p>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 4 }}
              onClick={() => { setSent(false); setEmail(''); }}
            >
              Wrong email? Try again
            </button>
          </div>
        ) : (
          /* ── Login form ── */
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>
                Email address
              </label>
              <input
                id="email"
                ref={inputRef}
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                required
                autoFocus
                style={error ? { borderColor: 'var(--red)' } : {}}
              />
            </div>

            {error && (
              <div style={{
                color: 'var(--red)',
                fontSize: 12,
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                padding: '8px 12px',
                borderRadius: 'var(--r-md)',
                lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}

            <button
              id="send-link"
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading || !email}
              style={{ justifyContent: 'center', marginTop: 4 }}
            >
              {loading
                ? <><span className="spinner" /> Sending…</>
                : <>Send magic link <ArrowRight size={15} /></>
              }
            </button>

            <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6 }}>
              We&apos;ll email you a sign-in link. No password needed.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
