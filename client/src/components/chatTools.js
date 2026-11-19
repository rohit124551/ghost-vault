export function summary(message) {
  if (!message) return '';
  if (message.burn_after_seconds || message.type === 'burned') return '[Disappearing message]';
  return message.content || message.file_name || '[' + message.type + ']';
}

export function imageGroups(messages) {
  const result = [];
  for (const m of messages) {
    const last = result.at(-1);
    const first = last?.[0];
    if (m.type === 'image' && !m.burn_after_seconds && first?.type === 'image' &&
        !first.burn_after_seconds && first.sender === m.sender && last.length < 4 &&
        new Date(first.created_at).toDateString() === new Date(m.created_at).toDateString() &&
        Date.parse(m.created_at) - Date.parse(first.created_at) <= 30000) last.push(m);
    else result.push([m]);
  }
  return result;
}

export function exportChat(messages, format) {
  const rows = messages.map(m => ({
    id: m.id, sender: m.sender, time: m.created_at, type: m.type,
    content: summary(m), replyTo: m.reply_to_id || null,
    ...(m.file_url && !m.burn_after_seconds && m.type !== 'burned' && { url: m.file_url })
  }));
  const content = format === 'json' ? JSON.stringify(rows, null, 2) : rows.map(m =>
    (format === 'md' ? '**' + m.sender + '**' : m.sender) + ' · ' + m.time + '\n' +
    m.content + (m.url ? '\n' + m.url : '')
  ).join('\n\n');
  const url = URL.createObjectURL(new Blob([content], {type: 'text/plain;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ghostvault-chat.' + format;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
