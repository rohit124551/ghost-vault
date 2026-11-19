import { Search, Download, CircleHelp, X } from 'lucide-react';
import { exportChat, summary } from './chatTools';

export default function ChatHeader({panel, setPanel, query, setQuery, messages, jump}) {
  const toggle = name => setPanel(panel === name ? '' : name);
  const needle = query.trim().toLowerCase();
  const results = needle ? messages.filter(m => summary(m).toLowerCase().includes(needle)) : [];
  return <>
    <header className="chat-tools">
      <button aria-label="Search conversation" onClick={() => toggle('search')}><Search size={16}/></button>
      <button aria-label="Export conversation" onClick={() => toggle('export')}><Download size={16}/></button>
      <button aria-label="Keyboard shortcuts" onClick={() => toggle('help')}><CircleHelp size={16}/></button>
    </header>
    {panel && <section className="chat-tool-panel">
      <button className="panel-close" aria-label="Close panel" onClick={() => setPanel('')}><X size={15}/></button>
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
