import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import MessageText from './MessageText';
import { VoicePlayer } from './ChatMedia';
import { summary } from './chatTools';

function Entry({ message, myRole, renderTimed, renderTransfer, parent }) {
  const author = message.sender === myRole ? 'You' : message.sender === 'owner' ? 'Owner' : message.sender === 'api' ? 'API' : 'Guest';
  const time = new Date(message.created_at);
  return <article className="thread-entry" data-receipt-id={message.sender !== myRole && !message.seen_at && !message.burn_after_seconds ? message.id : undefined} id={'thread-msg-' + message.id}>
    <div className="entry-byline"><strong>{author}</strong><time dateTime={message.created_at}>{time.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</time></div>
    {message.burn_after_seconds || message.type === 'burned' ? renderTimed(message) :
      message.transfer ? renderTransfer(message) : message.type === 'text' ? <MessageText text={message.content} lines={parent ? 3 : 6}/> :
      message.file_name?.startsWith('voice_note_') ? <VoicePlayer url={message.file_url}/> :
      message.file_url ? <a className="thread-attachment" href={message.file_url} target="_blank" rel="noreferrer">{summary(message)}</a> : summary(message)}
  </article>;
}

export default function ThreadPanel({ parent, replies, pending, myRole, onClose, renderTimed, renderTransfer }) {
  const list = useRef(null);
  const following = useRef(true);
  const [unread] = useState(() => replies.filter(m => m.sender !== myRole && m.sender !== 'api' && !m.seen_at &&
    !m.viewed_at && m.type !== 'burned'));
  const divider = useRef(null);
  useLayoutEffect(() => {
    if (divider.current) {
      const el = list.current;
      el.scrollTop += divider.current.getBoundingClientRect().top - el.getBoundingClientRect().top;
      following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    }
  }, []);
  useLayoutEffect(() => {
    if (following.current) list.current.scrollTop = list.current.scrollHeight;
  }, [replies.length, pending.length]);
  return <section className="thread-panel" aria-label="Message thread">
    <header><button aria-label="Back to conversation" onClick={onClose}><ArrowLeft size={18}/></button><h3>Thread</h3></header>
    {parent && <div className="thread-parent"><Entry message={parent} parent myRole={myRole} renderTimed={renderTimed} renderTransfer={renderTransfer}/></div>}
    <h4>{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</h4>
    <div className="thread-replies" ref={list} onScroll={e => {
      const el = e.currentTarget;
      following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    }}>
      {replies.length ? replies.map(m => <Fragment key={m.id}>
        {m.id === unread[0]?.id && <div ref={divider} className="unread-divider">{unread.length} new {unread.length === 1 ? 'reply' : 'replies'}</div>}
        <Entry message={m} myRole={myRole} renderTimed={renderTimed} renderTransfer={renderTransfer}/>
      </Fragment>) :
        !pending.length && <p className="thread-empty"><MessageSquare size={16}/>Start the thread with a reply.</p>}
      {pending}
    </div>
  </section>;
}
