import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button, Input, Switch, NumberInput, CodeEditor, Dropdown } from '@shared/components';
import { useVSCodeMessaging } from '@shared/hooks/useVSCodeMessaging';
import { IconSend, IconPlus, IconX } from '@tabler/icons-react';
import styles from './SendMessage.module.css';

interface AvailableTarget { name: string; kind: 'queue' | 'topic'; }
interface InitData {
  target: { queue?: string; topic?: string };
  isTestSender?: boolean;
  availableTargets?: AvailableTarget[];
}
interface AppProp { key: string; value: string; type: 'string' | 'number' | 'boolean'; }

const TYPE_OPTIONS = [
  { value: 'string', label: 'string' },
  { value: 'number', label: 'number' },
  { value: 'boolean', label: 'boolean' }
];

export const App: React.FC = () => {
  const [init, setInit] = useState<InitData | null>(null);
  const [target, setTarget] = useState<{ queue?: string; topic?: string }>({});
  const [body, setBody] = useState('Hello from Service Bus Explorer\n');
  const [contentType, setContentType] = useState('application/json');
  const [subject, setSubject] = useState('');
  const [messageId, setMessageId] = useState('');
  const [correlationId, setCorrelationId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [partitionKey, setPartitionKey] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [repeat, setRepeat] = useState(1);
  const [batchMode, setBatchMode] = useState(false);
  const [batchJson, setBatchJson] = useState('[\n  { "body": "msg 1" },\n  { "body": "msg 2" }\n]');
  const [appProps, setAppProps] = useState<AppProp[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [bodyJsonError, setBodyJsonError] = useState<string | null>(null);
  const [batchJsonError, setBatchJsonError] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const isResizing = useRef(false);
  const { postMessage, subscribe } = useVSCodeMessaging<any, any>();

  const isJsonContentType = contentType.trim().toLowerCase() === 'application/json';

  const validateBody = useCallback(() => {
    if (!isJsonContentType || batchMode) { setBodyJsonError(null); return; }
    const trimmed = body.trim();
    if (!trimmed) { setBodyJsonError(null); return; }
    try { JSON.parse(trimmed); setBodyJsonError(null); }
    catch (e) { setBodyJsonError((e as Error).message); }
  }, [body, isJsonContentType, batchMode]);

  const formatBody = useCallback(() => {
    if (!isJsonContentType || batchMode) return;
    try {
      const parsed = JSON.parse(body);
      setBody(JSON.stringify(parsed, null, 2));
      setBodyJsonError(null);
    } catch (e) {
      setBodyJsonError((e as Error).message);
    }
  }, [body, isJsonContentType, batchMode]);

  const validateBatch = useCallback(() => {
    const trimmed = batchJson.trim();
    if (!trimmed) { setBatchJsonError(null); return; }
    try { JSON.parse(trimmed); setBatchJsonError(null); }
    catch (e) { setBatchJsonError((e as Error).message); }
  }, [batchJson]);

  const formatBatch = useCallback(() => {
    try {
      const parsed = JSON.parse(batchJson);
      setBatchJson(JSON.stringify(parsed, null, 2));
      setBatchJsonError(null);
    } catch (e) {
      setBatchJsonError((e as Error).message);
    }
  }, [batchJson]);

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.command === 'init') {
        setInit(msg.data);
        setTarget(msg.data.target);
      } else if (msg.command === 'sendResult') {
        setResult(`Sent ${msg.count} message(s) successfully.`);
      } else if (msg.command === 'error') {
        setError(msg.error);
      }
    });
    postMessage({ command: 'webviewReady' });
    return unsub;
  }, [postMessage, subscribe]);

  // Clear errors when switching modes
  useEffect(() => {
    setBodyJsonError(null);
    setBatchJsonError(null);
    setError(null);
  }, [batchMode]);

  // Resizer handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setSidebarWidth(Math.max(220, Math.min(700, newWidth)));
    };
    const onUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startResize = (e: React.MouseEvent) => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  };

  if (!init) return <div className={styles.loading}>Loading…</div>;

  const isTopic = !!target.topic;
  const targetName = target.queue ?? target.topic ?? '';

  // Build dropdown options from availableTargets, ensuring current target is present
  const targets = init.availableTargets ?? [];
  const currentEntry: AvailableTarget = { name: targetName, kind: isTopic ? 'topic' : 'queue' };
  const hasCurrent = targets.some(t => t.name === currentEntry.name && t.kind === currentEntry.kind);
  const allTargets = hasCurrent ? targets : [currentEntry, ...targets];
  const targetOptions = allTargets.map(t => ({
    value: `${t.kind}:${t.name}`,
    label: t.name,
  }));
  const currentValue = `${currentEntry.kind}:${currentEntry.name}`;

  const handleTargetChange = (value: string) => {
    const [kind, ...rest] = value.split(':');
    const name = rest.join(':');
    const newTarget = kind === 'topic' ? { topic: name } : { queue: name };
    setTarget(newTarget);
    postMessage({ command: 'changeTarget', target: newTarget });
  };

  const send = () => {
    setError(null); setResult(null);
    // Validate JSON body before sending
    if (isJsonContentType && !batchMode && body.trim()) {
      try { JSON.parse(body.trim()); setBodyJsonError(null); }
      catch (e) {
        const msg = (e as Error).message;
        setBodyJsonError(msg);
        setError('Message body is not valid JSON: ' + msg);
        return;
      }
    }
    const payload: any = {
      contentType, subject: subject || undefined, messageId: messageId || undefined,
      correlationId: correlationId || undefined,
      // sessionId/partitionKey only relevant for queues
      sessionId: !isTopic ? (sessionId || undefined) : undefined,
      partitionKey: !isTopic ? (partitionKey || undefined) : undefined,
      scheduledEnqueueTimeUtc: scheduledFor || undefined,
      applicationProperties: appProps.length ? Object.fromEntries(appProps.map(p => [p.key, coerce(p.value, p.type)])) : undefined,
    };
    if (batchMode) {
      try {
        payload.batch = JSON.parse(batchJson);
        setBatchJsonError(null);
      } catch (e) {
        const msg = (e as Error).message;
        setBatchJsonError(msg);
        setError('Batch JSON invalid: ' + msg);
        return;
      }
    } else {
      payload.body = body;
      payload.repeat = repeat;
    }
    postMessage({ command: 'send', payload });
  };

  return (
    <div className={styles.sender}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <span className={styles.topBarIcon} aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10z" />
              <path d="M3 7l9 6l9 -6" />
            </svg>
          </span>
          <h2 className={styles.topBarTitle}>{init.isTestSender ? 'Test Sender' : 'Send messages'}</h2>
          <div className={styles.targetPicker}>
            <Dropdown
              options={targetOptions}
              value={currentValue}
              onChange={handleTargetChange}
              enableSearch={targetOptions.length > 5}
            />
          </div>
        </div>
        <div className={styles.topBarRight}>
          <Switch label="Batch mode" checked={batchMode} onChange={setBatchMode} />
        </div>
      </div>

      {/* Feedback */}
      {error && <div className={`${styles.feedback} ${styles.feedbackError}`}>⚠ {error}</div>}
      {result && <div className={`${styles.feedback} ${styles.feedbackSuccess}`}>✓ {result}</div>}

      {/* Main content: editor + splitter + sidebar */}
      <div className={styles.main}>
        {/* Left: Editor */}
        <div className={styles.editorPane}>
          <div className={styles.editorLabelRow}>
            <span className={styles.editorLabel}>{batchMode ? 'Batch Payload (JSON array)' : 'Message Body'}</span>
            {(isJsonContentType || batchMode) && (
              <button
                className={styles.formatBtn}
                onClick={batchMode ? formatBatch : formatBody}
                type="button"
                title="Format JSON"
              >
                Format
              </button>
            )}
          </div>
          <div className={`${styles.editorWrap} ${(!batchMode && bodyJsonError) || (batchMode && batchJsonError) ? styles.editorWrapError : ''}`}>
            <CodeEditor
              value={batchMode ? batchJson : body}
              onChange={(v) => {
                if (batchMode) {
                  setBatchJson(v);
                  setBatchJsonError(null);
                  setError(null);
                } else {
                  setBody(v);
                  setBodyJsonError(null);
                  setError(null);
                }
              }}
              onBlur={batchMode ? validateBatch : validateBody}
              placeholder={batchMode ? '[{ "body": "..." }, ...]' : 'Enter message body…'}
              language={batchMode ? 'json' : 'auto'}
            />
          </div>
          {bodyJsonError && !batchMode && (
            <div className={styles.jsonError}>⚠ Invalid JSON: {bodyJsonError}</div>
          )}
          {batchJsonError && batchMode && (
            <div className={styles.jsonError}>⚠ Invalid JSON: {batchJsonError}</div>
          )}
        </div>

        {/* Splitter */}
        <div className={styles.splitter} onMouseDown={startResize} role="separator" aria-orientation="vertical" />

        {/* Right: Properties sidebar */}
        <div className={styles.sidebar} style={{ width: sidebarWidth }}>
          {/* Message Properties */}
          <div className={styles.sideSection}>
            <div className={styles.sideSectionTitle}>Message Properties</div>
            <div className={styles.fieldGroup}>
              <Input label="Content type" value={contentType} onChange={(e) => setContentType(e.target.value)} />
              <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <Input label="Message ID" value={messageId} onChange={(e) => setMessageId(e.target.value)} />
              <Input label="Correlation ID" value={correlationId} onChange={(e) => setCorrelationId(e.target.value)} />
              {!isTopic && <Input label="Session ID" value={sessionId} onChange={(e) => setSessionId(e.target.value)} />}
              {!isTopic && <Input label="Partition key" value={partitionKey} onChange={(e) => setPartitionKey(e.target.value)} />}
              <Input label="Scheduled enqueue time (ISO)" value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)} placeholder="2026-04-28T12:00:00Z" />
            </div>
          </div>

          {/* Application Properties */}
          <div className={styles.sideSection}>
            <div className={styles.sideSectionTitle}>Application Properties</div>
            <div className={styles.appProps}>
              {appProps.map((p, i) => (
                <div key={i} className={styles.propRow}>
                  <input className={styles.propInput} value={p.key}
                    onChange={(e) => setAppProps(appProps.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}
                    placeholder="key" />
                  <input className={styles.propInput} value={p.value}
                    onChange={(e) => setAppProps(appProps.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                    placeholder="value" />
                  <div className={styles.propTypeWrap}>
                    <Dropdown
                      options={TYPE_OPTIONS}
                      value={p.type}
                      onChange={(value) => setAppProps(appProps.map((x, j) => j === i ? { ...x, type: value as AppProp['type'] } : x))}
                      size="sm"
                    />
                  </div>
                  <button className={styles.propRemove} onClick={() => setAppProps(appProps.filter((_, j) => j !== i))} title="Remove property">
                    <IconX size={12} />
                  </button>
                </div>
              ))}
              <button className={styles.addPropBtn} onClick={() => setAppProps([...appProps, { key: '', value: '', type: 'string' }])}>
                <IconPlus size={12} /> Add property
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className={styles.bottomBar}>
        {!batchMode && (
          <div className={styles.repeatWrap}>
            <NumberInput label="Repeat" value={String(repeat)} onChange={(e) => setRepeat(Math.max(1, Number(e.target.value)))} />
            <span className={styles.repeatHint}>Use {'{{i}}'}, {'{{guid}}'}, {'{{now}}'} placeholders</span>
          </div>
        )}
        <Button variant="primary" onClick={send}>
          <IconSend size={14} /> Send Message
        </Button>
      </div>
    </div>
  );
};

function coerce(v: string, t: 'string' | 'number' | 'boolean'): any {
  if (t === 'number') return Number(v);
  if (t === 'boolean') return v.toLowerCase() === 'true';
  return v;
}
