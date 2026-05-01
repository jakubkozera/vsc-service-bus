import React from 'react';
import { Button } from '@shared/components';
import styles from '../EntityEditor.module.css';

export const SaveBar: React.FC<{ dirty: boolean; saveState: string; error: string | null; onSave: () => void; onDiscard: () => void }> = ({ dirty, saveState, error, onSave, onDiscard }) => {
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
