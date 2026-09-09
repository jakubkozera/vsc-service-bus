import * as vscode from 'vscode';
import { MessagesService, MessageSource } from '../services/messagesService';
import { SendService } from '../services/sendService';
import { AdminService } from '../services/adminService';
import { NamespacesTreeProvider } from '../providers/namespacesTreeProvider';
import { WebviewHost } from '../webviews/webviewHost';
import { QueueItem, SubscriptionItem, TopicItem, DeadLetterItem } from '../providers/treeItems';
import { parseEditedBody, previewBody, safeStringify } from '../utils/messageBody';
import { showError } from '../utils/errors';
import { Logger } from '../logging/logger';
import { ServiceBusMessage, ServiceBusReceivedMessage, ServiceBusReceiver } from '@azure/service-bus';

interface MessageEdits {
  body: string;
  contentType: string;
  subject: string;
  correlationId: string;
  applicationProperties: { key: string; value: string }[];
}

function applyEdits(out: ServiceBusMessage, edits: MessageEdits): void {
  out.contentType = edits.contentType || undefined;
  out.subject = edits.subject || undefined;
  out.correlationId = edits.correlationId || undefined;
  out.body = parseEditedBody(edits.body, out.contentType);
  out.applicationProperties = Object.fromEntries(
    edits.applicationProperties.map(({ key, value }) => [key, coerceProperty(value)])
  );
}

function coerceProperty(value: string): any {
  try { 
    return JSON.parse(value); 
  } catch { 
    return value; 
  }  
}

function serializeMessage(m: ServiceBusReceivedMessage): any {
  return {
    sequenceNumber: m.sequenceNumber?.toString(),
    messageId: m.messageId,
    subject: m.subject,
    contentType: m.contentType,
    enqueuedTimeUtc: m.enqueuedTimeUtc,
    scheduledEnqueueTimeUtc: m.scheduledEnqueueTimeUtc,
    deliveryCount: m.deliveryCount,
    state: m.state,
    body: previewBody(m.body),
    applicationProperties: m.applicationProperties,
    deadLetterReason: m.deadLetterReason,
    deadLetterErrorDescription: m.deadLetterErrorDescription,
    deadLetterSource: m.deadLetterSource,
    correlationId: m.correlationId,
    sessionId: m.sessionId,
    partitionKey: m.partitionKey
  };
}

function sourceFromItem(item: any): MessageSource & { nsId: string; label: string } {
  if (item instanceof QueueItem) return { nsId: item.nsId, queue: item.queueName, label: item.queueName };
  if (item instanceof SubscriptionItem) return { nsId: item.nsId, topic: item.topicName, subscription: item.subscriptionName, label: `${item.topicName}/${item.subscriptionName}` };
  if (item instanceof DeadLetterItem) {
    const isTransfer = item.contextValue === 'transferDeadLetter';
    return {
      nsId: item.nsId,
      ...(item.source.queue ? { queue: item.source.queue } : { topic: item.source.topic, subscription: item.source.subscription }),
      subQueue: isTransfer ? 'transferDeadLetter' : 'deadLetter',
      label: `${item.source.queue ?? `${item.source.topic}/${item.source.subscription}`} [${isTransfer ? 'TDLQ' : 'DLQ'}]`
    };
  }
  throw new Error('Unsupported context');
}

export function registerMessageCommands(
  ctx: vscode.ExtensionContext,
  messages: MessagesService,
  send: SendService,
  admin: AdminService,
  tree: NamespacesTreeProvider
): void {
  const peekDefault = () => vscode.workspace.getConfiguration().get<number>('serviceBusExplorer.peekDefaultCount', 50);
  const recvTimeout = () => vscode.workspace.getConfiguration().get<number>('serviceBusExplorer.receiveDefaultTimeoutMs', 5000);

  ctx.subscriptions.push(
    vscode.commands.registerCommand('serviceBusExplorer.messages.view', async (item?: any) => {
      if (!item) return;
      const src = sourceFromItem(item);
      const isDLQ = !!src.subQueue;
      const iconPath = vscode.Uri.joinPath(ctx.extensionUri, 'media', src.topic ? 'topic.svg' : 'queue.svg');

      // Get initial total message count
      const totalMessageCount = await getMessageCount(admin, src, isDLQ);

      const host = new WebviewHost(ctx, {
        viewType: 'sbe.messages',
        title: `Messages: ${src.label}`,
        bundleId: 'messages',
        initData: { source: { queue: src.queue, topic: src.topic, subscription: src.subscription, subQueue: src.subQueue }, isDLQ, peekDefault: peekDefault(), totalMessageCount },
        iconPath
      });

      let activeReceiver: ServiceBusReceiver | undefined;
      const lockedMessages = new Map<string, ServiceBusReceivedMessage>();

      const cleanup = async () => {
        if (activeReceiver) {
          try { await activeReceiver.close(); } catch (e) { Logger.debug('close receiver', String(e)); }
          activeReceiver = undefined;
        }
        lockedMessages.clear();
      };

      host.onDispose(() => { void cleanup(); });

      host.onMessage(async (msg: any) => {
        try {
          if (msg.command === 'peek') {
            Logger.info(`[Messages] Peek ${msg.count} from ${src.label}`);
            await cleanup();
            const list = await messages.peek(src.nsId, src, msg.count ?? peekDefault(), msg.fromSequenceNumber ? BigInt(msg.fromSequenceNumber) : undefined);
            Logger.info(`[Messages] Peek returned ${list.length} messages`);
            const totalMessageCount = await getMessageCount(admin, src, isDLQ);
            host.post({ command: 'messages', mode: 'peek', items: list.map(serializeMessage), totalMessageCount });
          } else if (msg.command === 'receivePeekLock') {
            Logger.info(`[Messages] ReceivePeekLock ${msg.count} from ${src.label}`);
            await cleanup();
            activeReceiver = await messages.openPeekLockReceiver(src.nsId, src);
            const list = await activeReceiver.receiveMessages(msg.count ?? peekDefault(), { maxWaitTimeInMs: recvTimeout() });
            Logger.info(`[Messages] PeekLock returned ${list.length} messages`);
            for (const m of list) {
              if (m.messageId) lockedMessages.set(String(m.sequenceNumber), m);
            }
            host.post({ command: 'messages', mode: 'peekLock', items: list.map(serializeMessage) });
          } else if (msg.command === 'receiveAndDelete') {
            Logger.info(`[Messages] ReceiveAndDelete ${msg.count} from ${src.label}`);
            await cleanup();
            const list = await messages.receiveAndDelete(src.nsId, src, msg.count ?? peekDefault(), recvTimeout());
            Logger.info(`[Messages] ReceiveAndDelete returned ${list.length} messages`);
            host.post({ command: 'messages', mode: 'receiveAndDelete', items: list.map(serializeMessage) });
            tree.invalidateNamespace(src.nsId);
          } else if (msg.command === 'complete' && activeReceiver) {
            const m = lockedMessages.get(msg.sequenceNumber);
            if (m) { await activeReceiver.completeMessage(m); lockedMessages.delete(msg.sequenceNumber); }
            host.post({ command: 'actionDone', sequenceNumber: msg.sequenceNumber, action: 'complete' });
            tree.invalidateNamespace(src.nsId);
          } else if (msg.command === 'abandon' && activeReceiver) {
            const m = lockedMessages.get(msg.sequenceNumber);
            if (m) { await activeReceiver.abandonMessage(m); lockedMessages.delete(msg.sequenceNumber); }
            host.post({ command: 'actionDone', sequenceNumber: msg.sequenceNumber, action: 'abandon' });
          } else if (msg.command === 'defer' && activeReceiver) {
            const m = lockedMessages.get(msg.sequenceNumber);
            if (m) { await activeReceiver.deferMessage(m); lockedMessages.delete(msg.sequenceNumber); }
            host.post({ command: 'actionDone', sequenceNumber: msg.sequenceNumber, action: 'defer' });
          } else if (msg.command === 'deadLetter' && activeReceiver) {
            const m = lockedMessages.get(msg.sequenceNumber);
            if (m) await activeReceiver.deadLetterMessage(m, { deadLetterReason: msg.reason, deadLetterErrorDescription: msg.description });
            lockedMessages.delete(msg.sequenceNumber);
            host.post({ command: 'actionDone', sequenceNumber: msg.sequenceNumber, action: 'deadLetter' });
            tree.invalidateNamespace(src.nsId);
          } else if (msg.command === 'export') {
            const uri = await vscode.window.showSaveDialog({ filters: { JSON: ['json'] }, defaultUri: vscode.Uri.file(`messages.json`) });
            if (uri) {
              await vscode.workspace.fs.writeFile(uri, Buffer.from(safeStringify(msg.items)));
              void vscode.window.showInformationMessage('Exported');
            }
          } else if (msg.command === 'resubmit') {
            const seqs = new Set<string>(msg.sequenceNumbers as string[]);
            const dest = src.queue ? { queue: src.queue } : { topic: src.topic! };
            const prepare = (m: ServiceBusReceivedMessage) => {
              const out = messages.toServiceBusMessage(m);
              if (msg.edits) { applyEdits(out, msg.edits); }
              if (msg.newMessageId) { out.messageId = require('crypto').randomUUID(); }
              return out;
            };
            Logger.info(`[Messages] Resubmit ${seqs.size} message(s) to ${src.label}, removeOriginal=${!!msg.removeOriginal}`);
            let resent: string[];
            if (msg.removeOriginal) {
              await cleanup();
              const recv = await messages.openPeekLockReceiver(src.nsId, src);
              try {
                const { found, abandoned } = await receiveBatchUntilFound(recv, seqs);
                await send.send(src.nsId, dest, found.map(prepare));
                for (const m of found) await recv.completeMessage(m);
                for (const m of abandoned) await recv.abandonMessage(m);
                resent = found.map(m => String(m.sequenceNumber));
              } finally { await recv.close(); }
            } else {
              const found: ServiceBusReceivedMessage[] = [];
              for (const seq of seqs) {
                const [m] = await messages.peek(src.nsId, src, 1, BigInt(seq));
                if (String(m?.sequenceNumber) === seq) { found.push(m); }
              }
              await send.send(src.nsId, dest, found.map(prepare));
              resent = found.map(m => String(m.sequenceNumber));
            }
            host.post({ command: 'resubmitDone', count: resent.length, removedOriginals: !!msg.removeOriginal, sequenceNumbers: resent });
            tree.invalidateNamespace(src.nsId);
          } else if (msg.command === 'delete') {
            Logger.info(`[Messages] Delete seq ${msg.sequenceNumber} from ${src.label}`);
            await cleanup();
            const recv = await messages.openPeekLockReceiver(src.nsId, src);
            try {
              const { found, abandoned } = await receiveBatchUntilFound(recv, new Set([msg.sequenceNumber]));
              const target = found[0];
              if (target) {
                await recv.completeMessage(target);
                for (const m of abandoned) await recv.abandonMessage(m);
                host.post({ command: 'actionDone', sequenceNumber: msg.sequenceNumber, action: 'delete' });
                Logger.info(`[Messages] Delete done for seq ${msg.sequenceNumber}`);
                tree.invalidateNamespace(src.nsId);
              } else {
                for (const m of abandoned) await recv.abandonMessage(m);
                host.post({ command: 'error', error: `Message ${msg.sequenceNumber} not found` });
              }
            } finally { await recv.close(); }
          } else if (msg.command === 'moveTo') {
            const targetName: string = msg.targetName;
            const targetKind: 'queue' | 'topic' = msg.targetKind;
            const moveSeqs = new Set<string>(msg.sequenceNumbers as string[] | undefined);
            await cleanup();
            const recv = await messages.openPeekLockReceiver(src.nsId, src);
            try {
              const { found, abandoned } = await receiveBatchUntilFound(recv, moveSeqs);
              const target = targetKind === 'queue' ? { queue: targetName } : { topic: targetName };
              await send.send(src.nsId, target, found.map(m => messages.toServiceBusMessage(m)));
              for (const m of found) await recv.completeMessage(m);
              for (const m of abandoned) await recv.abandonMessage(m);
              host.post({ command: 'moveDone', count: found.length });
            } finally { await recv.close(); }
            tree.invalidateNamespace(src.nsId);          } else if (msg.command === 'bulkDelete') {
            Logger.info(`[Messages] BulkDelete ${(msg.sequenceNumbers as string[]).length} messages from ${src.label}`);
            await cleanup();
            const recv = await messages.openPeekLockReceiver(src.nsId, src);
            try {
              const deleteSeqs = new Set<string>(msg.sequenceNumbers as string[]);
              const { found, abandoned } = await receiveBatchUntilFound(recv, deleteSeqs);
              for (const m of found) await recv.completeMessage(m);
              for (const m of abandoned) await recv.abandonMessage(m);
              Logger.info(`[Messages] BulkDelete completed ${found.length} messages`);
              host.post({ command: 'bulkDeleteDone', sequenceNumbers: found.map(m => String(m.sequenceNumber)) });
            } finally { await recv.close(); }
            tree.invalidateNamespace(src.nsId);          } else if (msg.command === 'bulkDelete') {
            Logger.info(`[Messages] BulkDelete ${(msg.sequenceNumbers as string[]).length} messages from ${src.label}`);
            await cleanup();
            const recv = await messages.openPeekLockReceiver(src.nsId, src);
            try {
              const deleteSeqs = new Set<string>(msg.sequenceNumbers as string[]);
              const { found, abandoned } = await receiveBatchUntilFound(recv, deleteSeqs);
              for (const m of found) await recv.completeMessage(m);
              for (const m of abandoned) await recv.abandonMessage(m);
              Logger.info(`[Messages] BulkDelete completed ${found.length} messages`);
              host.post({ command: 'bulkDeleteDone', sequenceNumbers: found.map(m => String(m.sequenceNumber)) });
            } finally { await recv.close(); }
            tree.invalidateNamespace(src.nsId);
          } else if (msg.command === 'pickMoveTarget') {
            const queues = await admin.listQueues(src.nsId);
            const topics = await admin.listTopics(src.nsId);
            const items: vscode.QuickPickItem[] = [
              ...queues.map(q => ({ label: `$(inbox) ${q.name}`, description: 'queue', detail: 'queue:' + q.name })),
              ...topics.map(t => ({ label: `$(broadcast) ${t.name}`, description: 'topic', detail: 'topic:' + t.name }))
            ];
            const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Select target entity' });
            if (pick && pick.detail) {
              const [kind, name] = pick.detail.split(':', 2);
              host.post({ command: 'moveTargetSelected', targetKind: kind, targetName: name });
            }
          }
        } catch (e) {
          showError('Operation failed', e);
          host.post({ command: 'error', error: (e as Error).message });
        }
      });
    }),

    vscode.commands.registerCommand('serviceBusExplorer.messages.viewDeadLetter', async (item: any) =>
      vscode.commands.executeCommand('serviceBusExplorer.messages.view', item)),

    vscode.commands.registerCommand('serviceBusExplorer.messages.viewScheduled', async (item?: QueueItem) => {
      if (!item) return;
      const host = new WebviewHost(ctx, {
        viewType: 'sbe.messages',
        title: `Scheduled: ${item.queueName}`,
        bundleId: 'messages',
        initData: { source: { queue: item.queueName }, isDLQ: false, isScheduled: true, peekDefault: peekDefault() },
        iconPath: vscode.Uri.joinPath(ctx.extensionUri, 'media', 'queue.svg')
      });

      host.onMessage(async (msg: any) => {
        try {
          if (msg.command === 'peek') {
            Logger.info(`[Messages] Peek scheduled ${msg.count} from ${item.queueName}`);
            const scheduled = await messages.peekScheduled(item.nsId, { queue: item.queueName }, msg.count ?? 500);
            Logger.info(`[Messages] Peek returned ${scheduled.length} scheduled messages`);
            host.post({ command: 'messages', mode: 'peek', items: scheduled.map(serializeMessage) });
          } else if (msg.command === 'cancelScheduled') {
            // Cancel specific scheduled messages by sequence number
            const seqs = (msg.sequenceNumbers as string[]).map(s => BigInt(s));
            if (seqs.length > 0) {
              const sender = await (send as any).sender?.(item.nsId, { queue: item.queueName });
              if (sender) { await sender.cancelScheduledMessages(seqs as any); await sender.close(); }
              else { await send.cancelScheduled(item.nsId, { queue: item.queueName }, seqs); }
            }
            host.post({ command: 'cancelScheduledDone', count: seqs.length });
            tree.invalidateNamespace(item.nsId);
          }
        } catch (e) {
          showError('Operation failed', e);
          host.post({ command: 'error', error: (e as Error).message });
        }
      });
    })
  );
}

/**
 * Receives messages in batches of 250 until all sequence numbers in `targets` are found,
 * or the queue is drained. Messages not in `targets` are collected in `abandoned`.
 * If `targets` is empty, receives one batch and returns all as `found`.
 */
async function receiveBatchUntilFound(
  recv: ServiceBusReceiver,
  targets: Set<string>
): Promise<{ found: ServiceBusReceivedMessage[]; abandoned: ServiceBusReceivedMessage[] }> {
  const found: ServiceBusReceivedMessage[] = [];
  const abandoned: ServiceBusReceivedMessage[] = [];
  while (targets.size === 0 || found.length < targets.size) {
    const batch = await recv.receiveMessages(250, { maxWaitTimeInMs: 5000 });
    if (batch.length === 0) { break; }
    for (const m of batch) {
      if (targets.size === 0 || targets.has(String(m.sequenceNumber))) {
        found.push(m);
      } else {
        abandoned.push(m);
      }
    }
    if (targets.size > 0 && found.length >= targets.size) { break; }
    if (targets.size === 0) { break; } // single-batch mode
  }
  return { found, abandoned };
}

async function getMessageCount(admin: AdminService, src: MessageSource & { nsId: string }, isDLQ: boolean): Promise<number> {
  try {
    if (src.queue) {
      const { runtime } = await admin.getQueue(src.nsId, src.queue);
      if (isDLQ) return runtime.deadLetterMessageCount;
      return runtime.activeMessageCount;
    } else if (src.topic && src.subscription) {
      const { runtime } = await admin.getSubscription(src.nsId, src.topic, src.subscription);
      if (isDLQ) return runtime.deadLetterMessageCount ?? 0;
      return runtime.activeMessageCount ?? 0;
    }
  } catch { /* ignore */ }
  return 0;
}
