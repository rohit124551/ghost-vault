import { useLayoutEffect, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

function parseInlineMarkdown(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part1, i1) => {
    if (/^https?:\/\/[^\s]+$/.test(part1)) {
      return <a key={`url-${i1}`} href={part1} target="_blank" rel="noreferrer" className="chat-link">{part1}</a>;
    }

    // Inline code
    const codeRegex = /`([^`]+)`/g;
    return part1.split(codeRegex).map((part2, i2) => {
      if (i2 % 2 === 1) return <code key={`code-${i1}-${i2}`} className="chat-inline-code">{part2}</code>;

      // Bold (handles **bold** or *bold*)
      const boldRegex = /\*{1,2}([^*]+)\*{1,2}/g;
      return part2.split(boldRegex).map((part3, i3) => {
        if (i3 % 2 === 1) return <strong key={`bold-${i1}-${i2}-${i3}`}>{part3}</strong>;

        // Italics
        const italicRegex = /_([^_]+)_/g;
        return part3.split(italicRegex).map((part4, i4) => {
          if (i4 % 2 === 1) return <em key={`italic-${i1}-${i2}-${i3}-${i4}`}>{part4}</em>;
          return part4;
        });
      });
    });
  });
}

function renderMessageText(text) {
  // Check for code blocks ```language ... ```
  const codeBlockRegex = /```([\w-]*)\n([\s\S]*?)```/g;

  const elements = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add preceding text (parsed for inline markdown)
    if (match.index > lastIndex) {
      const preceding = text.slice(lastIndex, match.index);
      elements.push(
        <span key={`text-${lastIndex}`}>{parseInlineMarkdown(preceding)}</span>
      );
    }

    // Add code block
    const language = match[1] || 'text';
    const code = match[2];
    elements.push(
      <div key={`code-${match.index}`} className="bubble-code-wrapper">
        <SyntaxHighlighter
          language={language}
          style={atomDark}
          customStyle={{
            margin: '4px 0',
            padding: '12px',
            borderRadius: '8px',
            fontSize: '13px',
            background: 'rgba(0,0,0,0.4)',
          }}
          wrapLines={true}
        >
          {code.trim()}
        </SyntaxHighlighter>
      </div>
    );

    lastIndex = codeBlockRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    elements.push(
      <span key={`text-${lastIndex}`}>{parseInlineMarkdown(text.slice(lastIndex))}</span>
    );
  }

  return elements;
}

export default function MessageText({ text, lines = 6 }) {
  const body = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    const element = body.current;
    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
      setOverflow(element.offsetHeight > lines * lineHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, lines]);
  return <div className="message-copy">
    <div className="message-excerpt" style={{maxHeight: expanded ? undefined : lines + 'lh'}}>
      <div ref={body} className="bubble-text">{renderMessageText(text)}</div>
    </div>
    {overflow && <button type="button" className="read-more" aria-expanded={expanded}
      onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : 'Read more…'}</button>}
  </div>;
}
