import React, { useEffect, useState } from 'react';
import { Button } from '@shared/components';
import { useVSCodeMessaging } from '@shared/hooks/useVSCodeMessaging';
import styles from './Listener.module.css';

interface LogEntry { time: string; sequenceNumber?: string; messageId?: string; subject?: string; body?: string; }

export const App: React.FC = () => {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<{ total: number; msPerSec: number }>({ total: 0, msPerSec: 0 });
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(true);
  const { postMessage, subscribe } = useVSCodeMessaging<any, any>();

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.command === 'message') {
        setLog((prev) => {
          const next = [{ time: new Date().toISOString(), ...msg.message }, ...prev];
          return next.slice(0, 10000);
        });
      } else if (msg.command === 'stats') {
        setStats({ total: msg.total, msPerSec: msg.msPerSec });
      } else if (msg.command === 'error') {
        setError(msg.error);
      }
    });
    postMessage({ command: 'webviewReady' });
    return unsub;
  }, [postMessage, subscribe]);

  const stop = () => { setRunning(false); postMessage({ command: 'stop' }); };

  const exportLog = () => {
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'listener-log.json'; a.click();
  };

  return (
    <div className={styles.listener}>
      <div className={styles.content}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerIcon}>📡</div>
          <div>
            <div className={styles.headerText}><h2>Live Listener</h2></div>
            <div className={styles.headerSub}>Receiving messages in real-time</div>
          </div>
        </div>

        {/* Status + Stats */}
        <div className={styles.statusBar}>
          <div className={`${styles.statusBadge} ${running ? styles.statusRunning : styles.statusStopped}`}>
            <span className={`${styles.statusDot} ${running ? styles.statusDotRunning : styles.statusDotStopped}`} />
            {running ? 'Running' : 'Stopped'}
          </div>
        </div>

        <div className={styles.statsRow}>
          <div className={`${styles.statCard} ${styles.statCardHighlighted}`}>
            <span className={styles.statLabel}>Received</span>
            <span className={styles.statValue}>{stats.total}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Messages/sec</span>
            <span className={styles.statValue}>{stats.msPerSec.toFixed(1)}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Log entries</span>
            <span className={styles.statValue}>{log.length}</span>
          </div>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <Button variant="secondary" onClick={stop} disabled={!running}>Stop</Button>
          <Button variant="secondary" onClick={() => setLog([])}>Clear</Button>
          <Button variant="secondary" onClick={exportLog}>Export JSON</Button>
        </div>

        {/* Error */}
        {error && <div className={styles.errorBar}>⚠ {error}</div>}

        {/* Log table */}
        <div className={styles.tableWrapper}>
          <div className={styles.tableScroll}>
            {log.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📡</div>
                {running ? 'Waiting for messages…' : 'No messages received'}
              </div>
            ) : (
              <table className={styles.table}>
                <thead className={styles.tableHead}>
                  <tr>
                    <th className={styles.th}>Time</th>
                    <th className={styles.th}>Seq</th>
                    <th className={styles.th}>Subject</th>
                    <th className={styles.th}>Body (preview)</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((e, i) => (
                    <tr key={i} className={styles.tr}>
                      <td className={`${styles.td} ${styles.timeCell}`}>{e.time.slice(11, 19)}</td>
                      <td className={styles.td}>{e.sequenceNumber}</td>
                      <td className={styles.td}>{e.subject}</td>
                      <td className={`${styles.td} ${styles.tdBody}`}>{e.body}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
