/**
 * Hook for handling messages from VS Code extension
 */
import { useCallback } from 'react';
import { useVSCodeAPI } from './useVSCodeAPI';
import { BaseMessage } from '../types';

export function useVSCodeMessaging<TIncoming extends BaseMessage, TOutgoing extends BaseMessage>() {
  const vscode = useVSCodeAPI();

  const postMessage = useCallback((message: TOutgoing) => {
    vscode.postMessage(message);
  }, [vscode]);

  const subscribe = useCallback((handler: (message: TIncoming) => void) => {
    const listener = (event: MessageEvent<TIncoming>) => {
      handler(event.data);
    };

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  return { postMessage, subscribe, vscode };
}
