'use client';
import { useRef, useState, useEffect } from 'react';
import { Copy, TerminalSquare, Check, Download } from 'lucide-react';
export function Terminal({
  text,
  title = 'Build output',
  connected,
}: {
  text: string;
  title?: string;
  connected?: boolean;
}) {
  const [follow, setFollow] = useState(true);
  const [search, setSearch] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text, follow]);
  const displayed = search
    ? text
        .split('\n')
        .filter((line) => line.toLowerCase().includes(search.toLowerCase()))
        .join('\n')
    : text;
  return (
    <div className="terminal">
      <div className="terminal-toolbar">
        <span>
          <TerminalSquare size={15} />
          {title}
        </span>
        <div>
          {connected !== undefined && (
            <span className={connected ? 'success' : 'muted'}>
              {connected ? '● Live' : '○ Reconnecting'}
            </span>
          )}
          <label>
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            Follow
          </label>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(displayed);
                setCopyError('');
              } catch {
                setCopyError('Copy failed. Download the logs instead.');
                return;
              }
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            aria-label="Copy logs"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button
            aria-label="Download logs"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([displayed], { type: 'text/plain;charset=utf-8' }),
              );
              const link = document.createElement('a');
              link.href = url;
              link.download = 'deploygrid-logs.txt';
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            <Download size={15} />
          </button>
        </div>
      </div>
      <label className="log-search">
        Search logs
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter visible output"
        />
      </label>
      {copyError && <p role="alert">{copyError}</p>}
      {!follow && <button onClick={() => setFollow(true)}>Jump to latest</button>}
      <pre
        ref={ref}
        onScroll={() => {
          const el = ref.current;
          if (el && el.scrollHeight - el.scrollTop - el.clientHeight > 24) setFollow(false);
        }}
      >
        {displayed || 'Waiting for output…'}
      </pre>
      <div className="terminal-footer">
        <span>UTF-8</span>
        <span>Actual process output · bounded history</span>
      </div>
    </div>
  );
}
