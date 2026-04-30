/**
 * Hook for accessing VS Code API in webviews
 */
import { VSCodeAPI } from '../types';

// Singleton instance - acquireVsCodeApi() can only be called once
let vscodeApiInstance: VSCodeAPI | null = null;

function getVSCodeAPI(): VSCodeAPI {
  if (vscodeApiInstance) {
    return vscodeApiInstance;
  }

  if (typeof acquireVsCodeApi === 'undefined') {
    // Fallback for development/testing
    console.warn('VS Code API not available, using mock');
    vscodeApiInstance = {
      postMessage: (message: any) => console.log('Mock postMessage:', message),
      getState: () => ({}),
      setState: (state: any) => console.log('Mock setState:', state),
    };
  } else {
    vscodeApiInstance = acquireVsCodeApi();
  }

  return vscodeApiInstance;
}

export function useVSCodeAPI(): VSCodeAPI {
  return getVSCodeAPI();
}
