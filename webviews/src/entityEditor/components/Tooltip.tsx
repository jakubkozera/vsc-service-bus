import React from 'react';
import styles from '../EntityEditor.module.css';

export const Tooltip: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className={styles.tooltipWrap}>
    {children}
    <div className={styles.tooltip}>{label}</div>
  </div>
);
