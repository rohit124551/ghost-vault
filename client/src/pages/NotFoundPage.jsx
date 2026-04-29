import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16, background: 'var(--bg)', textAlign: 'center', padding: 20
    }}>
      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>404</div>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Link not found</h1>
      <p style={{ color: 'var(--text-2)', fontSize: 14, maxWidth: 320 }}>
        This link has expired or been revoked by the owner.
      </p>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Go back</button>
    </div>
  );
}
