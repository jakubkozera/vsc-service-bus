import * as vscode from 'vscode';
import { SendService } from '../services/sendService';
import { WebviewHost } from '../webviews/webviewHost';
import { QueueItem, TopicItem } from '../providers/treeItems';
import { NamespacesTreeProvider } from '../providers/namespacesTreeProvider';
import { showError } from '../utils/errors';
import { ServiceBusMessage } from '@azure/service-bus';

interface SendPayload {
  body?: string;
  contentType?: string;
  subject?: string;
  messageId?: string;
  correlationId?: string;
  sessionId?: string;
  partitionKey?: string;
  to?: string;
  replyTo?: string;
  replyToSessionId?: string;
  applicationProperties?: Record<string, string | number | boolean>;
  scheduledEnqueueTimeUtc?: string;
  repeat?: number;
  batch?: ServiceBusMessage[];
}

function buildMessages(p: SendPayload): ServiceBusMessage[] {
  if (p.batch && Array.isArray(p.batch)) return p.batch;
  const repeat = Math.max(1, p.repeat ?? 1);
  const messages: ServiceBusMessage[] = [];
  for (let i = 0; i < repeat; i++) {
    const idx = String(i + 1);
    let body: any = p.body ?? '';
    body = body.replace(/\{\{i\}\}/g, idx).replace(/\{\{guid\}\}/g, crypto.randomUUID()).replace(/\{\{now\}\}/g, new Date().toISOString());
    messages.push({
      body,
      contentType: p.contentType,
      subject: p.subject,
      messageId: p.messageId ? `${p.messageId}-${idx}` : undefined,
      correlationId: p.correlationId,
      sessionId: p.sessionId,
      partitionKey: p.partitionKey,
      to: p.to,
      replyTo: p.replyTo,
      replyToSessionId: p.replyToSessionId,
      applicationProperties: p.applicationProperties
    });
  }
  return messages;
}

export function registerSendCommands(ctx: vscode.ExtensionContext, send: SendService, tree: NamespacesTreeProvider): void {
  const open = (target: { queue?: string; topic?: string }, nsId: string, title: string, isTestSender = false) => {
    const host = new WebviewHost(ctx, {
      viewType: isTestSender ? 'sbe.testSender' : 'sbe.sendMessage',
      title,
      bundleId: 'sendMessage',
      initData: { target, isTestSender }
    });
    host.onMessage(async (msg: any) => {
      try {
        if (msg.command === 'send') {
          const messages = buildMessages(msg.payload as SendPayload);
          let count: number;
          if (msg.payload.scheduledEnqueueTimeUtc) {
            const seq = await send.schedule(nsId, target, messages, new Date(msg.payload.scheduledEnqueueTimeUtc));
            count = seq.length;
          } else {
            count = await send.send(nsId, target, messages);
          }
          host.post({ command: 'sendResult', count });
          void vscode.window.showInformationMessage(`Sent ${count} message(s)`);
          tree.invalidateNamespace(nsId);
        }
      } catch (e) {
        showError('Send failed', e);
        host.post({ command: 'error', error: (e as Error).message });
      }
    });
  };

  ctx.subscriptions.push(
    vscode.commands.registerCommand('serviceBusExplorer.queue.send', (item?: QueueItem) => {
      if (!item) return;
      open({ queue: item.queueName }, item.nsId, `Send → ${item.queueName}`);
    }),
    vscode.commands.registerCommand('serviceBusExplorer.topic.send', (item?: TopicItem) => {
      if (!item) return;
      open({ topic: item.topicName }, item.nsId, `Send → ${item.topicName}`);
    }),
    vscode.commands.registerCommand('serviceBusExplorer.testSender.open', (item?: QueueItem | TopicItem) => {
      if (!item) return;
      const target = item instanceof QueueItem ? { queue: item.queueName } : { topic: (item as TopicItem).topicName };
      const name = item instanceof QueueItem ? item.queueName : (item as TopicItem).topicName;
      open(target, item.nsId, `Test Sender → ${name}`, true);
    })
  );
}
