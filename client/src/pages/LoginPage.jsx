import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ArrowRight, LogIn } from 'lucide-react';
import './LoginPage.css';

export default function LoginPage() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const inputRef = useRef(null);

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
    <div className="login-root">
      <div className="login-card">

        {/* ── Logo ── */}
        <div className="login-brand">
          <span className="login-logo">GhostVault</span>
          <p className="login-tagline">Paste. Share. Vanish.</p>
        </div>

        <div className="login-form">

          {/* ── Email/Password Form ── */}
          <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="email"
              className="input"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className="input"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />

            {error && <div className="login-error">{error}</div>}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {loading ? <span className="spinner" /> : <><LogIn size={15} /> Sign In</>}
            </button>
          </form>

          <p className="login-hint">
            Personal vault access. Authorized accounts only.
          </p>
        </div>
      </div>
    </div>
  );
}
