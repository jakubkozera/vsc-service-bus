import React, { useMemo } from 'react';
import { CopyButton } from '@shared/components';
import { colorizeJson } from '../helpers';
import styles from '../EntityEditor.module.css';

export const JsonViewer: React.FC<{ data: any; title: string }> = ({ data, title }) => {
  const jsonStr = useMemo(() => JSON.stringify(data, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2), [data]);
  const highlighted = useMemo(() => colorizeJson(jsonStr, { jsonKey: styles.jsonKey, jsonString: styles.jsonString, jsonNumber: styles.jsonNumber }), [jsonStr]);

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
