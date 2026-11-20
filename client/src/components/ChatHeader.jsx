import { useEffect, useRef } from 'react';
import { Search, MoreHorizontal, Download, Keyboard, Lock, Users, Terminal, X } from 'lucide-react';
import { exportChat, summary } from './chatTools';

export default function ChatHeader({panel, setPanel, query, setQuery, messages, jump, title, audience, paused, disabled, navigation, roomActions, feedDetails}) {
  const header = useRef(null);
  const popup = useRef(null);
  const personal = audience === 'personal';
  const api = audience === 'api';
  const Icon = personal ? Lock : api ? Terminal : Users;
  const access = personal ? 'Only you' : api ? 'API feed' : disabled ? 'Shared · Closed' :
    paused ? 'Shared · Guest access paused' : 'Anyone with the link can join';
  useEffect(() => {
    if (!panel) return;
    function dismiss(e) {
      if (!header.current?.contains(e.target) && !popup.current?.contains(e.target)) setPanel('');
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [panel, setPanel]);
  const toggle = name => setPanel(panel === name ? '' : name);
  const needle = query.trim().toLowerCase();
  const results = needle ? messages.filter(m => summary(m).toLowerCase().includes(needle)) : [];
  return <>
    <header className="chat-tools" ref={header}>
      {navigation}
      <Icon size={18} aria-hidden="true"/>
      <div className="room-heading"><strong>{personal && !title ? 'Saved Notes' : title}</strong><small>{access}</small></div>
      <button aria-label="Search conversation" aria-expanded={panel === 'search'} onClick={() => toggle('search')}><Search size={17}/></button>
      <button className="room-options-trigger" aria-label="Conversation options" aria-expanded={panel === 'more'} onClick={() => toggle('more')}><MoreHorizontal size={18}/></button>
    </header>
    {panel && <section className={'chat-tool-panel' + (panel === 'more' ? ' room-options-panel' : '')} ref={popup}>
      <button className="panel-close" aria-label="Close panel" onClick={() => setPanel('')}><X size={15}/></button>
      {panel === 'more' && <div className="room-menu">
        <button onClick={() => setPanel('export')}><Download size={16}/>Export conversation</button>
        <button className="shortcut-action" onClick={() => setPanel('help')}><Keyboard size={16}/>Keyboard shortcuts</button>
        {feedDetails && <button onClick={() => setPanel('feed')}><Terminal size={16}/>Feed details</button>}
        <div onClick={e => {if (e.target.closest('button')) setPanel('');}}>{roomActions}</div>
      </div>}
      {panel === 'feed' && feedDetails}
      {panel === 'search' && <>
        <input autoFocus aria-label="Search messages" placeholder="Search this conversation" value={query} onChange={e => setQuery(e.target.value)}/>
        {needle && !results.length && <small>No matching messages</small>}
        {results.map(m => {
          const value = summary(m), at = value.toLowerCase().indexOf(needle);
          return <button className="chat-result" key={m.id} onClick={() => jump(m.id)}>
            <small>{m.sender}</small><span>{value.slice(Math.max(0, at-35), at)}<mark>{value.slice(at,at+needle.length)}</mark>{value.slice(at+needle.length,at+needle.length+60)}</span>
          </button>;
        })}
      </>}
      {panel === 'export' && ['txt','json','md'].map(f => <button className="format-choice" key={f} onClick={() => {exportChat(messages,f);setPanel('');}}>Download .{f}</button>)}
      {panel === 'help' && <dl>{[['Enter','Send'],['Ctrl + Enter','New line'],['Esc','Close panel, reply or selection'],['/','Search messages'],['↑','Edit last text from an empty composer']].map(([k,v]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>)}</dl>}
    </section>}
  </>;
}
