import React, { useMemo, useState } from 'react';
import { Button, Modal } from '@shared/components';
import { IconEye, IconTrash, IconSend, IconArrowForwardUp, IconPlus } from '@tabler/icons-react';
import { Tooltip } from './Tooltip';
import { formatSize } from '../helpers';
import styles from '../EntityEditor.module.css';

export const StatsRow: React.FC<{ runtime: any; kind: string; postMessage: (msg: any) => void; setPurging: (v: boolean) => void }> = ({ runtime, kind, postMessage, setPurging }) => {
  const [purgeTarget, setPurgeTarget] = useState<'active' | 'deadLetter' | 'scheduled' | null>(null);

  const cards = useMemo(() => {
    if (kind === 'topic') {
      return [
        { label: 'Subscriptions', value: runtime.subscriptionCount ?? 0, sub: 'active', highlighted: true, showCreate: true },
        { label: 'Scheduled', value: runtime.scheduledMessageCount ?? 0, sub: 'messages' },
        { label: 'Size', value: formatSize(runtime.sizeInBytes ?? 0), sub: `${(runtime.sizeInBytes ?? 0).toLocaleString()} bytes`, isText: true },
      ];
    }
    return [
      { label: 'Total', value: runtime.totalMessageCount ?? runtime.activeMessageCount ?? 0, sub: 'messages', highlighted: true },
      { label: 'Active', value: runtime.activeMessageCount ?? 0, sub: 'messages', type: 'active' as const },
      { label: 'Dead-letter', value: runtime.deadLetterMessageCount ?? 0, sub: 'messages', type: 'deadLetter' as const },
      { label: 'Scheduled', value: runtime.scheduledMessageCount ?? 0, sub: 'messages', type: 'scheduled' as const },
      { label: 'Size', value: formatSize(runtime.sizeInBytes ?? 0), sub: `${(runtime.sizeInBytes ?? 0).toLocaleString()} bytes`, isText: true },
    ];
  }, [runtime, kind]);

  const confirmPurge = (target: 'active' | 'deadLetter' | 'scheduled') => setPurgeTarget(target);

  const doPurge = () => {
    if (!purgeTarget) return;
    const cmd = purgeTarget === 'active' ? 'purgeActive' : purgeTarget === 'deadLetter' ? 'purgeDeadLetter' : 'purgeScheduled';
    setPurging(true);
    postMessage({ command: cmd });
    setPurgeTarget(null);
  };

  return (
    <>
      <div className={styles.statsRow}>
        {cards.map((c, i) => (
          <div key={i} className={`${styles.statCard} ${c.highlighted ? styles.statCardHighlighted : ''}`}>
            <div className={styles.statLabel}>{c.label}</div>
            <div className={`${styles.statValue} ${c.highlighted ? styles.statValueAccent : ''}`}
              style={(c as any).isText ? { fontSize: 16, lineHeight: 1.4 } : undefined}>
              {c.value}
            </div>
            <div className={styles.statBottom}>
              <span className={styles.statSub}>{c.sub}</span>
              {(c as any).showCreate && (
                <div className={styles.statActions}>
                  <Tooltip label="Create Subscription">
                    <button className={styles.statIconBtn} onClick={() => postMessage({ command: 'createSubscription' })}>
                      <IconPlus size={16} />
                    </button>
                  </Tooltip>
                </div>
              )}
              {'type' in c && (
                <div className={styles.statActions}>
                  <Tooltip label="View messages">
                    <button className={styles.statIconBtn} onClick={() => postMessage({ command: c.type === 'active' ? 'viewMessages' : c.type === 'deadLetter' ? 'viewDeadLetter' : 'viewScheduled' })}>
                      <IconEye size={16} />
                    </button>
                  </Tooltip>
                  {(c.type === 'active' || c.type === 'scheduled') && (
                    <Tooltip label={c.type === 'scheduled' ? 'Schedule message' : 'Send message'}>
                      <button className={styles.statIconBtn} onClick={() => postMessage({ command: c.type === 'scheduled' ? 'sendScheduled' : 'sendMessage' })}>
                        <IconSend size={16} />
                      </button>
                    </Tooltip>
                  )}
                  {c.type === 'deadLetter' && (
                    <Tooltip label="Transfer dead-letter">
                      <button className={styles.statIconBtn} onClick={() => postMessage({ command: 'viewTransferDeadLetter' })}>
                        <IconArrowForwardUp size={16} />
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip label={c.type === 'scheduled' ? 'Cancel scheduled' : 'Purge messages'}>
                    <button className={styles.statIconBtn} onClick={() => confirmPurge(c.type!)}>
                      <IconTrash size={16} />
                    </button>
                  </Tooltip>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <Modal
        isOpen={purgeTarget !== null}
        onClose={() => setPurgeTarget(null)}
        title="Confirm Purge"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPurgeTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={doPurge}>Purge</Button>
          </>
        }
      >
        <p>Are you sure you want to {purgeTarget === 'scheduled' ? 'cancel all' : 'purge all'} <strong>{purgeTarget === 'active' ? 'active' : purgeTarget === 'deadLetter' ? 'dead-letter' : 'scheduled'}</strong> messages?</p>
        <p style={{ color: 'var(--vscode-errorForeground)', fontSize: 12 }}>This action cannot be undone.</p>
      </Modal>
    </>
  );
};
