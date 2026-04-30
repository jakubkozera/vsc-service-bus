import * as vscode from 'vscode';
import { SendService } from '../services/sendService';
import { AdminService } from '../services/adminService';
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

export function registerSendCommands(ctx: vscode.ExtensionContext, send: SendService, tree: NamespacesTreeProvider, admin: AdminService): void {
  const open = async (target: { queue?: string; topic?: string }, nsId: string, title: string, isTestSender = false) => {
    const iconPath = target.topic
      ? { light: vscode.Uri.joinPath(ctx.extensionUri, 'media', 'topic-light.svg'), dark: vscode.Uri.joinPath(ctx.extensionUri, 'media', 'topic-dark.svg') }
      : { light: vscode.Uri.joinPath(ctx.extensionUri, 'media', 'queue-light.svg'), dark: vscode.Uri.joinPath(ctx.extensionUri, 'media', 'queue-dark.svg') };

    // Load all available targets in this namespace for the target dropdown
    let availableTargets: { name: string; kind: 'queue' | 'topic' }[] = [];
    try {
      const [queues, topics] = await Promise.all([admin.listQueues(nsId), admin.listTopics(nsId)]);
      availableTargets = [
        ...queues.map(q => ({ name: q.name, kind: 'queue' as const })),
        ...topics.map(t => ({ name: t.name, kind: 'topic' as const }))
      ];
    } catch (e) {
      // Non-fatal: webview will still work with just the current target
    }

    const host = new WebviewHost(ctx, {
      viewType: isTestSender ? 'sbe.testSender' : 'sbe.sendMessage',
      title,
      bundleId: 'sendMessage',
      initData: { target, isTestSender, availableTargets },
      iconPath
    });
    let currentTarget = target;
    let currentNsId = nsId;
    host.onMessage(async (msg: any) => {
      try {
        if (msg.command === 'changeTarget' && msg.target) {
          currentTarget = msg.target;
        } else if (msg.command === 'send') {
          const messages = buildMessages(msg.payload as SendPayload);
          let count: number;
          if (msg.payload.scheduledEnqueueTimeUtc) {
            const seq = await send.schedule(currentNsId, currentTarget, messages, new Date(msg.payload.scheduledEnqueueTimeUtc));
            count = seq.length;
          } else {
            count = await send.send(currentNsId, currentTarget, messages);
          }
          host.post({ command: 'sendResult', count });
          void vscode.window.showInformationMessage(`Sent ${count} message(s)`);
          tree.invalidateNamespace(currentNsId);
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
      void open({ queue: item.queueName }, item.nsId, 'Send messages');
    }),
    vscode.commands.registerCommand('serviceBusExplorer.topic.send', (item?: TopicItem) => {
      if (!item) return;
      void open({ topic: item.topicName }, item.nsId, 'Send messages');
    }),
    vscode.commands.registerCommand('serviceBusExplorer.testSender.open', (item?: QueueItem | TopicItem) => {
      if (!item) return;
      const target = item instanceof QueueItem ? { queue: item.queueName } : { topic: (item as TopicItem).topicName };
      void open(target, item.nsId, 'Test Sender', true);
    })
  );
}
