import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Button, Input, Switch, Dropdown, CopyButton, DurationInput, NumberInput, Modal, LoadingOverlay } from '@shared/components';
import { useVSCodeMessaging } from '@shared/hooks/useVSCodeMessaging';
import { IconEye, IconTrash, IconSend, IconArrowForwardUp } from '@tabler/icons-react';
import styles from './EntityEditor.module.css';

// ── Types ──

interface InitData {
  mode: 'create' | 'edit' | 'view';
  kind: 'queue' | 'topic' | 'subscription' | 'rule';
  name?: string;
  namespace?: string;
  topicName?: string;
  subscriptionName?: string;
  properties?: any;
  runtime?: any;
}

// ── Constants ──

const STATUS_OPTIONS = [
  { value: 'Active', label: 'Active' },
  { value: 'Disabled', label: 'Disabled' },
  { value: 'SendDisabled', label: 'SendDisabled' },
  { value: 'ReceiveDisabled', label: 'ReceiveDisabled' },
];

// ── App ──

export const App: React.FC = () => {
  const [init, setInit] = useState<InitData | null>(null);
  const [name, setName] = useState('');
  const [props, setProps] = useState<any>({});
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const { postMessage, subscribe } = useVSCodeMessaging<any, any>();

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.command === 'init') {
        const data = msg.data as InitData;
        setInit(data);
        setName(data.name ?? '');
        setProps(data.properties ?? defaultsFor(data.kind));
      } else if (msg.command === 'error') {
        setError(msg.error);
        setSaveState('error');
      } else if (msg.command === 'saved') {
        setSaveState('saved');
        setDirty(false);
        setTimeout(() => setSaveState('idle'), 3000);
      } else if (msg.command === 'purgeDone') {
        setPurging(false);
        if (msg.runtime) {
          setInit((prev) => prev ? { ...prev, runtime: msg.runtime } : prev);
        }
      } else if (msg.command === 'purgeCancelled') {
        setPurging(false);
      }
    });
    postMessage({ command: 'webviewReady' });
    return unsub;
  }, [postMessage, subscribe]);

  const setP = useCallback((key: string, value: any) => {
    setProps((prev: any) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaveState('idle');
  }, []);

  const onSave = useCallback(() => {
    setError(null);
    if (!init) return;
    if (init.mode === 'create') {
      if (init.kind === 'rule') {
        postMessage({ command: 'save', payload: { name, filter: props.filter ?? { sqlExpression: props.sqlExpression || '1=1' }, action: props.sqlAction ? { sqlExpression: props.sqlAction } : undefined } });
      } else {
        postMessage({ command: 'save', payload: { name, options: stripImmutable(props) } });
      }
    } else {
      const merged = { ...props, name: init.name, topicName: init.topicName, subscriptionName: init.subscriptionName };
      postMessage({ command: 'save', payload: { properties: merged } });
    }
  }, [init, name, props, postMessage]);

  const onDiscard = useCallback(() => {
    if (!init) return;
    setProps(init.properties ?? defaultsFor(init.kind));
    setDirty(false);
    setSaveState('idle');
    setError(null);
  }, [init]);

  if (!init) return <div className={styles.centered}>Loading…</div>;

  // Create mode — simpler form
  if (init.mode === 'create') {
    return (
      <CreateForm
        init={init}
        name={name}
        setName={setName}
        props={props}
        setP={setP}
        onSave={onSave}
        onCancel={() => postMessage({ command: 'cancel' })}
        error={error}
      />
    );
  }

  // View/Edit mode — full dashboard
  return (
    <div className={styles.editor}>
      {purging && <LoadingOverlay message="Purging messages…" />}
      <div className={styles.content}>
        <EntityHeader init={init} props={props} />
        {init.runtime && <StatsRow runtime={init.runtime} kind={init.kind} postMessage={postMessage} setPurging={setPurging} />}
        {init.kind === 'queue' && <QueueEditor props={props} setP={setP} readonly={init.mode === 'view'} />}
        {init.kind === 'topic' && <TopicEditor props={props} setP={setP} readonly={init.mode === 'view'} />}
        {init.kind === 'subscription' && <SubscriptionEditor props={props} setP={setP} readonly={init.mode === 'view'} />}
        {init.kind === 'rule' && <RuleEditor props={props} setP={setP} readonly={init.mode === 'view'} />}
        {init.runtime && <JsonViewer data={init.runtime} title="Runtime — raw response" />}
      </div>
      {init.mode === 'edit' && (
        <SaveBar dirty={dirty} saveState={saveState} error={error} onSave={onSave} onDiscard={onDiscard} />
      )}
    </div>
  );
};

// ── Tooltip ──

const Tooltip: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className={styles.tooltipWrap}>
    {children}
    <div className={styles.tooltip}>{label}</div>
  </div>
);

// ── Entity Header ──

const EntityHeader: React.FC<{ init: InitData; props: any }> = ({ init, props }) => {
  const status = props.status ?? 'Active';
  const isActive = status === 'Active';
  return (
    <div className={styles.entityHeader}>
      <div className={styles.entityIcon}>
        <EntitySvgIcon kind={init.kind} />
      </div>
      <div>
        <div className={styles.entityName}>{init.name}</div>
        <div className={styles.entityMeta}>
          {init.kind.charAt(0).toUpperCase() + init.kind.slice(1)}
          {init.namespace && <>&nbsp;·&nbsp;{init.namespace}</>}
          {init.topicName && init.kind !== 'topic' && <>&nbsp;·&nbsp;{init.topicName}</>}
        </div>
      </div>
      <div className={styles.entityActions}>
        <span className={`${styles.badgeStatus} ${isActive ? styles.badgeActive : styles.badgeDisabled}`}>
          <span className={styles.badgeDot} />
          {status}
        </span>
      </div>
    </div>
  );
};

// ── Stats Row ──

const StatsRow: React.FC<{ runtime: any; kind: string; postMessage: (msg: any) => void; setPurging: (v: boolean) => void }> = ({ runtime, kind, postMessage, setPurging }) => {
  const [purgeTarget, setPurgeTarget] = useState<'active' | 'deadLetter' | 'scheduled' | null>(null);

  const cards = useMemo(() => {
    if (kind === 'topic') {
      return [
        { label: 'Subscriptions', value: runtime.subscriptionCount ?? 0, sub: 'active', highlighted: true },
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

// ── Queue Editor ──

const QueueEditor: React.FC<{ props: any; setP: (k: string, v: any) => void; readonly: boolean }> = ({ props, setP, readonly }) => (
  <>
    <div className={styles.twoCol}>
      <Panel title="Timing & Delivery" dotColor="var(--vscode-button-background)">
        <DurationInput label="Lock duration" value={props.lockDuration ?? ''} onChange={(v) => setP('lockDuration', v)} disabled={readonly} />
        <DurationInput label="Default message TTL" value={props.defaultMessageTimeToLive ?? ''} onChange={(v) => setP('defaultMessageTimeToLive', v)} disabled={readonly} />
        <DurationInput label="Auto delete on idle" value={props.autoDeleteOnIdle ?? ''} onChange={(v) => setP('autoDeleteOnIdle', v)} disabled={readonly} />
        <DurationInput label="Duplicate detection history time window" value={props.duplicateDetectionHistoryTimeWindow ?? ''} onChange={(v) => setP('duplicateDetectionHistoryTimeWindow', v)} disabled={readonly} />
      </Panel>
      <Panel title="Storage" dotColor="#4ec9a0">
        <NumberInput label="Max delivery count" value={String(props.maxDeliveryCount ?? '')} onChange={(e) => setP('maxDeliveryCount', Number(e.target.value))} disabled={readonly}
          helperText="After this many attempts the message moves to dead-letter" />
        <NumberInput label="Max size (MB)" value={String(props.maxSizeInMegabytes ?? '')} onChange={(e) => setP('maxSizeInMegabytes', Number(e.target.value))} disabled={readonly} />
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>Status</label>
          <Dropdown options={STATUS_OPTIONS} value={props.status ?? 'Active'} onChange={(v) => setP('status', v)} disabled={readonly} />
        </div>
      </Panel>
    </div>
    <Panel title="Routing" dotColor="#569cd6">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Input label="Forward to" value={props.forwardTo ?? ''} onChange={(e) => setP('forwardTo', e.target.value || undefined)} disabled={readonly} placeholder="queue or topic name…" />
        <Input label="Forward dead-letter to" value={props.forwardDeadLetteredMessagesTo ?? ''} onChange={(e) => setP('forwardDeadLetteredMessagesTo', e.target.value || undefined)} disabled={readonly} placeholder="queue or topic name…" />
      </div>
    </Panel>
    <FeatureToggles readonly={readonly} features={[
      { key: 'requiresSession', label: 'Requires session', desc: 'Messages must include a SessionId — enables FIFO ordering', checked: !!props.requiresSession, immutable: true },
      { key: 'requiresDuplicateDetection', label: 'Requires duplicate detection', desc: 'Discards messages with duplicate MessageId within the window', checked: !!props.requiresDuplicateDetection, immutable: true },
      { key: 'enablePartitioning', label: 'Enable partitioning', desc: 'Distributes the queue across multiple brokers for higher throughput', checked: !!props.enablePartitioning, immutable: true },
      { key: 'deadLetteringOnMessageExpiration', label: 'Dead-letter on message expiration', desc: 'Expired messages are moved to the dead-letter sub-queue', checked: !!props.deadLetteringOnMessageExpiration },
      { key: 'enableBatchedOperations', label: 'Enable batched operations', desc: 'Improves throughput by batching store operations', checked: props.enableBatchedOperations !== false },
    ]} setP={setP} />
  </>
);

// ── Topic Editor ──

const TopicEditor: React.FC<{ props: any; setP: (k: string, v: any) => void; readonly: boolean }> = ({ props, setP, readonly }) => (
  <>
    <div className={styles.twoCol}>
      <Panel title="Messaging" dotColor="var(--vscode-button-background)">
        <DurationInput label="Default message TTL" value={props.defaultMessageTimeToLive ?? ''} onChange={(v) => setP('defaultMessageTimeToLive', v)} disabled={readonly} />
        <NumberInput label="Max size (MB)" value={String(props.maxSizeInMegabytes ?? '')} onChange={(e) => setP('maxSizeInMegabytes', Number(e.target.value))} disabled={readonly} />
      </Panel>
      <Panel title="Configuration" dotColor="#4ec9a0">
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>Status</label>
          <Dropdown options={STATUS_OPTIONS} value={props.status ?? 'Active'} onChange={(v) => setP('status', v)} disabled={readonly} />
        </div>
      </Panel>
    </div>
    <FeatureToggles readonly={readonly} features={[
      { key: 'requiresDuplicateDetection', label: 'Requires duplicate detection', desc: 'Discards messages with duplicate MessageId', checked: !!props.requiresDuplicateDetection, immutable: true },
      { key: 'enablePartitioning', label: 'Enable partitioning', desc: 'Distributes the topic across multiple brokers', checked: !!props.enablePartitioning, immutable: true },
      { key: 'supportOrdering', label: 'Support ordering', desc: 'Maintains message ordering within a session', checked: !!props.supportOrdering },
      { key: 'enableBatchedOperations', label: 'Enable batched operations', desc: 'Improves throughput by batching store operations', checked: props.enableBatchedOperations !== false },
    ]} setP={setP} />
  </>
);

// ── Subscription Editor ──

const SubscriptionEditor: React.FC<{ props: any; setP: (k: string, v: any) => void; readonly: boolean }> = ({ props, setP, readonly }) => (
  <>
    <div className={styles.twoCol}>
      <Panel title="Timing & Delivery" dotColor="var(--vscode-button-background)">
        <DurationInput label="Lock duration" value={props.lockDuration ?? ''} onChange={(v) => setP('lockDuration', v)} disabled={readonly} />
        <DurationInput label="Default message TTL" value={props.defaultMessageTimeToLive ?? ''} onChange={(v) => setP('defaultMessageTimeToLive', v)} disabled={readonly} />
        <NumberInput label="Max delivery count" value={String(props.maxDeliveryCount ?? '')} onChange={(e) => setP('maxDeliveryCount', Number(e.target.value))} disabled={readonly}
          helperText="After this many attempts the message moves to dead-letter" />
      </Panel>
      <Panel title="Routing" dotColor="#4ec9a0">
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>Status</label>
          <Dropdown options={STATUS_OPTIONS} value={props.status ?? 'Active'} onChange={(v) => setP('status', v)} disabled={readonly} />
        </div>
        <Input label="Forward to" value={props.forwardTo ?? ''} onChange={(e) => setP('forwardTo', e.target.value || undefined)} disabled={readonly} placeholder="queue or topic name…" />
        <Input label="Forward dead-letter to" value={props.forwardDeadLetteredMessagesTo ?? ''} onChange={(e) => setP('forwardDeadLetteredMessagesTo', e.target.value || undefined)} disabled={readonly} placeholder="queue or topic name…" />
      </Panel>
    </div>
    <FeatureToggles readonly={readonly} features={[
      { key: 'requiresSession', label: 'Requires session', desc: 'Messages must include a SessionId — enables FIFO ordering', checked: !!props.requiresSession, immutable: true },
      { key: 'deadLetteringOnMessageExpiration', label: 'Dead-letter on message expiration', desc: 'Expired messages are moved to the dead-letter sub-queue', checked: !!props.deadLetteringOnMessageExpiration },
      { key: 'deadLetteringOnFilterEvaluationExceptions', label: 'Dead-letter on filter exceptions', desc: 'Messages causing filter evaluation errors go to dead-letter', checked: !!props.deadLetteringOnFilterEvaluationExceptions },
    ]} setP={setP} />
  </>
);

// ── Rule Editor ──

const RuleEditor: React.FC<{ props: any; setP: (k: string, v: any) => void; readonly: boolean }> = ({ props, setP, readonly }) => {
  const filterType = props.filter?.kind === 'correlation' ? 'correlation' : 'sql';
  return (
    <Panel title="Filter & Action" dotColor="var(--vscode-button-background)">
      <div>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>Filter type</label>
        <Dropdown
          options={[{ value: 'sql', label: 'SQL Filter' }, { value: 'correlation', label: 'Correlation Filter' }]}
          value={filterType}
          onChange={(v) => setP('filter', v === 'sql' ? { sqlExpression: '1=1' } : { kind: 'correlation' })}
          disabled={readonly}
        />
      </div>
      {filterType === 'sql' ? (
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>SQL expression</label>
          <textarea
            style={{ width: '100%', minHeight: 80, fontFamily: 'var(--vscode-editor-font-family, monospace)', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', borderRadius: 4, padding: 8, fontSize: 12, resize: 'vertical' }}
            value={props.filter?.sqlExpression ?? '1=1'}
            onChange={(e) => setP('filter', { sqlExpression: e.target.value })}
            disabled={readonly}
          />
        </div>
      ) : (
        <>
          {['correlationId', 'messageId', 'to', 'replyTo', 'subject', 'sessionId', 'replyToSessionId', 'contentType'].map((k) => (
            <Input key={k} label={k} value={props.filter?.[k] ?? ''} onChange={(e) => setP('filter', { ...props.filter, kind: 'correlation', [k]: e.target.value || undefined })} disabled={readonly} />
          ))}
        </>
      )}
      <Input label="SQL Action (optional)" value={props.action?.sqlExpression ?? ''} onChange={(e) => setP('action', e.target.value ? { sqlExpression: e.target.value } : undefined)} disabled={readonly} />
    </Panel>
  );
};

// ── Panel Section ──

const Panel: React.FC<{ title: string; dotColor?: string; children: React.ReactNode }> = ({ title, dotColor, children }) => (
  <div className={styles.panel}>
    <div className={styles.panelHeader}>
      <div className={styles.panelHeaderDot} style={dotColor ? { background: dotColor } : undefined} />
      {title}
    </div>
    <div className={styles.panelBody}>{children}</div>
  </div>
);

// ── Feature Toggles ──

interface FeatureToggle {
  key: string;
  label: string;
  desc: string;
  checked: boolean;
  /** Cannot be changed after creation */
  immutable?: boolean;
}

const FeatureToggles: React.FC<{ features: FeatureToggle[]; setP: (k: string, v: any) => void; readonly: boolean }> = ({ features, setP, readonly }) => (
  <div className={styles.panel}>
    <div className={styles.panelHeader}>
      <div className={styles.panelHeaderDot} style={{ background: '#cca700' }} />
      Features
    </div>
    <div className={styles.panelBody} style={{ paddingTop: 6, paddingBottom: 6 }}>
      <div className={styles.togglesList}>
        {features.map((f) => {
          const locked = readonly || !!f.immutable;
          return (
            <div key={f.key} className={`${styles.toggleRow} ${locked ? styles.toggleDisabled : ''}`}
              title={f.immutable ? 'This property can only be set when creating the entity' : undefined}>
              <div className={styles.toggleInfo}>
                <div className={styles.toggleName}>
                  {f.label}
                  {f.immutable && <span className={styles.lockIcon} title="Set at creation only">🔒</span>}
                </div>
                <div className={styles.toggleDesc}>
                  {f.desc}
                  {f.immutable && <span className={styles.immutableHint}> — cannot be changed after creation</span>}
                </div>
              </div>
              <Switch checked={f.checked} onChange={(v) => setP(f.key, v)} disabled={locked} />
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

// ── JSON Viewer ──

const JsonViewer: React.FC<{ data: any; title: string }> = ({ data, title }) => {
  const jsonStr = useMemo(() => JSON.stringify(data, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2), [data]);
  const highlighted = useMemo(() => colorizeJson(jsonStr), [jsonStr]);

  return (
    <div className={styles.jsonPanel}>
      <div className={styles.jsonHeader}>
        <div className={styles.panelHeaderDot} style={{ background: '#ce9178' }} />
        <span className={styles.jsonHeaderTitle}>{title}</span>
        <div style={{ marginLeft: 'auto' }}>
          <CopyButton getText={() => jsonStr} title="Copy JSON" />
        </div>
      </div>
      <div className={styles.jsonBody} dangerouslySetInnerHTML={{ __html: highlighted }} />
    </div>
  );
};

// ── Save Bar ──

const SaveBar: React.FC<{ dirty: boolean; saveState: string; error: string | null; onSave: () => void; onDiscard: () => void }> = ({ dirty, saveState, error, onSave, onDiscard }) => {
  let msgClass = styles.saveMsg;
  let msgText = 'No unsaved changes';
  if (dirty) {
    msgClass = `${styles.saveMsg} ${styles.saveMsgDirty}`;
    msgText = 'You have unsaved changes';
  } else if (saveState === 'saved') {
    msgClass = `${styles.saveMsg} ${styles.saveMsgSaved}`;
    msgText = '✓  Changes saved successfully';
  } else if (saveState === 'error') {
    msgClass = `${styles.saveMsg} ${styles.saveMsgError}`;
    msgText = error || 'Save failed';
  }

  return (
    <div className={styles.saveBar}>
      <span className={msgClass}>{msgText}</span>
      <Button variant="secondary" onClick={onDiscard} disabled={!dirty}>Discard</Button>
      <Button variant="primary" onClick={onSave} disabled={!dirty}>Save changes</Button>
    </div>
  );
};

// ── Create Form ──

const CreateForm: React.FC<{
  init: InitData;
  name: string;
  setName: (n: string) => void;
  props: any;
  setP: (k: string, v: any) => void;
  onSave: () => void;
  onCancel: () => void;
  error: string | null;
}> = ({ init, name, setName, props, setP, onSave, onCancel, error }) => {
  const kindLabel = init.kind.charAt(0).toUpperCase() + init.kind.slice(1);
  return (
    <div className={styles.createForm}>
      <div className={styles.createTitle}>Create {kindLabel}</div>
      {error && <div style={{ color: 'var(--vscode-errorForeground)', fontSize: 12 }}>{error}</div>}
      <Input label={`${kindLabel} name`} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      {init.kind === 'queue' && <QueueCreateFields props={props} setP={setP} />}
      {init.kind === 'topic' && <TopicCreateFields props={props} setP={setP} />}
      {init.kind === 'subscription' && <SubscriptionCreateFields props={props} setP={setP} />}
      {init.kind === 'rule' && <RuleEditor props={props} setP={setP} readonly={false} />}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Button variant="primary" onClick={onSave}>Create</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
};

// Simplified create fields (just the essential settings)
const QueueCreateFields: React.FC<{ props: any; setP: (k: string, v: any) => void }> = ({ props, setP }) => (
  <>
    <DurationInput label="Lock duration" value={props.lockDuration ?? 'PT30S'} onChange={(v) => setP('lockDuration', v)} />
    <DurationInput label="Default message TTL" value={props.defaultMessageTimeToLive ?? 'P14D'} onChange={(v) => setP('defaultMessageTimeToLive', v)} />
    <NumberInput label="Max delivery count" value={String(props.maxDeliveryCount ?? 10)} onChange={(e) => setP('maxDeliveryCount', Number(e.target.value))} />
    <Switch label="Requires session" checked={!!props.requiresSession} onChange={(v) => setP('requiresSession', v)} />
    <Switch label="Requires duplicate detection" checked={!!props.requiresDuplicateDetection} onChange={(v) => setP('requiresDuplicateDetection', v)} />
    <Switch label="Enable partitioning" checked={!!props.enablePartitioning} onChange={(v) => setP('enablePartitioning', v)} />
  </>
);

const TopicCreateFields: React.FC<{ props: any; setP: (k: string, v: any) => void }> = ({ props, setP }) => (
  <>
    <DurationInput label="Default message TTL" value={props.defaultMessageTimeToLive ?? 'P14D'} onChange={(v) => setP('defaultMessageTimeToLive', v)} />
    <NumberInput label="Max size (MB)" value={String(props.maxSizeInMegabytes ?? 1024)} onChange={(e) => setP('maxSizeInMegabytes', Number(e.target.value))} />
    <Switch label="Requires duplicate detection" checked={!!props.requiresDuplicateDetection} onChange={(v) => setP('requiresDuplicateDetection', v)} />
    <Switch label="Enable partitioning" checked={!!props.enablePartitioning} onChange={(v) => setP('enablePartitioning', v)} />
  </>
);

const SubscriptionCreateFields: React.FC<{ props: any; setP: (k: string, v: any) => void }> = ({ props, setP }) => (
  <>
    <DurationInput label="Lock duration" value={props.lockDuration ?? 'PT30S'} onChange={(v) => setP('lockDuration', v)} />
    <DurationInput label="Default message TTL" value={props.defaultMessageTimeToLive ?? 'P14D'} onChange={(v) => setP('defaultMessageTimeToLive', v)} />
    <NumberInput label="Max delivery count" value={String(props.maxDeliveryCount ?? 10)} onChange={(e) => setP('maxDeliveryCount', Number(e.target.value))} />
    <Switch label="Requires session" checked={!!props.requiresSession} onChange={(v) => setP('requiresSession', v)} />
  </>
);

// ── SVG Icons ──

const EntitySvgIcon: React.FC<{ kind: string }> = ({ kind }) => {
  if (kind === 'queue' || kind === 'subscription') {
    // Azure Service Bus Queue SVG (same as tree icon)
    return (
      <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" viewBox="0 0 81 82" fillRule="evenodd" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.333 0C.533 0 0 .533 0 1.333v16c0 .8.533 1.333 1.333 1.333h8c.8 0 1.333-.533 1.333-1.333v-6.666h58.667v6.667c0 .8.533 1.333 1.6 1.333h7.733c.8 0 1.333-.533 1.333-1.333v-8-8C80 .533 79.467 0 78.667 0H1.333zm77.334 80c.8 0 1.333-.533 1.333-1.333V62.934c0-.8-.533-1.333-1.333-1.333h-7.733c-.8 0-1.333.533-1.333 1.333v6.4H10.667v-6.667c0-.8-.533-1.333-1.6-1.333H1.333c-.8 0-1.333.533-1.333 1.6v15.733C0 79.467.533 80 1.333 80h77.334z" fill="#0072c6" stroke="none"/>
        <path d="M19.718 41.138c-1.344 1.344-3.133 2.085-5.035 2.085s-3.69-.741-5.035-2.085L0 31.49v19.613h29.366V31.49l-9.648 9.648zm-5.035.652a5.65 5.65 0 0 0 4.022-1.666l10.661-10.661v-.565H0v.566l10.661 10.661a5.65 5.65 0 0 0 4.022 1.664zm55.669-.652c-1.344 1.344-3.133 2.085-5.035 2.085s-3.69-.741-5.035-2.085l-9.648-9.648v19.613H80V31.49l-9.648 9.648zm-5.035.652a5.65 5.65 0 0 0 4.022-1.666L80 29.464v-.565H50.634v.566l10.661 10.661a5.65 5.65 0 0 0 4.022 1.664z" stroke="none" fill="#59b4d9"/>
        <path d="M41.301 38.047h4.934v3.894h-4.934zm-7.634 0h5.219v3.894h-5.219z" stroke="none" fill="#b8d432"/>
      </svg>
    );
  }
  if (kind === 'topic') {
    // Azure Service Bus Topic SVG (same as tree icon)
    return (
      <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" viewBox="0 0 81 82" fillRule="evenodd" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.333 0C.533 0 0 .533 0 1.333v16c0 .8.533 1.333 1.333 1.333h8c.8 0 1.333-.533 1.333-1.333v-6.666h58.667v6.667c0 .8.533 1.333 1.6 1.333h7.733c.8 0 1.333-.533 1.333-1.333v-8-8C80 .533 79.467 0 78.667 0H1.333zm77.334 80c.8 0 1.333-.533 1.333-1.333V62.934c0-.8-.533-1.333-1.333-1.333h-7.733c-.8 0-1.333.533-1.333 1.333v6.4H10.667v-6.667c0-.8-.533-1.333-1.6-1.333H1.333c-.8 0-1.333.533-1.333 1.6v15.733C0 79.467.533 80 1.333 80h77.334z" fill="#0072c6" stroke="none"/>
        <path d="M29.519 36.447l3.452-3.452 2.556 2.556-3.452 3.451zm5.007-5.008l3.456-3.456 2.56 2.56L37.086 34zm7.57-2.463l-2.56-2.544 3.424-3.424 2.56 2.544zM39.535 52.5l2.561-2.56 3.424 3.426-2.561 2.56zm-1.551-1.572l-3.456-3.456 2.56-2.544 3.456 3.456zm-5.008-5.008l-3.456-3.456 2.56-2.544 3.44 3.44z" stroke="none" fill="#b8d432"/>
        <path d="M57.81 24.395a4.44 4.44 0 0 1-3.158 1.309 4.43 4.43 0 0 1-3.158-1.309l-6.053-6.053v12.306h18.424V18.342l-6.054 6.053zm-3.161.409a3.54 3.54 0 0 0 2.523-1.045l6.69-6.69v-.355H45.438v.355l6.69 6.69a3.54 3.54 0 0 0 2.522 1.045zm3.161 31.15a4.44 4.44 0 0 1-3.158 1.309 4.43 4.43 0 0 1-3.158-1.309l-6.053-6.053v12.306h18.424V49.901l-6.054 6.053zm-3.161.41a3.54 3.54 0 0 0 2.523-1.045l6.69-6.689v-.355H45.438v.355l6.69 6.689a3.54 3.54 0 0 0 2.522 1.045zM19.718 40.599c-1.344 1.344-3.133 2.085-5.035 2.085s-3.69-.741-5.035-2.085L0 30.949v19.613h29.366V30.949l-9.648 9.65zm-5.035.652a5.65 5.65 0 0 0 4.022-1.666l10.661-10.661v-.565H0v.566l10.661 10.661a5.66 5.66 0 0 0 4.022 1.664z" stroke="none" fill="#59b4d9"/>
      </svg>
    );
  }
  // rule / subscription fallback
  return (
    <svg viewBox="0 0 20 20" fill="none">
      <path d="M5 10l3 3 7-7" stroke="var(--vscode-button-background)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ── Helpers ──

function defaultsFor(kind: string): any {
  if (kind === 'queue' || kind === 'subscription') {
    return { lockDuration: 'PT30S', defaultMessageTimeToLive: 'P14D', maxDeliveryCount: 10, status: 'Active', enableBatchedOperations: true };
  }
  if (kind === 'topic') {
    return { defaultMessageTimeToLive: 'P14D', maxSizeInMegabytes: 1024, status: 'Active', enableBatchedOperations: true };
  }
  return {};
}

function stripImmutable(props: any): any {
  const { name, topicName, subscriptionName, ...rest } = props;
  return rest;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function colorizeJson(json: string): string {
  return json
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/("[\w]+")\s*:/g, `<span class="${styles.jsonKey}">$1</span>:`)
    .replace(/:\s*(".*?")/g, `: <span class="${styles.jsonString}">$1</span>`)
    .replace(/:\s*(true|false|null)/g, `: <span class="${styles.jsonNumber}">$1</span>`)
    .replace(/:\s*(\d+\.?\d*)/g, `: <span class="${styles.jsonNumber}">$1</span>`);
}
