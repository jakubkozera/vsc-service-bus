import React from 'react';
import { LoadingOverlay } from '@shared/components';
import { useEntityEditor } from './hooks';
import {
  EntityHeader,
  StatsRow,
  QueueEditor,
  TopicEditor,
  SubscriptionEditor,
  RuleEditor,
  JsonViewer,
  SaveBar,
  CreateForm,
} from './components';
import styles from './EntityEditor.module.css';

export const App: React.FC = () => {
  const {
    init, name, props, dirty, saveState, error, purging,
    setName, setP, onSave, onDiscard, setPurging, postMessage,
  } = useEntityEditor();

  if (!init) return <div className={styles.centered}>Loading...</div>;

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

  return (
    <div className={styles.editor}>
      {purging && <LoadingOverlay isLoading={true} text="Purging messages..." />}
      <div className={styles.content}>
        <EntityHeader init={init} props={props} postMessage={postMessage} />
        {init.runtime && <StatsRow runtime={init.runtime} kind={init.kind} postMessage={postMessage} setPurging={setPurging} />}
        {init.kind === 'queue' && <QueueEditor props={props} setP={setP} readonly={init.mode === 'view'} availableTargets={init.availableTargets} />}
        {init.kind === 'topic' && <TopicEditor props={props} setP={setP} readonly={init.mode === 'view'} />}
        {init.kind === 'subscription' && <SubscriptionEditor props={props} setP={setP} readonly={init.mode === 'view'} availableTargets={init.availableTargets} />}
        {init.kind === 'rule' && <RuleEditor props={props} setP={setP} readonly={init.mode === 'view'} />}
        {init.runtime && <JsonViewer data={init.runtime} title="Runtime - raw response" />}
      </div>
      {init.mode === 'edit' && (
        <SaveBar dirty={dirty} saveState={saveState} error={error} onSave={onSave} onDiscard={onDiscard} />
      )}
    </div>
  );
};
