import { useLayoutEffect, useRef } from 'react';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import MessageText from './MessageText';
import { VoicePlayer } from './ChatMedia';
import { summary } from './chatTools';

function Entry({ message, myRole, renderTimed, parent }) {
  const author = message.sender === myRole ? 'You' : message.sender === 'owner' ? 'Owner' : message.sender === 'api' ? 'API' : 'Guest';
  const time = new Date(message.created_at);
  return <article className="thread-entry" id={'thread-msg-' + message.id}>
    <div className="entry-byline"><strong>{author}</strong><time dateTime={message.created_at}>{time.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</time></div>
    {message.burn_after_seconds || message.type === 'burned' ? renderTimed(message) :
      message.type === 'text' ? <MessageText text={message.content} lines={parent ? 3 : 6}/> :
      message.file_name?.startsWith('voice_note_') ? <VoicePlayer url={message.file_url}/> :
      message.file_url ? <a className="thread-attachment" href={message.file_url} target="_blank" rel="noreferrer">{summary(message)}</a> : summary(message)}
  </article>;
}

export default function ThreadPanel({ parent, replies, myRole, onClose, renderTimed }) {
  const list = useRef(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    if (following.current) list.current.scrollTop = list.current.scrollHeight;
  }, [replies.length]);
  return <section className="thread-panel" aria-label="Message thread">
    <header><button aria-label="Back to conversation" onClick={onClose}><ArrowLeft size={18}/></button><h3>Thread</h3></header>
    {parent && <div className="thread-parent"><Entry message={parent} parent myRole={myRole} renderTimed={renderTimed}/></div>}
    <h4>{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</h4>
    <div className="thread-replies" ref={list} onScroll={e => {
      const el = e.currentTarget;
      following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    }}>
      {replies.length ? replies.map(m => <Entry key={m.id} message={m} myRole={myRole} renderTimed={renderTimed}/>) :
        <p className="thread-empty"><MessageSquare size={16}/>Start the thread with a reply.</p>}
    </div>
  </section>;
}
