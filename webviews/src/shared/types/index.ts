/**
 * VS Code API types for webviews
 */

export interface VSCodeAPI {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare global {
  function acquireVsCodeApi(): VSCodeAPI;
}

/**
 * Base message interface
 */
export interface BaseMessage {
  command: string;
  [key: string]: any; // Allow additional properties
}

/**
 * Theme types
 */
export type VSCodeThemeKind = 'vscode-light' | 'vscode-dark' | 'vscode-high-contrast';
