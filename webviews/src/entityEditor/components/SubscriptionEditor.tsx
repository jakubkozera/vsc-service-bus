import React, { useMemo } from 'react';
import { Dropdown, DurationInput, NumberInput } from '@shared/components';
import { Panel } from './Panel';
import { FeatureToggles } from './FeatureToggles';
import { STATUS_OPTIONS } from '../types';
import styles from '../EntityEditor.module.css';

export const SubscriptionEditor: React.FC<{ props: any; setP: (k: string, v: any) => void; readonly: boolean; availableTargets?: { name: string; kind: 'queue' | 'topic' }[] }> = ({ props, setP, readonly, availableTargets }) => {
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
          <NumberInput label="Max delivery count" value={String(props.maxDeliveryCount ?? '')} onChange={(e) => setP('maxDeliveryCount', Number(e.target.value))} disabled={readonly}
            helperText="After this many attempts the message moves to dead-letter" />
        </Panel>
        <Panel title="Routing" dotColor="#4ec9a0">
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>Status</label>
            <Dropdown options={STATUS_OPTIONS} value={props.status ?? 'Active'} onChange={(v) => setP('status', v)} disabled={readonly} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>Forward to</label>
            <Dropdown options={forwardOptions} value={props.forwardTo ?? ''} onChange={(v) => setP('forwardTo', v || undefined)} disabled={readonly} enableSearch={forwardOptions.length > 5} placeholder="queue or topic name…" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>Forward dead-letter to</label>
            <Dropdown options={forwardOptions} value={props.forwardDeadLetteredMessagesTo ?? ''} onChange={(v) => setP('forwardDeadLetteredMessagesTo', v || undefined)} disabled={readonly} enableSearch={forwardOptions.length > 5} placeholder="queue or topic name…" />
          </div>
        </Panel>
      </div>
      <FeatureToggles readonly={readonly} features={[
        { key: 'requiresSession', label: 'Requires session', desc: 'Messages must include a SessionId — enables FIFO ordering', checked: !!props.requiresSession, immutable: true },
        { key: 'deadLetteringOnMessageExpiration', label: 'Dead-letter on message expiration', desc: 'Expired messages are moved to the dead-letter sub-queue', checked: !!props.deadLetteringOnMessageExpiration },
        { key: 'deadLetteringOnFilterEvaluationExceptions', label: 'Dead-letter on filter exceptions', desc: 'Messages causing filter evaluation errors go to dead-letter', checked: !!props.deadLetteringOnFilterEvaluationExceptions },
      ]} setP={setP} />
    </>
  );
};
