/**
 * CopyButton Component - Button that copies text to clipboard with visual feedback
 */
import React, { useState, useCallback } from 'react';
import styles from './CopyButton.module.css';

export interface CopyButtonProps {
  /** Text to copy to clipboard */
  getText: () => string;
  /** Optional label shown next to the icon */
  label?: string;
  /** Additional CSS class */
  className?: string;
  /** Button title/tooltip */
  title?: string;
  /** Callback after successful copy */
  onCopy?: () => void;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  getText,
  label,
  className,
  title = 'Copy to clipboard',
  onCopy,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = getText();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail in some VS Code webview configurations
      console.warn('Could not copy to clipboard');
    }
  }, [getText, onCopy]);

  return (
    <button
      className={`${styles.copyButton} ${className || ''}`}
      onClick={handleCopy}
      title={title}
      type="button"
    >
      {copied ? (
        <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {label && <span>{copied ? 'Copied!' : label}</span>}
    </button>
  );
};
