import React from 'react';
import { Input, Dropdown } from '@shared/components';
import { Panel } from './Panel';
import styles from '../EntityEditor.module.css';

export const RuleEditor: React.FC<{ props: any; setP: (k: string, v: any) => void; readonly: boolean }> = ({ props, setP, readonly }) => {
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
