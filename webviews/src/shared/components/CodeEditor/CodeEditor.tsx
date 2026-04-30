import React, { useCallback, useMemo, useRef } from 'react';
import styles from './CodeEditor.module.css';

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** When 'auto', the editor tries to detect JSON content and apply highlighting. */
  language?: 'json' | 'plaintext' | 'auto';
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ value, onChange, placeholder, language = 'auto' }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  const lineCount = useMemo(() => value.split('\n').length, [value]);

  const effectiveLang = useMemo<'json' | 'plaintext'>(() => {
    if (language === 'json') return 'json';
    if (language === 'plaintext') return 'plaintext';
    return looksLikeJson(value) ? 'json' : 'plaintext';
  }, [language, value]);

  const highlighted = useMemo(() => {
    // Trailing newline keeps highlight layer height in sync with textarea
    const src = value.endsWith('\n') ? value + ' ' : value;
    if (effectiveLang === 'json') return colorizeJson(src);
    return escapeHtml(src);
  }, [value, effectiveLang]);

  const handleScroll = useCallback(() => {
    if (!textareaRef.current) return;
    const top = textareaRef.current.scrollTop;
    const left = textareaRef.current.scrollLeft;
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = top;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = top;
      highlightRef.current.scrollLeft = left;
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange(newValue);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }, [value, onChange]);

  return (
    <div className={styles.codeEditor} data-language={effectiveLang}>
      <div className={styles.lineNumbers} ref={lineNumbersRef}>
        {Array.from({ length: lineCount }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <div className={styles.editorArea}>
        <pre
          ref={highlightRef}
          className={styles.highlight}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          spellCheck={false}
        />
      </div>
    </div>
  );
};

/** Heuristic: trimmed value starts with `{` or `[` and is parseable. */
function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  const first = trimmed[0];
  if (first !== '{' && first !== '[') return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function colorizeJson(json: string): string {
  return escapeHtml(json)
    .replace(/("(?:[^"\\]|\\.)*")\s*:/g, `<span class="${styles.key}">$1</span>:`)
    .replace(/:\s*("(?:[^"\\]|\\.)*")/g, `: <span class="${styles.string}">$1</span>`)
    .replace(/:\s*(true|false|null)\b/g, `: <span class="${styles.keyword}">$1</span>`)
    .replace(/:\s*(-?\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g, `: <span class="${styles.number}">$1</span>`)
    .replace(/(?<=[\[,]\s*)("(?:[^"\\]|\\.)*")(?=\s*[,\]])/g, `<span class="${styles.string}">$1</span>`);
}

