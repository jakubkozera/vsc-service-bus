import * as vscode from 'vscode';
import { MessagesService, MessageSource } from '../services/messagesService';
import { SendService } from '../services/sendService';
import { AdminService } from '../services/adminService';
import { NamespacesTreeProvider } from '../providers/namespacesTreeProvider';
import { WebviewHost } from '../webviews/webviewHost';
import { QueueItem, SubscriptionItem, TopicItem, DeadLetterItem } from '../providers/treeItems';
import { previewBody, safeStringify } from '../utils/messageBody';
import { showError } from '../utils/errors';
import { Logger } from '../logging/logger';
import { ServiceBusReceivedMessage, ServiceBusReceiver } from '@azure/service-bus';

function serializeMessage(m: ServiceBusReceivedMessage): any {
  return {
    sequenceNumber: m.sequenceNumber?.toString(),
    messageId: m.messageId,
    subject: m.subject,
    contentType: m.contentType,
    enqueuedTimeUtc: m.enqueuedTimeUtc,
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
      const host = new WebviewHost(ctx, {
        viewType: 'sbe.messages',
        title: `Messages: ${src.label}`,
        bundleId: 'messages',
        initData: { source: { queue: src.queue, topic: src.topic, subscription: src.subscription, subQueue: src.subQueue }, isDLQ, peekDefault: peekDefault() }
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
            host.post({ command: 'messages', mode: 'peek', items: list.map(serializeMessage) });
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
          } else if (msg.command === 'resend') {
            Logger.info(`[Messages] Resend seq ${msg.sequenceNumber} from ${src.label}`);
            await cleanup();
            const recv = await messages.openPeekLockReceiver(src.nsId, src);
            try {
              const got = await recv.receiveMessages(50, { maxWaitTimeInMs: 5000 });
              const target = got.find(g => String(g.sequenceNumber) === msg.sequenceNumber);
              if (target) {
                const dest = src.queue ? { queue: src.queue } : { topic: src.topic! };
                await send.send(src.nsId, dest, [messages.toServiceBusMessage(target)]);
                await recv.completeMessage(target);
                for (const m of got.filter(g => g !== target)) await recv.abandonMessage(m);
                host.post({ command: 'actionDone', sequenceNumber: msg.sequenceNumber, action: 'resend' });
                Logger.info(`[Messages] Resend done for seq ${msg.sequenceNumber}`);
                tree.invalidateNamespace(src.nsId);
              } else {
                for (const m of got) await recv.abandonMessage(m);
                host.post({ command: 'error', error: `Message ${msg.sequenceNumber} not found` });
              }
            } finally { await recv.close(); }
          } else if (msg.command === 'delete') {
            Logger.info(`[Messages] Delete seq ${msg.sequenceNumber} from ${src.label}`);
            await cleanup();
            const recv = await messages.openPeekLockReceiver(src.nsId, src);
            try {
              const got = await recv.receiveMessages(50, { maxWaitTimeInMs: 5000 });
              const target = got.find(g => String(g.sequenceNumber) === msg.sequenceNumber);
              if (target) {
                await recv.completeMessage(target);
                for (const m of got.filter(g => g !== target)) await recv.abandonMessage(m);
                host.post({ command: 'actionDone', sequenceNumber: msg.sequenceNumber, action: 'delete' });
                Logger.info(`[Messages] Delete done for seq ${msg.sequenceNumber}`);
                tree.invalidateNamespace(src.nsId);
              } else {
                for (const m of got) await recv.abandonMessage(m);
                host.post({ command: 'error', error: `Message ${msg.sequenceNumber} not found` });
              }
            } finally { await recv.close(); }
          } else if (msg.command === 'resubmit') {
            // DLQ: receive locked → send to source → complete
            await cleanup();
            const recv = await messages.openPeekLockReceiver(src.nsId, src);
            try {
              const got = await recv.receiveMessages(msg.count ?? 50, { maxWaitTimeInMs: 5000 });
              const targets = msg.sequenceNumbers as string[] | undefined;
              const toSubmit = targets ? got.filter(g => targets.includes(String(g.sequenceNumber))) : got;
              const target = src.queue ? { queue: src.queue } : { topic: src.topic! };
              await send.send(src.nsId, target, toSubmit.map(m => messages.toServiceBusMessage(m)));
              for (const m of toSubmit) await recv.completeMessage(m);
              for (const m of got.filter(g => !toSubmit.includes(g))) await recv.abandonMessage(m);
              host.post({ command: 'resubmitDone', count: toSubmit.length });
            } finally { await recv.close(); }
            tree.invalidateNamespace(src.nsId);
          } else if (msg.command === 'moveTo') {
            const targetName: string = msg.targetName;
            const targetKind: 'queue' | 'topic' = msg.targetKind;
            await cleanup();
            const recv = await messages.openPeekLockReceiver(src.nsId, src);
            try {
              const got = await recv.receiveMessages(msg.count ?? 50, { maxWaitTimeInMs: 5000 });
              const target = targetKind === 'queue' ? { queue: targetName } : { topic: targetName };
              await send.send(src.nsId, target, got.map(m => messages.toServiceBusMessage(m)));
              for (const m of got) await recv.completeMessage(m);
              host.post({ command: 'moveDone', count: got.length });
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
        initData: { source: { queue: item.queueName }, isDLQ: false, isScheduled: true, peekDefault: peekDefault() }
      });

      host.onMessage(async (msg: any) => {
        try {
          if (msg.command === 'peek') {
            Logger.info(`[Messages] Peek scheduled ${msg.count} from ${item.queueName}`);
            const list = await messages.peek(item.nsId, { queue: item.queueName }, msg.count ?? 500);
            const scheduled = list.filter(m => m.state === 'scheduled');
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
