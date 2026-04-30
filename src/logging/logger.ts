import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

function ch(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Service Bus Explorer');
  }
  return channel;
}

function ts(): string {
  return new Date().toISOString();
}

export const Logger = {
  info(msg: string, ...args: unknown[]): void {
    ch().appendLine(`[${ts()}] [INFO]  ${format(msg, args)}`);
  },
  warn(msg: string, ...args: unknown[]): void {
    ch().appendLine(`[${ts()}] [WARN]  ${format(msg, args)}`);
  },
  error(msg: string, err?: unknown): void {
    const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : err ? JSON.stringify(err) : '';
    ch().appendLine(`[${ts()}] [ERROR] ${msg}${detail ? '\n' + detail : ''}`);
  },
  debug(msg: string, ...args: unknown[]): void {
    ch().appendLine(`[${ts()}] [DEBUG] ${format(msg, args)}`);
  },
  show(): void { ch().show(true); },
  dispose(): void { channel?.dispose(); channel = undefined; }
};

function format(msg: string, args: unknown[]): string {
  if (!args.length) return msg;
  return msg + ' ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
}
