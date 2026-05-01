import React from 'react';
import styles from '../EntityEditor.module.css';

export const Panel: React.FC<{ title: string; dotColor?: string; children: React.ReactNode }> = ({ title, dotColor, children }) => (
  <div className={styles.panel}>
    <div className={styles.panelHeader}>
      <div className={styles.panelHeaderDot} style={dotColor ? { background: dotColor } : undefined} />
      {title}
    </div>
    <div className={styles.panelBody}>{children}</div>
  </div>
);
