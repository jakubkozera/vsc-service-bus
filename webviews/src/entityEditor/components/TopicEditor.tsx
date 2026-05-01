import React from 'react';
import { Dropdown, DurationInput, NumberInput } from '@shared/components';
import { Panel } from './Panel';
import { FeatureToggles } from './FeatureToggles';
import { STATUS_OPTIONS } from '../types';
import styles from '../EntityEditor.module.css';

export const TopicEditor: React.FC<{ props: any; setP: (k: string, v: any) => void; readonly: boolean }> = ({ props, setP, readonly }) => (
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
