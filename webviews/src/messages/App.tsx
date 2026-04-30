import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dropdown, Input, Modal, NumberInput, CodeViewer } from '@shared/components';
import { useVSCodeMessaging } from '@shared/hooks/useVSCodeMessaging';
import { IconRefresh, IconTrash, IconX, IconCopy, IconMailboxOff, IconDownload, IconClearAll, IconFileExport, IconArrowBackUp, IconArrowMoveRight, IconCheck, IconRotate, IconPlayerPause, IconSkull, IconChevronLeft, IconChevronRight, IconFilter } from '@tabler/icons-react';
import styles from './Messages.module.css';

interface Msg {
  sequenceNumber: string;
  messageId?: string;
  subject?: string;
  contentType?: string;
  enqueuedTimeUtc?: string;
  deliveryCount?: number;
  state?: string;
  body?: string;
  applicationProperties?: Record<string, any>;
  deadLetterReason?: string;
  deadLetterErrorDescription?: string;
  deadLetterSource?: string;
}

type Mode = 'peek' | 'peekLock' | 'receiveAndDelete';

const MODE_OPTIONS = [
  { value: 'peek', label: 'Peek (non-destructive)' },
  { value: 'peekLock', label: 'Receive (PeekLock)' },
  { value: 'receiveAndDelete', label: 'Receive & Delete' },
];

type FilterOp = 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'gt' | 'gte' | 'lt' | 'lte' | 'before' | 'after';

interface ColumnFilter {
  op: FilterOp;
  value: string;
}

const TEXT_OPS: { value: FilterOp; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'startsWith', label: 'Starts with' },
  { value: 'endsWith', label: 'Ends with' },
];

const NUMBER_OPS: { value: FilterOp; label: string }[] = [
  { value: 'equals', label: '=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
];

const DATE_OPS: { value: FilterOp; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'after', label: 'After' },
  { value: 'before', label: 'Before' },
  { value: 'equals', label: 'Equals' },
];

function matchesFilter(cellValue: string | number | undefined, filter: ColumnFilter, type: 'text' | 'number' | 'date'): boolean {
  const val = filter.value;
  if (!val) return true;

  if (type === 'number') {
    const num = Number(val);
    const cell = typeof cellValue === 'number' ? cellValue : Number(cellValue ?? 0);
    if (isNaN(num)) return true;
    switch (filter.op) {
      case 'equals': return cell === num;
      case 'gt': return cell > num;
      case 'gte': return cell >= num;
      case 'lt': return cell < num;
      case 'lte': return cell <= num;
      default: return true;
    }
  }

  if (type === 'date') {
    const cellStr = String(cellValue ?? '');
    switch (filter.op) {
      case 'contains': return cellStr.toLowerCase().includes(val.toLowerCase());
      case 'after': return cellStr >= val;
      case 'before': return cellStr <= val;
      case 'equals': return cellStr.startsWith(val);
      default: return true;
    }
  }

  // text
  const cellStr = String(cellValue ?? '').toLowerCase();
  const search = val.toLowerCase();
  switch (filter.op) {
    case 'contains': return cellStr.includes(search);
    case 'equals': return cellStr === search;
    case 'startsWith': return cellStr.startsWith(search);
    case 'endsWith': return cellStr.endsWith(search);
    default: return true;
  }
}

export const App: React.FC = () => {
  const [init, setInit] = useState<{ source: any; isDLQ: boolean; peekDefault: number; totalMessageCount?: number } | null>(null);
  const [mode, setMode] = useState<Mode>('peek');
  const [count, setCount] = useState(50);
  const [items, setItems] = useState<Msg[]>([]);
  const [selected, setSelected] = useState<Msg | null>(null);
  const [selectedSeqs, setSelectedSeqs] = useState<Set<string>>(new Set());
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dlqReasonOpen, setDlqReasonOpen] = useState<Msg | null>(null);
  const [dlqReason, setDlqReason] = useState({ reason: '', description: '' });
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copiedBody, setCopiedBody] = useState(false);
  const [copiedAppProps, setCopiedAppProps] = useState(false);
  const [totalMessageCount, setTotalMessageCount] = useState(0);
  const [page, setPage] = useState(1);
  const { postMessage, subscribe } = useVSCodeMessaging<any, any>();

  // Keep a ref for selectedSeqs so the message handler always has the latest value
  const selectedSeqsRef = useRef(selectedSeqs);
  selectedSeqsRef.current = selectedSeqs;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Auto-fetch ref to trigger after init
  const autoFetched = useRef(false);
  const postMessageRef = useRef(postMessage);
  postMessageRef.current = postMessage;

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.command === 'init') {
        setInit(msg.data);
        setCount(msg.data.peekDefault ?? 50);
        if (msg.data.totalMessageCount != null) setTotalMessageCount(msg.data.totalMessageCount);
        // Auto-fetch on open
        if (!autoFetched.current) {
          autoFetched.current = true;
          setLoading(true);
          postMessageRef.current({ command: 'peek', count: msg.data.peekDefault ?? 50 });
        }
      } else if (msg.command === 'messages') {
        setItems(msg.items);
        setSelected(null);
        setSelectedSeqs(new Set());
        setLoading(false);
        setActionLoading(false);
        if (msg.totalMessageCount != null) setTotalMessageCount(msg.totalMessageCount);
      } else if (msg.command === 'actionDone') {
        setActionLoading(false);
        setItems((prev) => prev.filter((m) => m.sequenceNumber !== msg.sequenceNumber));
        setSelected((prev) => prev?.sequenceNumber === msg.sequenceNumber ? null : prev);
        const actionLabel = msg.action === 'resend' ? 'Resent' : msg.action === 'delete' ? 'Deleted' : msg.action === 'complete' ? 'Completed' : msg.action;
        showToast(`${actionLabel} message #${msg.sequenceNumber}`);
      } else if (msg.command === 'resubmitDone') {
        setActionLoading(false);
        showToast(`Resubmitted ${msg.count} message(s)`);
      } else if (msg.command === 'moveDone') {
        setActionLoading(false);
        showToast(`Moved ${msg.count} message(s)`);
      } else if (msg.command === 'error') {
        setError(msg.error);
        setLoading(false);
        setActionLoading(false);
      } else if (msg.command === 'moveTargetSelected') {
        postMessage({ command: 'moveTo', targetKind: msg.targetKind, targetName: msg.targetName, sequenceNumbers: Array.from(selectedSeqsRef.current) });
      }
    });
    postMessage({ command: 'webviewReady' });
    return unsub;
  }, [postMessage, subscribe]);

  const filtered = useMemo(() => items.filter((m) => {
    for (const [col, filter] of Object.entries(columnFilters)) {
      if (!filter.value) continue;
      if (col === 'sequenceNumber') {
        if (!matchesFilter(m.sequenceNumber, filter, 'number')) return false;
      } else if (col === 'messageId') {
        if (!matchesFilter(m.messageId, filter, 'text')) return false;
      } else if (col === 'subject') {
        if (!matchesFilter(m.subject, filter, 'text')) return false;
      } else if (col === 'enqueuedTimeUtc') {
        if (!matchesFilter(m.enqueuedTimeUtc, filter, 'date')) return false;
      } else if (col === 'deliveryCount') {
        if (!matchesFilter(m.deliveryCount, filter, 'number')) return false;
      }
    }
    return true;
  }), [items, columnFilters]);

  // Pagination based on server-side total message count
  const totalPages = Math.max(1, Math.ceil(totalMessageCount / count));
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  const fetchPage = useCallback((targetPage: number, fromSeq?: string) => {
    setError(null);
    setLoading(true);
    setPage(targetPage);
    if (mode === 'peek') {
      postMessage({ command: 'peek', count, fromSequenceNumber: fromSeq });
    } else if (mode === 'peekLock') {
      postMessage({ command: 'receivePeekLock', count });
    } else if (mode === 'receiveAndDelete') {
      postMessage({ command: 'receiveAndDelete', count });
    }
  }, [mode, count, postMessage]);

  const fetchMessages = () => {
    setPage(1);
    fetchPage(1);
  };

  const goNextPage = () => {
    if (!hasNextPage || items.length === 0) return;
    // Use last message's sequence number + 1 to fetch next page
    const lastSeq = items[items.length - 1].sequenceNumber;
    const nextSeq = (BigInt(lastSeq) + 1n).toString();
    fetchPage(page + 1, nextSeq);
  };

  const goPrevPage = () => {
    if (!hasPrevPage) return;
    // Go back to page 1 (or re-fetch from beginning for simplicity)
    // For a proper "previous" we'd need to track sequence offsets; reset to start
    if (page - 1 === 1) {
      fetchPage(1);
    } else {
      // We can't easily go back with peek, reset to first page
      fetchPage(1);
    }
  };

  // Format body for Monaco
  const bodyText = useMemo(() => {
    if (!selected?.body) return '';
    return tryFormatBody(selected.body, selected.contentType);
  }, [selected]);

  // Format application properties for Monaco
  const appPropsText = useMemo(() => {
    if (!selected?.applicationProperties || Object.keys(selected.applicationProperties).length === 0) return '';
    return JSON.stringify(selected.applicationProperties, null, 2);
  }, [selected]);

  // Detect language from content
  const bodyLanguage = useMemo(() => {
    if (!selected?.body) return 'plaintext';
    if (selected.contentType?.includes('json')) return 'json';
    if (selected.contentType?.includes('xml')) return 'xml';
    const trimmed = selected.body.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
    if (trimmed.startsWith('<')) return 'xml';
    return 'plaintext';
  }, [selected]);

  // Resizable panel
  const [panelHeight, setPanelHeight] = useState(340);
  const resizing = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    startY.current = e.clientY;
    startH.current = panelHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const delta = startY.current - ev.clientY;
      const newH = Math.max(150, Math.min(window.innerHeight - 200, startH.current + delta));
      setPanelHeight(newH);
    };
    const onUp = () => {
      resizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [panelHeight]);

  // Track last clicked index for Shift+Click range selection
  const lastClickedIdx = useRef<number | null>(null);

  // Close filter popup on click outside
  useEffect(() => {
    if (!activeFilter) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.filterPopup}`) && !target.closest(`.${styles.filterBtn}`)) {
        setActiveFilter(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeFilter]);

  const handleRowClick = (m: Msg, idx: number, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+Click: toggle individual checkbox
      e.preventDefault();
      const next = new Set(selectedSeqs);
      if (next.has(m.sequenceNumber)) next.delete(m.sequenceNumber); else next.add(m.sequenceNumber);
      setSelectedSeqs(next);
      lastClickedIdx.current = idx;
    } else if (e.shiftKey && lastClickedIdx.current !== null) {
      // Shift+Click: range select/deselect
      e.preventDefault();
      const start = Math.min(lastClickedIdx.current, idx);
      const end = Math.max(lastClickedIdx.current, idx);
      const next = new Set(selectedSeqs);
      const isSelecting = !next.has(m.sequenceNumber);
      for (let i = start; i <= end; i++) {
        if (isSelecting) next.add(filtered[i].sequenceNumber); else next.delete(filtered[i].sequenceNumber);
      }
      setSelectedSeqs(next);
    } else {
      setSelected(m);
      lastClickedIdx.current = idx;
    }
  };

  if (!init) return <div className={styles.emptyState}>Loading…</div>;

  const isPeekLock = mode === 'peekLock';
  const hasMessages = filtered.length > 0;
  const hasSelection = selectedSeqs.size > 0;

  return (
    <div className={styles.viewer}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <div style={{ minWidth: 210 }}>
            <Dropdown options={MODE_OPTIONS} value={mode} onChange={(v) => setMode(v as Mode)} label="Mode" />
          </div>
          <NumberInput label="Count" value={String(count)} onChange={(e) => setCount(Number(e.target.value) || 1)} style={{ width: 150 }} />
          <button className={`${styles.toolBtn} ${styles.toolBtnPrimary}`} onClick={fetchMessages} disabled={loading} title="Fetch messages">
            {loading ? <div className={styles.loader} /> : <IconDownload size={16} stroke={1.8} />}
            Fetch
          </button>
        </div>
      </div>

      {/* Error bar */}
      {error && <div className={styles.errorBar}>{error}</div>}

      {/* Main area: table on top, detail on bottom */}
      <div className={styles.mainArea}>
        {/* Table */}
        <div className={styles.tablePanel}>
          {/* Footer bar - always visible */}
          <div className={styles.footerBar}>
            <div className={styles.footerLeft}>
              <span>{filtered.length} messages</span>
              {hasSelection && <span>{selectedSeqs.size} selected</span>}
            </div>
            <div className={styles.footerCenter}>
              {totalPages > 1 && (
                <>
                  <button className={styles.pageBtn} disabled={!hasPrevPage || loading} onClick={goPrevPage} title="Previous page">
                    <IconChevronLeft size={16} stroke={2} />
                  </button>
                  <span className={styles.pageInfo}>Page {page} of {totalPages}</span>
                  <button className={styles.pageBtn} disabled={!hasNextPage || loading} onClick={goNextPage} title="Next page">
                    <IconChevronRight size={16} stroke={2} />
                  </button>
                </>
              )}
            </div>
            <div className={styles.footerRight}>
              {hasMessages && (
                <button className={styles.toolBtn} onClick={() => {
                  if (hasSelection) {
                    setItems((prev) => prev.filter((m) => !selectedSeqs.has(m.sequenceNumber)));
                    setSelectedSeqs(new Set());
                    setSelected(null);
                  } else {
                    setItems([]);
                    setSelected(null);
                  }
                }} title={hasSelection ? 'Remove selected from list' : 'Clear list'}>
                  <IconClearAll size={16} stroke={1.8} />{hasSelection ? 'Remove selected' : 'Clear'}
                </button>
              )}
              {hasMessages && (
                <button className={styles.toolBtn} onClick={() => postMessage({ command: 'export', items: hasSelection ? items.filter(m => selectedSeqs.has(m.sequenceNumber)) : items })} title={hasSelection ? 'Export selected to JSON' : 'Export all to JSON'}>
                  <IconFileExport size={16} stroke={1.8} />{hasSelection ? 'Export selected' : 'Export'}
                </button>
              )}
              {hasSelection && (
                <>
                  {init.isDLQ && (
                    <button className={`${styles.toolBtn} ${styles.toolBtnPrimary}`} onClick={() => { setActionLoading(true); postMessage({ command: 'resubmit', sequenceNumbers: Array.from(selectedSeqs), count }); }} title="Resubmit selected messages">
                      <IconArrowBackUp size={16} stroke={1.8} />Resubmit
                    </button>
                  )}
                  <button className={styles.toolBtn} onClick={() => postMessage({ command: 'pickMoveTarget' })} title="Move selected to another queue or topic">
                    <IconArrowMoveRight size={16} stroke={1.8} />Move to…
                  </button>
                </>
              )}
            </div>
          </div>

          {filtered.length === 0 && Object.keys(columnFilters).length === 0 && items.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}><IconMailboxOff size={32} stroke={1.5} /></div>
              No messages
            </div>
          ) : (
            <table className={styles.table}>
              <thead className={styles.tableHead}>
                <tr>
                  <th className={styles.th}>
                    <input type="checkbox" className={styles.checkbox}
                      checked={filtered.length > 0 && filtered.every(m => selectedSeqs.has(m.sequenceNumber))}
                      onChange={(e) => {
                        const next = new Set(selectedSeqs);
                        if (e.target.checked) { filtered.forEach(m => next.add(m.sequenceNumber)); }
                        else { filtered.forEach(m => next.delete(m.sequenceNumber)); }
                        setSelectedSeqs(next);
                      }} />
                  </th>
                  <th className={styles.th}>
                    <span className={styles.thContent}>
                      Seq
                      <button className={`${styles.filterBtn} ${columnFilters.sequenceNumber ? styles.filterBtnActive : ''}`} onClick={(e) => { e.stopPropagation(); setActiveFilter(activeFilter === 'sequenceNumber' ? null : 'sequenceNumber'); }} title="Filter"><IconFilter size={12} stroke={2} /></button>
                    </span>
                    {activeFilter === 'sequenceNumber' && (
                      <div className={styles.filterPopup} onClick={(e) => e.stopPropagation()}>
                        <select className={styles.filterSelect} value={columnFilters.sequenceNumber?.op ?? 'gte'} onChange={(e) => setColumnFilters(p => ({ ...p, sequenceNumber: { ...p.sequenceNumber ?? { op: 'gte', value: '' }, op: e.target.value as FilterOp } }))}>
                          {NUMBER_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <input className={styles.filterInput} type="number" placeholder="Value…" autoFocus value={columnFilters.sequenceNumber?.value ?? ''} onChange={(e) => setColumnFilters(p => ({ ...p, sequenceNumber: { op: p.sequenceNumber?.op ?? 'gte', value: e.target.value } }))} />
                        <button className={styles.filterClear} onClick={() => { setColumnFilters(p => { const n = { ...p }; delete n.sequenceNumber; return n; }); setActiveFilter(null); }}><IconX size={12} /></button>
                      </div>
                    )}
                  </th>
                  <th className={styles.th}>
                    <span className={styles.thContent}>
                      MessageId
                      <button className={`${styles.filterBtn} ${columnFilters.messageId ? styles.filterBtnActive : ''}`} onClick={(e) => { e.stopPropagation(); setActiveFilter(activeFilter === 'messageId' ? null : 'messageId'); }} title="Filter"><IconFilter size={12} stroke={2} /></button>
                    </span>
                    {activeFilter === 'messageId' && (
                      <div className={styles.filterPopup} onClick={(e) => e.stopPropagation()}>
                        <select className={styles.filterSelect} value={columnFilters.messageId?.op ?? 'contains'} onChange={(e) => setColumnFilters(p => ({ ...p, messageId: { ...p.messageId ?? { op: 'contains', value: '' }, op: e.target.value as FilterOp } }))}>
                          {TEXT_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <input className={styles.filterInput} type="text" placeholder="Value…" autoFocus value={columnFilters.messageId?.value ?? ''} onChange={(e) => setColumnFilters(p => ({ ...p, messageId: { op: p.messageId?.op ?? 'contains', value: e.target.value } }))} />
                        <button className={styles.filterClear} onClick={() => { setColumnFilters(p => { const n = { ...p }; delete n.messageId; return n; }); setActiveFilter(null); }}><IconX size={12} /></button>
                      </div>
                    )}
                  </th>
                  <th className={styles.th}>
                    <span className={styles.thContent}>
                      Subject
                      <button className={`${styles.filterBtn} ${columnFilters.subject ? styles.filterBtnActive : ''}`} onClick={(e) => { e.stopPropagation(); setActiveFilter(activeFilter === 'subject' ? null : 'subject'); }} title="Filter"><IconFilter size={12} stroke={2} /></button>
                    </span>
                    {activeFilter === 'subject' && (
                      <div className={styles.filterPopup} onClick={(e) => e.stopPropagation()}>
                        <select className={styles.filterSelect} value={columnFilters.subject?.op ?? 'contains'} onChange={(e) => setColumnFilters(p => ({ ...p, subject: { ...p.subject ?? { op: 'contains', value: '' }, op: e.target.value as FilterOp } }))}>
                          {TEXT_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <input className={styles.filterInput} type="text" placeholder="Value…" autoFocus value={columnFilters.subject?.value ?? ''} onChange={(e) => setColumnFilters(p => ({ ...p, subject: { op: p.subject?.op ?? 'contains', value: e.target.value } }))} />
                        <button className={styles.filterClear} onClick={() => { setColumnFilters(p => { const n = { ...p }; delete n.subject; return n; }); setActiveFilter(null); }}><IconX size={12} /></button>
                      </div>
                    )}
                  </th>
                  <th className={styles.th}>
                    <span className={styles.thContent}>
                      Enqueued
                      <button className={`${styles.filterBtn} ${columnFilters.enqueuedTimeUtc ? styles.filterBtnActive : ''}`} onClick={(e) => { e.stopPropagation(); setActiveFilter(activeFilter === 'enqueuedTimeUtc' ? null : 'enqueuedTimeUtc'); }} title="Filter"><IconFilter size={12} stroke={2} /></button>
                    </span>
                    {activeFilter === 'enqueuedTimeUtc' && (
                      <div className={styles.filterPopup} onClick={(e) => e.stopPropagation()}>
                        <select className={styles.filterSelect} value={columnFilters.enqueuedTimeUtc?.op ?? 'contains'} onChange={(e) => setColumnFilters(p => ({ ...p, enqueuedTimeUtc: { ...p.enqueuedTimeUtc ?? { op: 'contains', value: '' }, op: e.target.value as FilterOp } }))}>
                          {DATE_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <input className={styles.filterInput} type="text" placeholder="e.g. 2024-01-15" autoFocus value={columnFilters.enqueuedTimeUtc?.value ?? ''} onChange={(e) => setColumnFilters(p => ({ ...p, enqueuedTimeUtc: { op: p.enqueuedTimeUtc?.op ?? 'contains', value: e.target.value } }))} />
                        <button className={styles.filterClear} onClick={() => { setColumnFilters(p => { const n = { ...p }; delete n.enqueuedTimeUtc; return n; }); setActiveFilter(null); }}><IconX size={12} /></button>
                      </div>
                    )}
                  </th>
                  <th className={styles.th}>
                    <span className={styles.thContent}>
                      DC
                      <button className={`${styles.filterBtn} ${columnFilters.deliveryCount ? styles.filterBtnActive : ''}`} onClick={(e) => { e.stopPropagation(); setActiveFilter(activeFilter === 'deliveryCount' ? null : 'deliveryCount'); }} title="Filter"><IconFilter size={12} stroke={2} /></button>
                    </span>
                    {activeFilter === 'deliveryCount' && (
                      <div className={`${styles.filterPopup} ${styles.filterPopupRight}`} onClick={(e) => e.stopPropagation()}>
                        <select className={styles.filterSelect} value={columnFilters.deliveryCount?.op ?? 'equals'} onChange={(e) => setColumnFilters(p => ({ ...p, deliveryCount: { ...p.deliveryCount ?? { op: 'equals', value: '' }, op: e.target.value as FilterOp } }))}>
                          {NUMBER_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <input className={styles.filterInput} type="number" placeholder="Value…" autoFocus value={columnFilters.deliveryCount?.value ?? ''} onChange={(e) => setColumnFilters(p => ({ ...p, deliveryCount: { op: p.deliveryCount?.op ?? 'equals', value: e.target.value } }))} />
                        <button className={styles.filterClear} onClick={() => { setColumnFilters(p => { const n = { ...p }; delete n.deliveryCount; return n; }); setActiveFilter(null); }}><IconX size={12} /></button>
                      </div>
                    )}
                  </th>
                  {isPeekLock && <th className={styles.th}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={isPeekLock ? 7 : 6} className={styles.emptyStateCell}>
                    <div className={styles.emptyIcon}><IconMailboxOff size={24} stroke={1.5} /></div>
                    No matching messages
                  </td></tr>
                ) : filtered.map((m, idx) => (
                  <tr key={m.sequenceNumber}
                    className={`${styles.tr} ${selected?.sequenceNumber === m.sequenceNumber ? styles.trSelected : ''}`}
                    onClick={(e) => handleRowClick(m, idx, e)}>
                    <td className={styles.td}>
                      <input type="checkbox" className={styles.checkbox}
                        checked={selectedSeqs.has(m.sequenceNumber)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          const next = new Set(selectedSeqs);
                          if (e.target.checked) next.add(m.sequenceNumber); else next.delete(m.sequenceNumber);
                          setSelectedSeqs(next);
                          lastClickedIdx.current = idx;
                        }} />
                    </td>
                    <td className={styles.td}>{m.sequenceNumber}</td>
                    <td className={styles.td}>{m.messageId}</td>
                    <td className={styles.td}>{m.subject}</td>
                    <td className={styles.td}>{m.enqueuedTimeUtc?.toString().slice(0, 19)}</td>
                    <td className={styles.td}>{m.deliveryCount}</td>
                    {isPeekLock && (
                      <td className={styles.tdActions}>
                        <button className={styles.actionBtn} data-tooltip="Complete" onClick={(e) => { e.stopPropagation(); postMessage({ command: 'complete', sequenceNumber: m.sequenceNumber }); }}><IconCheck size={14} stroke={2} /></button>
                        <button className={styles.actionBtn} data-tooltip="Abandon" onClick={(e) => { e.stopPropagation(); postMessage({ command: 'abandon', sequenceNumber: m.sequenceNumber }); }}><IconRotate size={14} stroke={2} /></button>
                        <button className={styles.actionBtn} data-tooltip="Defer" onClick={(e) => { e.stopPropagation(); postMessage({ command: 'defer', sequenceNumber: m.sequenceNumber }); }}><IconPlayerPause size={14} stroke={2} /></button>
                        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} data-tooltip="Dead-letter" onClick={(e) => { e.stopPropagation(); setDlqReasonOpen(m); setDlqReason({ reason: '', description: '' }); }}><IconSkull size={14} stroke={2} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel (bottom, resizable) */}
        {selected && (
          <div className={styles.detailPanel} style={{ height: panelHeight }}>
            <div className={styles.resizeHandle} onMouseDown={onResizeStart} />
            <div className={styles.detailHeader}>
              <span className={styles.detailTitle}>Message</span>
              <span className={styles.detailSeq}>#{selected.sequenceNumber}</span>
              {selected.messageId && <span style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>· {selected.messageId}</span>}
              <div className={styles.detailHeaderActions}>
                <button className={styles.iconBtn} title="Resend message" onClick={() => { setActionLoading(true); postMessage({ command: 'resend', sequenceNumber: selected.sequenceNumber }); }}><IconRefresh size={15} stroke={1.8} /></button>
                <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Delete message" onClick={() => { setActionLoading(true); postMessage({ command: 'delete', sequenceNumber: selected.sequenceNumber }); }}><IconTrash size={15} stroke={1.8} /></button>
                <button className={styles.iconBtn} onClick={() => setSelected(null)} title="Close"><IconX size={15} stroke={1.8} /></button>
              </div>
            </div>
            <div className={styles.detailContent}>
              {/* Meta column */}
              <div className={styles.metaColumn}>
                <div className={styles.detailSectionLabel}>Properties</div>
                {selected.messageId && <MetaRow label="Message ID" value={selected.messageId} />}
                {selected.subject && <MetaRow label="Subject" value={selected.subject} />}
                {selected.contentType && <MetaRow label="Content Type" value={selected.contentType} />}
                {selected.enqueuedTimeUtc && <MetaRow label="Enqueued" value={selected.enqueuedTimeUtc.toString().slice(0, 19)} />}
                {selected.deliveryCount != null && <MetaRow label="Delivery Count" value={String(selected.deliveryCount)} />}
                {selected.state && <MetaRow label="State" value={selected.state} />}

                {(selected.deadLetterReason || selected.deadLetterErrorDescription) && (
                  <>
                    <div className={styles.detailSectionLabel}>Dead-letter Info</div>
                    <div className={styles.dlqBadge}>
                      {selected.deadLetterReason && <div><strong>Reason:</strong> {selected.deadLetterReason}</div>}
                      {selected.deadLetterErrorDescription && <div><strong>Description:</strong> {selected.deadLetterErrorDescription}</div>}
                      {selected.deadLetterSource && <div><strong>Source:</strong> {selected.deadLetterSource}</div>}
                    </div>
                  </>
                )}
              </div>

              {/* Body editor */}
              <div className={styles.editorColumn}>
                <div className={styles.editorColumnHeader}>
                  <span className={styles.editorColumnHeaderDot} />
                  Body
                  {bodyLanguage !== 'plaintext' && <span style={{ opacity: 0.6, textTransform: 'none' }}>({bodyLanguage})</span>}
                  <button className={styles.copyBtn} title="Copy body to clipboard" onClick={() => { copyToClipboard(bodyText); setCopiedBody(true); setTimeout(() => setCopiedBody(false), 3000); }}>
                    {copiedBody ? <IconCheck size={14} stroke={1.8} /> : <IconCopy size={14} stroke={1.8} />}
                  </button>
                </div>
                <div className={styles.editorWrapper}>
                  <CodeViewer value={bodyText} language={bodyLanguage} />
                </div>
              </div>

              {/* App properties editor */}
              {appPropsText && (
                <div className={styles.editorColumn}>
                  <div className={styles.editorColumnHeader}>
                    <span className={styles.editorColumnHeaderDot} />
                    Application Properties
                    <button className={styles.copyBtn} title="Copy properties to clipboard" onClick={() => { copyToClipboard(appPropsText); setCopiedAppProps(true); setTimeout(() => setCopiedAppProps(false), 3000); }}>
                      {copiedAppProps ? <IconCheck size={14} stroke={1.8} /> : <IconCopy size={14} stroke={1.8} />}
                    </button>
                  </div>
                  <div className={styles.editorWrapper}>
                    <CodeViewer value={appPropsText} language="json" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {actionLoading && (
        <div className={styles.overlay}>
          <div className={styles.spinner} />
        </div>
      )}

      {/* Toast notification */}
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* Dead-letter modal */}
      <Modal isOpen={!!dlqReasonOpen} onClose={() => setDlqReasonOpen(null)} title="Dead-letter message">
        <Input label="Reason" value={dlqReason.reason} onChange={(e) => setDlqReason({ ...dlqReason, reason: e.target.value })} />
        <Input label="Description" value={dlqReason.description} onChange={(e) => setDlqReason({ ...dlqReason, description: e.target.value })} />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Button variant="primary" onClick={() => {
            if (dlqReasonOpen) {
              postMessage({ command: 'deadLetter', sequenceNumber: dlqReasonOpen.sequenceNumber, reason: dlqReason.reason, description: dlqReason.description });
              setDlqReasonOpen(null);
            }
          }}>Dead-letter</Button>
          <Button variant="secondary" onClick={() => setDlqReasonOpen(null)}>Cancel</Button>
        </div>
      </Modal>
    </div>
  );
};

// ── Sub-components ──

const MetaRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className={styles.metaRow}>
    <span className={styles.metaKey}>{label}</span>
    <span className={styles.metaValue}>{value}</span>
  </div>
);

// ── Helpers ──

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {
    // Fallback for environments where clipboard API is unavailable
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  });
}

function tryFormatBody(body: string | undefined, contentType?: string): string {
  if (body == null) return '';
  if (contentType?.includes('json') || body.trim().startsWith('{') || body.trim().startsWith('[')) {
    try { return JSON.stringify(JSON.parse(body), null, 2); } catch { /* fallthrough */ }
  }
  return body;
}
