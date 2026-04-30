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
  return json
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/("(?:[^"\\]|\\.)*")\s*:/g, `<span class="${styles.key}">$1</span>:`)
    .replace(/:\s*("(?:[^"\\]|\\.)*")/g, `: <span class="${styles.string}">$1</span>`)
    .replace(/:\s*(true|false|null)\b/g, `: <span class="${styles.keyword}">$1</span>`)
    .replace(/:\s*(-?\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g, `: <span class="${styles.number}">$1</span>`)
    // Standalone strings in arrays
    .replace(/(?<=[\[,]\s*)("(?:[^"\\]|\\.)*")(?=\s*[,\]])/g, `<span class="${styles.string}">$1</span>`);
}

function colorizeXml(xml: string): string {
  return escapeHtml(xml)
    .replace(/(&lt;\/?)([\w:-]+)/g, `$1<span class="${styles.key}">$2</span>`)
    .replace(/([\w:-]+)(=)(&quot;[^&]*&quot;|"[^"]*")/g, `<span class="${styles.number}">$1</span>$2<span class="${styles.string}">$3</span>`)
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, `<span class="${styles.comment}">$1</span>`);
}
