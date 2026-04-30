import * as vscode from 'vscode';

export function friendlyError(e: unknown): string {
  if (!e) return 'Unknown error';
  const err = e as any;
  const code = err.code || err.name;
  const msg = err.message || String(e);
  switch (code) {
    case 'MessagingEntityAlreadyExists':
      return 'Entity already exists.';
    case 'MessagingEntityNotFound':
      return 'Entity not found.';
    case 'Unauthorized':
    case 'UnauthorizedAccess':
      return 'Unauthorized — check credentials and permissions.';
    case 'ServiceBusy':
      return 'Service is busy. Please retry.';
    default:
      return msg;
  }
}

export async function withProgress<T>(title: string, fn: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>): Promise<T> {
  return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable: false }, fn);
}

export function showError(prefix: string, e: unknown): void {
  void vscode.window.showErrorMessage(`${prefix}: ${friendlyError(e)}`);
}
