import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dropdown, Input, Modal, NumberInput, CodeViewer } from '@shared/components';
import { useVSCodeMessaging } from '@shared/hooks/useVSCodeMessaging';
import { IconRefresh, IconTrash, IconX, IconCopy, IconMailboxOff, IconDownload, IconClearAll, IconFileExport, IconArrowBackUp, IconArrowMoveRight, IconCheck, IconRotate, IconPlayerPause, IconSkull } from '@tabler/icons-react';
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

export const App: React.FC = () => {
  const [init, setInit] = useState<{ source: any; isDLQ: boolean; peekDefault: number } | null>(null);
  const [mode, setMode] = useState<Mode>('peek');
  const [count, setCount] = useState(50);
  const [items, setItems] = useState<Msg[]>([]);
  const [selected, setSelected] = useState<Msg | null>(null);
  const [selectedSeqs, setSelectedSeqs] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dlqReasonOpen, setDlqReasonOpen] = useState<Msg | null>(null);
  const [dlqReason, setDlqReason] = useState({ reason: '', description: '' });
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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

  const filtered = useMemo(() => items.filter((m) =>
    !filter || (m.messageId ?? '').includes(filter) || (m.subject ?? '').includes(filter) || (m.body ?? '').includes(filter)
  ), [items, filter]);

  const fetchMessages = () => {
    setError(null);
    setLoading(true);
    if (mode === 'peek') postMessage({ command: 'peek', count });
    if (mode === 'peekLock') postMessage({ command: 'receivePeekLock', count });
    if (mode === 'receiveAndDelete') postMessage({ command: 'receiveAndDelete', count });
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

  if (!init) return <div className={styles.emptyState}>Loading…</div>;

  const isPeekLock = mode === 'peekLock';

  return (
    <div className={styles.viewer}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <div style={{ minWidth: 210 }}>
            <Dropdown options={MODE_OPTIONS} value={mode} onChange={(v) => setMode(v as Mode)} label="Mode" />
          </div>
          <NumberInput label="Count" value={String(count)} onChange={(e) => setCount(Number(e.target.value) || 1)} style={{ width: 150 }} />
          <Input label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="search…" style={{ width: 160 }} />
        </div>
        <div className={styles.toolbarGroup}>
          <button className={`${styles.toolBtn} ${styles.toolBtnPrimary}`} onClick={fetchMessages} disabled={loading} title="Fetch messages">
            <IconDownload size={16} stroke={1.8} />{loading ? 'Fetching…' : 'Fetch'}
          </button>
          <button className={styles.toolBtn} onClick={() => { setItems([]); setSelected(null); }} title="Clear list">
            <IconClearAll size={16} stroke={1.8} />Clear
          </button>
          <button className={styles.toolBtn} onClick={() => postMessage({ command: 'export', items })} title="Export to JSON">
            <IconFileExport size={16} stroke={1.8} />Export
          </button>
        </div>
        {init.isDLQ && (
          <div className={styles.toolbarGroup}>
            <button className={`${styles.toolBtn} ${styles.toolBtnPrimary}`} onClick={() => { setActionLoading(true); postMessage({ command: 'resubmit', sequenceNumbers: Array.from(selectedSeqs), count }); }} title="Resubmit messages">
              <IconArrowBackUp size={16} stroke={1.8} />Resubmit
            </button>
            <button className={styles.toolBtn} onClick={() => postMessage({ command: 'pickMoveTarget' })} title="Move to another queue or topic">
              <IconArrowMoveRight size={16} stroke={1.8} />Move to…
            </button>
          </div>
        )}
        <div className={styles.toolbarSpacer} />
        <div className={styles.toolbarStats}>
          <span className={styles.statBadge}>{filtered.length} messages</span>
          {selectedSeqs.size > 0 && <span>{selectedSeqs.size} selected</span>}
        </div>
      </div>

      {/* Error bar */}
      {error && <div className={styles.errorBar}>{error}</div>}

      {/* Main area: table on top, detail on bottom */}
      <div className={styles.mainArea}>
        {/* Table */}
        <div className={styles.tablePanel}>
          {filtered.length === 0 ? (
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
                      onChange={(e) => setSelectedSeqs(e.target.checked ? new Set(filtered.map(m => m.sequenceNumber)) : new Set())} />
                  </th>
                  <th className={styles.th}>Seq</th>
                  <th className={styles.th}>MessageId</th>
                  <th className={styles.th}>Subject</th>
                  <th className={styles.th}>Enqueued</th>
                  <th className={styles.th}>DC</th>
                  {isPeekLock && <th className={styles.th}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.sequenceNumber}
                    className={`${styles.tr} ${selected?.sequenceNumber === m.sequenceNumber ? styles.trSelected : ''}`}
                    onClick={() => setSelected(m)}>
                    <td className={styles.td}>
                      <input type="checkbox" className={styles.checkbox}
                        checked={selectedSeqs.has(m.sequenceNumber)}
                        onChange={(e) => {
                          e.stopPropagation();
                          const next = new Set(selectedSeqs);
                          if (e.target.checked) next.add(m.sequenceNumber); else next.delete(m.sequenceNumber);
                          setSelectedSeqs(next);
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
                  <button className={styles.copyBtn} title="Copy body to clipboard" onClick={() => copyToClipboard(bodyText)}><IconCopy size={14} stroke={1.8} /></button>
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
                    <button className={styles.copyBtn} title="Copy properties to clipboard" onClick={() => copyToClipboard(appPropsText)}><IconCopy size={14} stroke={1.8} /></button>
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
