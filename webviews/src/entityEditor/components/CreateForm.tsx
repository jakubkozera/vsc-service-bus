import React from 'react';
import { Button, Input, Switch, DurationInput, NumberInput } from '@shared/components';
import { RuleEditor } from './RuleEditor';
import { InitData } from '../types';
import styles from '../EntityEditor.module.css';

// Simplified create fields
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

export const CreateForm: React.FC<{
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
