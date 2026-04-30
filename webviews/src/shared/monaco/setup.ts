import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// Only import the workers we need (editor + json)
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

// Configure Monaco workers for Vite bundling
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker();
    return new editorWorker();
  },
};

// Point @monaco-editor/react to the local monaco-editor installation
loader.config({ monaco });

export { monaco };
