/**
 * LoadingOverlay Component - Loading spinner with optional text
 */
import React from 'react';
import styles from './LoadingOverlay.module.css';

export interface LoadingOverlayProps {
  isLoading: boolean;
  text?: string;
  className?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isLoading,
  text = 'Loading...',
  className,
}) => {
  if (!isLoading) return null;

  return (
    <div className={`${styles.overlay} ${className || ''}`}>
      <div className={styles.content}>
        <div className={styles.spinner}></div>
        {text && <p className={styles.text}>{text}</p>}
      </div>
    </div>
  );
};
