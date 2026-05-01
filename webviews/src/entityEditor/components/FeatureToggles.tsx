import React from 'react';
import { Switch } from '@shared/components';
import { Tooltip } from './Tooltip';
import { FeatureToggle } from '../types';
import styles from '../EntityEditor.module.css';

const LockIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={styles.lockIcon}
  >
    <path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" />
    <path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
    <path d="M8 11v-4a4 4 0 1 1 8 0v4" />
  </svg>
);

export const FeatureToggles: React.FC<{ features: FeatureToggle[]; setP: (k: string, v: any) => void; readonly: boolean }> = ({ features, setP, readonly }) => (
  <div className={styles.panel}>
    <div className={styles.panelHeader}>
      <div className={styles.panelHeaderDot} style={{ background: '#cca700' }} />
      Features
    </div>
    <div className={styles.panelBody} style={{ paddingTop: 6, paddingBottom: 6 }}>
      <div className={styles.togglesList}>
        {features.map((f) => {
          const locked = readonly || !!f.immutable;
          const row = (
            <div key={f.key} className={`${styles.toggleRow} ${locked ? styles.toggleDisabled : ''}`}>
              <div className={styles.toggleInfo}>
                <div className={styles.toggleName}>
                  {f.label}
                </div>
                <div className={styles.toggleDesc}>
                  {f.desc}
                  {f.immutable && <span className={styles.immutableHint}> — cannot be changed after creation</span>}
                </div>
              </div>
              <div className={styles.toggleControls}>
                {f.immutable && <LockIcon />}
                <Switch checked={f.checked} onChange={(v) => setP(f.key, v)} disabled={locked} />
              </div>
            </div>
          );

          if (f.immutable) {
            return (
              <Tooltip key={f.key} label="This property can only be set when creating the entity">
                {row}
              </Tooltip>
            );
          }
          return row;
        })}
      </div>
    </div>
  </div>
);
