import React, { useMemo } from 'react';
import styles from './CodeViewer.module.css';

export interface CodeViewerProps {
  value: string;
  language?: 'json' | 'xml' | 'plaintext';
  maxHeight?: number | string;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({ value, language = 'plaintext', maxHeight }) => {
  const lines = useMemo(() => value.split('\n'), [value]);
  const highlighted = useMemo(() => {
    if (language === 'json') return colorizeJson(value);
    if (language === 'xml') return colorizeXml(value);
    return escapeHtml(value);
  }, [value, language]);

  return (
    <div className={styles.codeViewer} style={maxHeight ? { maxHeight } : undefined}>
      <div className={styles.lineNumbers}>
        {lines.map((_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <pre className={styles.code} dangerouslySetInnerHTML={{ __html: highlighted }} />
    </div>
  );
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function colorizeJson(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Single-pass tokenization. Strings are matched as a top-level alternative so
  // that the regex engine never re-enters string contents — preventing things
  // like timestamps "T12:22:25.882Z" being mis-tokenized as numbers.
  return escaped.replace(
    /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (_match, str, trailingColon, kw, num) => {
      if (str !== undefined) {
        if (trailingColon) {
          // Key (string immediately followed by colon)
          return `<span class="${styles.key}">${str}</span>${trailingColon}`;
        }
        return `<span class="${styles.string}">${str}</span>`;
      }
      if (kw !== undefined) return `<span class="${styles.keyword}">${kw}</span>`;
      if (num !== undefined) return `<span class="${styles.number}">${num}</span>`;
      return _match;
    }
  );
}

function colorizeXml(xml: string): string {
  return escapeHtml(xml)
    .replace(/(&lt;\/?)([\w:-]+)/g, `$1<span class="${styles.key}">$2</span>`)
    .replace(/([\w:-]+)(=)(&quot;[^&]*&quot;|"[^"]*")/g, `<span class="${styles.number}">$1</span>$2<span class="${styles.string}">$3</span>`)
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, `<span class="${styles.comment}">$1</span>`);
}
