import { useEffect, useState, useCallback } from 'react';
import { useVSCodeMessaging } from '@shared/hooks/useVSCodeMessaging';
import { InitData } from '../types';
import { defaultsFor, stripImmutable } from '../helpers';

export interface EntityEditorState {
  init: InitData | null;
  name: string;
  props: any;
  dirty: boolean;
  saveState: 'idle' | 'saved' | 'error';
  error: string | null;
  purging: boolean;
}

export interface EntityEditorActions {
  setName: (name: string) => void;
  setP: (key: string, value: any) => void;
  onSave: () => void;
  onDiscard: () => void;
  setPurging: (v: boolean) => void;
  postMessage: (msg: any) => void;
}

export function useEntityEditor(): EntityEditorState & EntityEditorActions {
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

  return {
    init, name, props, dirty, saveState, error, purging,
    setName, setP, onSave, onDiscard, setPurging, postMessage,
  };
}
