/* eslint-disable react/prop-types */
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import useDialogAccessibility from '../hooks/useDialogAccessibility';
import './ConfirmAction.css';

export default function ConfirmAction({ request, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const close = () => { if (!running.current) onClose(); };
  const dialogRef = useDialogAccessibility(close);

  const submit = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await request.action();
      if (result === false) throw new Error('Please try again.');
      onClose();
    } catch {
      setError('The action could not be completed. Please try again.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return createPortal(
    <div className="confirmation-overlay" onClick={close}>
      <section ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title"
        aria-describedby="confirmation-description" aria-busy={busy} tabIndex={-1}
        className="confirmation-card" onClick={event => event.stopPropagation()}>
        <AlertTriangle size={26} aria-hidden="true" className="confirmation-icon" />
        <h2 id="confirmation-title">{request.title}</h2>
        <p className="confirmation-item">{request.item}</p>
        <p id="confirmation-description">{request.description}</p>
        {error && <p role="alert" className="confirmation-error">{error}</p>}
        <div className="confirmation-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={close}>Cancel</button>
          <button type="button" className="btn confirmation-submit" disabled={busy} onClick={submit}>
            {busy ? 'Working…' : request.label}
          </button>
        </div>
      </section>
    </div>, document.body
  );
}

