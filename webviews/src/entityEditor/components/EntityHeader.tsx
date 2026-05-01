import React, { useState } from 'react';
import { Button, Input, Modal } from '@shared/components';
import { IconSend, IconTrash, IconPencil } from '@tabler/icons-react';
import { Tooltip } from './Tooltip';
import { EntitySvgIcon } from './EntitySvgIcon';
import { InitData } from '../types';
import styles from '../EntityEditor.module.css';

export const EntityHeader: React.FC<{ init: InitData; props: any; postMessage: (msg: any) => void }> = ({ init, props, postMessage }) => {
  const status = props.status ?? 'Active';
  const isActive = status === 'Active';
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newName, setNewName] = useState(init.name ?? '');

  const handleRename = () => {
    if (newName && newName !== init.name) {
      postMessage({ command: 'rename', name: newName });
      setRenameOpen(false);
    }
  };

  const handleDelete = () => {
    postMessage({ command: 'delete' });
    setDeleteOpen(false);
  };

  return (
    <>
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
          {init.mode === 'edit' && (init.kind === 'queue' || init.kind === 'topic') && (
            <>
              {init.kind === 'topic' && (
                <Tooltip label="Send Message">
                  <button className={styles.headerIconBtn} onClick={() => postMessage({ command: 'sendMessage' })}>
                    <IconSend size={16} />
                  </button>
                </Tooltip>
              )}
              <Tooltip label="Rename">
                <button className={styles.headerIconBtn} onClick={() => { setNewName(init.name ?? ''); setRenameOpen(true); }}>
                  <IconPencil size={16} />
                </button>
              </Tooltip>
              <Tooltip label="Delete">
                <button className={`${styles.headerIconBtn} ${styles.headerIconBtnDanger}`} onClick={() => setDeleteOpen(true)}>
                  <IconTrash size={16} />
                </button>
              </Tooltip>
            </>
          )}
          <span className={`${styles.badgeStatus} ${isActive ? styles.badgeActive : styles.badgeDisabled}`}>
            <span className={styles.badgeDot} />
            {status}
          </span>
        </div>
      </div>
      <Modal
        isOpen={renameOpen}
        onClose={() => setRenameOpen(false)}
        title={`Rename ${init.kind}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleRename} disabled={!newName || newName === init.name}>Rename</Button>
          </>
        }
      >
        <Input label="New name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus
          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') handleRename(); }} />
      </Modal>
      <Modal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete ${init.kind}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </>
        }
      >
        <p>Are you sure you want to delete <strong>{init.name}</strong>?</p>
        <p style={{ color: 'var(--vscode-errorForeground)', fontSize: 12 }}>This action cannot be undone.</p>
      </Modal>
    </>
  );
};
