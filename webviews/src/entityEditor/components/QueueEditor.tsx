import React, { useMemo } from 'react';
import { Dropdown, DurationInput, NumberInput } from '@shared/components';
import { Panel } from './Panel';
import { FeatureToggles } from './FeatureToggles';
import { STATUS_OPTIONS } from '../types';
import styles from '../EntityEditor.module.css';

export const QueueEditor: React.FC<{ props: any; setP: (k: string, v: any) => void; readonly: boolean; availableTargets?: { name: string; kind: 'queue' | 'topic' }[] }> = ({ props, setP, readonly, availableTargets }) => {
  const forwardOptions = useMemo(() => [
    { value: '', label: '(none)' },
    ...(availableTargets ?? []).map(t => ({ value: t.name, label: t.name }))
  ], [availableTargets]);

  return (
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
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>Forward to</label>
            <Dropdown options={forwardOptions} value={props.forwardTo ?? ''} onChange={(v) => setP('forwardTo', v || undefined)} disabled={readonly} enableSearch={forwardOptions.length > 5} placeholder="queue or topic name…" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>Forward dead-letter to</label>
            <Dropdown options={forwardOptions} value={props.forwardDeadLetteredMessagesTo ?? ''} onChange={(v) => setP('forwardDeadLetteredMessagesTo', v || undefined)} disabled={readonly} enableSearch={forwardOptions.length > 5} placeholder="queue or topic name…" />
          </div>
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
};
