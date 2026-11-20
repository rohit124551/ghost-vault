import {useEffect, useRef, useState} from 'react';
import {FileUp, Download, X} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import {guestApi} from './useChatActivity';
import {transferPath, uploadTemporaryFile, downloadTransfer} from '../lib/transfers';
import {formatBytes} from '../utils/formatBytes';

function TransferDialog({children,title,onClose}) {
  const ref = useRef(null);
  useEffect(() => {ref.current.showModal();}, []);
  return <dialog ref={ref} className="transfer-dialog" aria-label={title} onClose={onClose}>
    <header><strong>{title}</strong><button aria-label="Close" onClick={() => ref.current.close()}><X size={18}/></button></header>
    {children}
  </dialog>;
}

export function RequestFileDialog({token,onClose,onCreated}) {
  const [limit,setLimit] = useState(50);
  const [hours,setHours] = useState(1);
  const [busy,setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const {data} = await api.post(transferPath(token)+'/requests',{limitMiB:Number(limit),hours});
      onCreated(data);
      onClose();
    } catch (err) {toast.error(err.response?.data?.error || 'Could not create upload request');}
    finally {setBusy(false);}
  }
  return <TransferDialog title="Request a file" onClose={onClose}><form onSubmit={submit}>
    <p>Anyone in this shared room can use this request once. Only you can download the received file.</p>
    <label>Maximum file size (MiB)<input type="number" min="1" required value={limit} onChange={e=>setLimit(e.target.value)}/></label>
    <label>Request and file expire in<select value={hours} onChange={e=>setHours(Number(e.target.value))}><option value={1}>1 hour</option><option value={24}>24 hours</option></select></label>
    <button className="transfer-primary" disabled={busy}>Send upload request</button>
  </form></TransferDialog>;
}

export function TransferCard({message,token,myRole,onUpdate}) {
  const [open,setOpen] = useState(false);
  const [progress,setProgress] = useState(null);
  const [now,setNow] = useState(Date.now);
  const fileInput = useRef(null);
  const transfer = message.transfer;
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()),Math.max(0,transfer.expires-Date.now()+1));
    return () => clearTimeout(timer);
  }, [transfer.expires]);
  const expired = now >= transfer.expires;
  const ready = transfer.state === 'ready';
  const client = myRole === 'owner' ? api : guestApi;
  const deadline = new Date(transfer.expires).toLocaleString();
  async function choose(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > transfer.limit) return toast.error('Choose a file within the approved limit');
    setProgress(0);
    try {
      const row = await uploadTemporaryFile(client,token,file,{requestId:message.id},e=>setProgress(Math.floor(100*e.loaded/e.total)));
      onUpdate(row);setOpen(false);
    } catch (err) {toast.error(err.response?.data?.error || 'Upload interrupted. Choose the file to retry.');}
    finally {setProgress(null);}
  }
  return <div className="transfer-card">
    <strong>{ready ? transfer.name : 'File requested'}</strong>
    <small>{ready ? formatBytes(transfer.size) : 'One file up to '+formatBytes(transfer.limit)} · {expired ? 'Expired' : 'Expires '+deadline}</small>
    {!expired && !ready && myRole === 'guest' && <button onClick={()=>setOpen(true)}><FileUp size={16}/>{progress == null ? 'Upload a file' : 'Uploading '+progress+'%'}</button>}
    {!expired && ready && (!(transfer.ownerOnly ?? transfer.fromGuest) || myRole === 'owner') && <button onClick={()=>downloadTransfer(client,token,message.id).catch(()=>toast.error('Download unavailable or expired'))}><Download size={16}/>Download file</button>}
    {open && <TransferDialog title="Upload requested file" onClose={()=>setOpen(false)}>
      <p>Choose one file up to {formatBytes(transfer.limit)}. Access ends {deadline}.</p>
      <input hidden ref={fileInput} type="file" onChange={choose}/>
      <button className="transfer-primary" disabled={expired || progress != null} onClick={()=>fileInput.current.click()}>{progress == null ? 'Choose file' : 'Uploading '+progress+'%'}</button>
    </TransferDialog>}
  </div>;
}
