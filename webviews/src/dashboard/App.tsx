import React, { useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, Input } from '@shared/components';
import { useVSCodeMessaging } from '@shared/hooks/useVSCodeMessaging';
import styles from './Dashboard.module.css';

interface Row { kind: 'queue' | 'sub'; name: string; active: number; dlq: number; scheduled: number; total: number; sizeBytes: number; }
interface Snapshot { capturedAt: string; queues: Row[]; subscriptions: Row[]; }

const REFRESH_OPTIONS = [
  { value: '0', label: 'Off' },
  { value: '5', label: '5s' },
  { value: '15', label: '15s' },
  { value: '30', label: '30s' },
  { value: '60', label: '60s' },
];

const COLUMNS: { key: keyof Row; label: string }[] = [
  { key: 'kind', label: 'Type' },
  { key: 'name', label: 'Name' },
  { key: 'active', label: 'Active' },
  { key: 'dlq', label: 'DLQ' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'total', label: 'Total' },
  { key: 'sizeBytes', label: 'Size (B)' },
];

export const App: React.FC = () => {
  const [init, setInit] = useState<{ namespaceName: string; fqdn: string } | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [interval, setIntervalSec] = useState('15');
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<keyof Row>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const { postMessage, subscribe } = useVSCodeMessaging<any, any>();

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.command === 'init') setInit(msg.data);
      else if (msg.command === 'snapshot') setSnap({ capturedAt: msg.capturedAt, queues: msg.queues, subscriptions: msg.subscriptions });
    });
    postMessage({ command: 'webviewReady' });
    return unsub;
  }, [postMessage, subscribe]);

  useEffect(() => {
    const sec = Number(interval);
    if (!sec) return;
    const t = setInterval(() => postMessage({ command: 'refresh' }), sec * 1000);
    return () => clearInterval(t);
  }, [interval, postMessage]);

  const rows = useMemo<Row[]>(() => {
    if (!snap) return [];
    const all = [...snap.queues, ...snap.subscriptions];
    const filtered = filter ? all.filter(r => r.name.toLowerCase().includes(filter.toLowerCase())) : all;
    return [...filtered].sort((a, b) => {
      const av = (a as any)[sortKey]; const bv = (b as any)[sortKey];
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortAsc ? cmp : -cmp;
    });
  }, [snap, filter, sortKey, sortAsc]);

  const totals = useMemo(() => {
    const q = snap?.queues ?? []; const s = snap?.subscriptions ?? [];
    const all = [...q, ...s];
    return {
      queues: q.length,
      subs: s.length,
      active: all.reduce((a, x) => a + x.active, 0),
      dlq: all.reduce((a, x) => a + x.dlq, 0),
      scheduled: all.reduce((a, x) => a + x.scheduled, 0),
      total: all.reduce((a, x) => a + x.total, 0),
    };
  }, [snap]);

  if (!init) return <div className={styles.emptyState}>Loading…</div>;

  const exportCsv = () => {
    const header = 'kind,name,active,dlq,scheduled,total,sizeBytes\n';
    const csv = header + rows.map(r => `${r.kind},${r.name},${r.active},${r.dlq},${r.scheduled},${r.total},${r.sizeBytes}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${init.namespaceName}-snapshot.csv`; a.click();
  };

  const sortBy = (k: keyof Row) => {
    if (sortKey === k) setSortAsc(!sortAsc); else { setSortKey(k); setSortAsc(true); }
  };

  return (
    <div className={styles.dashboard}>
      <div className={styles.content}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerIcon}>🚌</div>
          <div>
            <div className={styles.headerText}><h2>{init.namespaceName}</h2></div>
            <div className={styles.headerFqdn}>{init.fqdn}</div>
          </div>
        </div>

        {/* Stats cards */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Queues</span>
            <span className={styles.statValue}>{totals.queues}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Subscriptions</span>
            <span className={styles.statValue}>{totals.subs}</span>
          </div>
          <div className={`${styles.statCard} ${styles.statCardHighlighted}`}>
            <span className={styles.statLabel}>Active</span>
            <span className={styles.statValue}>{totals.active}</span>
          </div>
          <div className={`${styles.statCard} ${totals.dlq > 0 ? styles.statCardWarning : ''}`}>
            <span className={styles.statLabel}>Dead-letter</span>
            <span className={styles.statValue}>{totals.dlq}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Scheduled</span>
            <span className={styles.statValue}>{totals.scheduled}</span>
          </div>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <Button variant="primary" onClick={() => postMessage({ command: 'refresh' })}>Refresh</Button>
          <div style={{ minWidth: 110 }}>
            <Dropdown label="Auto-refresh" options={REFRESH_OPTIONS} value={interval} onChange={setIntervalSec} />
          </div>
          <Input label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="search…" style={{ width: 160 }} />
          <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
          <div className={styles.toolbarSpacer} />
          {snap && (
            <div className={styles.capturedAt}>
              {Number(interval) > 0 && <span className={styles.liveDot} />}
              {snap.capturedAt}
            </div>
          )}
        </div>

        {/* Table */}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead className={styles.tableHead}>
              <tr>
                {COLUMNS.map(col => (
                  <th key={col.key}
                    className={`${styles.th} ${sortKey === col.key ? styles.thActive : ''}`}
                    onClick={() => sortBy(col.key)}>
                    {col.label}{sortKey === col.key ? (sortAsc ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.kind}:${r.name}`} className={`${styles.tr} ${r.dlq > 0 ? styles.trWarning : ''}`}>
                  <td className={styles.td}>
                    <span className={`${styles.kindBadge} ${r.kind === 'queue' ? styles.kindQueue : styles.kindSub}`}>
                      {r.kind === 'queue' ? 'Queue' : 'Sub'}
                    </span>
                  </td>
                  <td className={styles.td}>{r.name}</td>
                  <td className={styles.td}>{r.active}</td>
                  <td className={`${styles.td} ${r.dlq > 0 ? styles.dlqCell : ''}`}>{r.dlq}</td>
                  <td className={styles.td}>{r.scheduled}</td>
                  <td className={styles.td}>{r.total}</td>
                  <td className={styles.td}>{formatBytes(r.sizeBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className={styles.emptyState}>No data — click Refresh to load</div>}
        </div>
      </div>
    </div>
  );
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
