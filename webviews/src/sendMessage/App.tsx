import React, { useEffect, useState } from 'react';
import { Button, Input, Switch, NumberInput } from '@shared/components';
import { useVSCodeMessaging } from '@shared/hooks/useVSCodeMessaging';
import styles from './SendMessage.module.css';

interface InitData { target: { queue?: string; topic?: string }; isTestSender?: boolean; }
interface AppProp { key: string; value: string; type: 'string' | 'number' | 'boolean'; }

export const App: React.FC = () => {
  const [init, setInit] = useState<InitData | null>(null);
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
  const { postMessage, subscribe } = useVSCodeMessaging<any, any>();

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.command === 'init') setInit(msg.data);
      else if (msg.command === 'sendResult') setResult(`Sent ${msg.count} message(s) successfully.`);
      else if (msg.command === 'error') setError(msg.error);
    });
    postMessage({ command: 'webviewReady' });
    return unsub;
  }, [postMessage, subscribe]);

  if (!init) return <div className={styles.content} style={{ paddingTop: 40, textAlign: 'center' }}>Loading…</div>;

  const send = () => {
    setError(null); setResult(null);
    let payload: any = {
      contentType, subject: subject || undefined, messageId: messageId || undefined,
      correlationId: correlationId || undefined, sessionId: sessionId || undefined,
      partitionKey: partitionKey || undefined,
      scheduledEnqueueTimeUtc: scheduledFor || undefined,
      applicationProperties: appProps.length ? Object.fromEntries(appProps.map(p => [p.key, coerce(p.value, p.type)])) : undefined,
    };
    if (batchMode) {
      try {
        payload.batch = JSON.parse(batchJson);
      } catch (e) { return setError('Batch JSON invalid: ' + (e as Error).message); }
    } else {
      payload.body = body;
      payload.repeat = repeat;
    }
    postMessage({ command: 'send', payload });
  };

  const targetName = init.target.queue ?? init.target.topic;
  const isTopic = !!init.target.topic;

  return (
    <div className={styles.sender}>
      <div className={styles.content}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerIcon}>{isTopic ? '📢' : '📨'}</div>
          <div className={styles.headerText}>
            <h2>Send Message</h2>
            <div className={styles.headerSub}>
              {isTopic ? 'Topic' : 'Queue'}: <span className={styles.targetBadge}>{targetName}</span>
            </div>
          </div>
        </div>

        {/* Feedback */}
        {error && <div className={`${styles.feedback} ${styles.feedbackError}`}>⚠ {error}</div>}
        {result && <div className={`${styles.feedback} ${styles.feedbackSuccess}`}>✓ {result}</div>}

        {/* Mode toggle */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelHeaderDot} />
            Mode
          </div>
          <div className={styles.panelBody}>
            <Switch label="Batch mode (JSON array)" checked={batchMode} onChange={setBatchMode} />
          </div>
        </div>

        {/* Body panel */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelHeaderDot} />
            {batchMode ? 'Batch Payload' : 'Message Body'}
          </div>
          <div className={styles.panelBody}>
            {!batchMode ? (
              <>
                <textarea
                  className={styles.textarea}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Enter message body…"
                />
                <div style={{ marginTop: 10 }}>
                  <NumberInput label="Repeat count (use {{i}}, {{guid}}, {{now}} placeholders)"
                    value={String(repeat)} onChange={(e) => setRepeat(Math.max(1, Number(e.target.value)))} />
                </div>
              </>
            ) : (
              <textarea
                className={`${styles.textarea} ${styles.textareaLarge}`}
                value={batchJson}
                onChange={(e) => setBatchJson(e.target.value)}
                placeholder='[{ "body": "..." }, ...]'
              />
            )}
          </div>
        </div>

        {/* Properties panel */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelHeaderDot} />
            Message Properties
          </div>
          <div className={styles.panelBody}>
            <div className={styles.formGrid}>
              <Input label="Content type" value={contentType} onChange={(e) => setContentType(e.target.value)} />
              <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <Input label="Message ID" value={messageId} onChange={(e) => setMessageId(e.target.value)} />
              <Input label="Correlation ID" value={correlationId} onChange={(e) => setCorrelationId(e.target.value)} />
              <Input label="Session ID" value={sessionId} onChange={(e) => setSessionId(e.target.value)} />
              <Input label="Partition key" value={partitionKey} onChange={(e) => setPartitionKey(e.target.value)} />
              <div className={styles.formGridFull}>
                <Input label="Scheduled enqueue time (ISO, optional)" value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)} placeholder="2026-04-28T12:00:00Z" />
              </div>
            </div>
          </div>
        </div>

        {/* Application properties panel */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelHeaderDot} />
            Application Properties
          </div>
          <div className={styles.panelBody}>
            {appProps.map((p, i) => (
              <div key={i} className={styles.propRow}>
                <input className={styles.propInput} value={p.key}
                  onChange={(e) => setAppProps(appProps.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}
                  placeholder="key" />
                <input className={styles.propInput} value={p.value}
                  onChange={(e) => setAppProps(appProps.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                  placeholder="value" />
                <select className={styles.propSelect}
                  value={p.type} onChange={(e) => setAppProps(appProps.map((x, j) => j === i ? { ...x, type: e.target.value as any } : x))}>
                  <option>string</option><option>number</option><option>boolean</option>
                </select>
                <Button variant="secondary" onClick={() => setAppProps(appProps.filter((_, j) => j !== i))}>×</Button>
              </div>
            ))}
            <Button variant="secondary" onClick={() => setAppProps([...appProps, { key: '', value: '', type: 'string' }])}>+ Add property</Button>
          </div>
        </div>

        {/* Send bar */}
        <div className={styles.sendBar}>
          <Button variant="primary" onClick={send}>Send Message</Button>
        </div>
      </div>
    </div>
  );
};

function coerce(v: string, t: 'string' | 'number' | 'boolean'): any {
  if (t === 'number') return Number(v);
  if (t === 'boolean') return v.toLowerCase() === 'true';
  return v;
}
