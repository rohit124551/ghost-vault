export default function NotFoundPage() {
  return (
    <div className="nf-root">
      <div className="nf-content">
        <span className="nf-code">404</span>
        <p className="nf-text">This link has expired or been revoked.</p>
        {/* Ghost icon — very faint */}
        <svg
          className="nf-ghost"
          width="40" height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10A8 8 0 0 0 12 2z" />
          <circle cx="9" cy="10" r="1" fill="currentColor" />
          <circle cx="15" cy="10" r="1" fill="currentColor" />
        </svg>
      </div>

      <style>{`
        .nf-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-base);
        }
        .nf-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          text-align: center;
          padding: 20px;
        }
        .nf-code {
          font-family: var(--font-display);
          font-size: 80px;
          font-weight: 700;
          color: var(--text-ghost);
          line-height: 1;
          letter-spacing: -4px;
        }
        .nf-text {
          font-size: 15px;
          color: var(--text-secondary);
          font-family: var(--font-ui);
        }
        .nf-ghost {
          color: var(--text-ghost);
          opacity: 0.7;
        }
      `}</style>
    </div>
  );
}
