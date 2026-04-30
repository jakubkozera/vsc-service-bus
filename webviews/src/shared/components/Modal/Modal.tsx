/**
 * Modal Component - VS Code styled modal dialog
 */
import React, { useEffect } from 'react';
import styles from './Modal.module.css';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Size preset: 'sm' (400-500px), 'md' (default 600px), 'lg' (500-700px) */
  size?: 'sm' | 'md' | 'lg';
  /** Footer alignment: 'end' (default) or 'space-between' */
  footerAlign?: 'end' | 'space-between';
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  footerAlign = 'end',
  className,
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClass = size !== 'md' ? styles[size] : '';
  const footerClass = `${styles.footer}${footerAlign === 'space-between' ? ` ${styles.footerSpaceBetween}` : ''}`;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.modal} ${sizeClass} ${className || ''}`.trim()}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.closeButton} onClick={onClose} type="button">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path
                fill="currentColor"
                d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"
              />
            </svg>
          </button>
        </div>
        <div className={styles.content}>{children}</div>
        {footer && <div className={footerClass}>{footer}</div>}
      </div>
    </div>
  );
};
