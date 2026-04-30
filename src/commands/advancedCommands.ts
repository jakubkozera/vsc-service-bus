import * as vscode from 'vscode';
import { PurgeService, PurgeStrategy } from '../services/purgeService';
import { ListenerService } from '../services/listenerService';
import { AdminService } from '../services/adminService';
import { QueueItem, SubscriptionItem, DeadLetterItem, TopicItem } from '../providers/treeItems';
import { NamespacesTreeProvider } from '../providers/namespacesTreeProvider';
import { WebviewHost } from '../webviews/webviewHost';
import { showError, withProgress } from '../utils/errors';
import { previewBody, safeStringify } from '../utils/messageBody';
import { MessageSource } from '../services/messagesService';

function srcOf(item: any): { nsId: string; src: MessageSource; label: string } {
  if (item instanceof QueueItem) return { nsId: item.nsId, src: { queue: item.queueName }, label: item.queueName };
  if (item instanceof SubscriptionItem) return { nsId: item.nsId, src: { topic: item.topicName, subscription: item.subscriptionName }, label: `${item.topicName}/${item.subscriptionName}` };
  if (item instanceof DeadLetterItem) {
    const isTransfer = item.contextValue === 'transferDeadLetter';
    return {
      nsId: item.nsId,
      src: { ...(item.source.queue ? { queue: item.source.queue } : { topic: item.source.topic, subscription: item.source.subscription }), subQueue: isTransfer ? 'transferDeadLetter' : 'deadLetter' },
      label: 'dlq'
    };
  }
  throw new Error('Unsupported item');
}

export function registerAdvancedCommands(
  ctx: vscode.ExtensionContext,
  purge: PurgeService,
  listener: ListenerService,
  tree: NamespacesTreeProvider,
  admin: AdminService
): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('serviceBusExplorer.queue.purge', async (item: QueueItem) => purgeFlow(item, purge, tree)),
    vscode.commands.registerCommand('serviceBusExplorer.subscription.purge', async (item: SubscriptionItem) => purgeFlow(item, purge, tree)),

    vscode.commands.registerCommand('serviceBusExplorer.tree.filter', async () => {
      const f = await vscode.window.showInputBox({ prompt: 'Tree filter (substring, ^prefix, re:regex)', value: '' });
      if (f !== undefined) tree.setFilter(f);
    }),

    vscode.commands.registerCommand('serviceBusExplorer.listener.start', async (item?: any) => {
      if (!item) return;
      const { nsId, src, label } = srcOf(item);
      const autoComplete = await vscode.window.showQuickPick(['No (PeekLock)', 'Yes (auto-complete)'], { placeHolder: 'Auto-complete received messages?' });
      if (!autoComplete) return;
      const host = new WebviewHost(ctx, {
        viewType: 'sbe.listener',
        title: `Listener: ${label}`,
        bundleId: 'listener',
        initData: { source: src },
        iconPath: src.topic
          ? { light: vscode.Uri.joinPath(ctx.extensionUri, 'media', 'topic-light.svg'), dark: vscode.Uri.joinPath(ctx.extensionUri, 'media', 'topic-dark.svg') }
          : { light: vscode.Uri.joinPath(ctx.extensionUri, 'media', 'queue-light.svg'), dark: vscode.Uri.joinPath(ctx.extensionUri, 'media', 'queue-dark.svg') }
      });
      let received = 0;
      const start = Date.now();
      const handle = await listener.start(nsId, src, autoComplete.startsWith('Yes'));
      const subMsg = handle.onMessage((m) => {
        received++;
        host.post({ command: 'message', message: { sequenceNumber: m.sequenceNumber?.toString(), messageId: m.messageId, subject: m.subject, body: previewBody(m.body), enqueuedTimeUtc: m.enqueuedTimeUtc } });
        host.post({ command: 'stats', total: received, msPerSec: received / Math.max(1, (Date.now() - start) / 1000) });
      });
      const subErr = handle.onError((e) => host.post({ command: 'error', error: e.message }));
      host.onDispose(() => { subMsg.dispose(); subErr.dispose(); void handle.stop(); });
      host.onMessage(async (m: any) => { if (m.command === 'stop') host.dispose(); });
    }),

    // ---- Batch Operations (11.3) ----
    vscode.commands.registerCommand('serviceBusExplorer.batch.delete', async (...args: any[]) => {
      const items = extractMultiSelect(args);
      if (!items.length) return;
      const ok = await vscode.window.showWarningMessage(`Delete ${items.length} selected entities?`, { modal: true }, 'Delete');
      if (ok !== 'Delete') return;
      await withProgress(`Deleting ${items.length} entities…`, async () => {
        for (const item of items) {
          try {
            if (item instanceof QueueItem) await admin.deleteQueue(item.nsId, item.queueName);
            else if (item instanceof TopicItem) await admin.deleteTopic(item.nsId, item.topicName);
            else if (item instanceof SubscriptionItem) await admin.deleteSubscription(item.nsId, item.topicName, item.subscriptionName);
          } catch (e) { showError(`Delete ${getItemName(item)}`, e); }
        }
        const nsIds = new Set(items.map((i: any) => i.nsId));
        for (const id of nsIds) tree.invalidateNamespace(id);
      });
    }),

    vscode.commands.registerCommand('serviceBusExplorer.batch.disable', async (...args: any[]) => {
      const items = extractMultiSelect(args);
      if (!items.length) return;
      await batchSetStatus(items, 'Disabled', admin, tree);
    }),

    vscode.commands.registerCommand('serviceBusExplorer.batch.enable', async (...args: any[]) => {
      const items = extractMultiSelect(args);
      if (!items.length) return;
      await batchSetStatus(items, 'Active', admin, tree);
    }),

    vscode.commands.registerCommand('serviceBusExplorer.batch.export', async (...args: any[]) => {
      const items = extractMultiSelect(args);
      if (!items.length) return;
      const entities: any[] = [];
      await withProgress(`Exporting ${items.length} entities…`, async () => {
        for (const item of items) {
          try {
            if (item instanceof QueueItem) {
              const { properties } = await admin.getQueue(item.nsId, item.queueName);
              entities.push({ kind: 'queue', properties });
            } else if (item instanceof TopicItem) {
              const { properties } = await admin.getTopic(item.nsId, item.topicName);
              entities.push({ kind: 'topic', properties });
            } else if (item instanceof SubscriptionItem) {
              const { properties } = await admin.getSubscription(item.nsId, item.topicName, item.subscriptionName);
              entities.push({ kind: 'subscription', properties });
            }
          } catch (e) { showError(`Export ${getItemName(item)}`, e); }
        }
      });
      if (!entities.length) return;
      const target = await vscode.window.showSaveDialog({ filters: { JSON: ['json'] }, defaultUri: vscode.Uri.file('entities-export.json') });
      if (!target) return;
      await vscode.workspace.fs.writeFile(target, Buffer.from(safeStringify(entities)));
      void vscode.window.showInformationMessage(`Exported ${entities.length} entities`);
    })
  );
}

async function purgeFlow(item: any, purge: PurgeService, tree: NamespacesTreeProvider): Promise<void> {
  const { nsId, src } = srcOf(item);
  const strat = await vscode.window.showQuickPick(
    [
      { label: 'Receive & Delete batch (safer)', value: 'receiveAndDelete' as PurgeStrategy },
      { label: 'Delete & Recreate (fastest)', value: 'deleteAndRecreate' as PurgeStrategy }
    ],
    { placeHolder: 'Purge strategy' }
  );
  if (!strat) return;
  const ok = await vscode.window.showWarningMessage('This will delete all messages. Proceed?', { modal: true }, 'Purge');
  if (ok !== 'Purge') return;
  try {
    const cfg = vscode.workspace.getConfiguration();
    const r = await withProgress('Purging…', async (p) => {
      return purge.purge(nsId, src, strat.value, cfg.get('serviceBusExplorer.purge.batchSize', 100), cfg.get('serviceBusExplorer.purge.timeoutMs', 60_000), (n) => p.report({ message: `${n} deleted` }));
    });
    tree.invalidateNamespace(nsId);
    void vscode.window.showInformationMessage(r.deleted >= 0 ? `Purged ${r.deleted} messages` : 'Purged (recreated)');
  } catch (e) { showError('Purge failed', e); }
}

function extractMultiSelect(args: any[]): any[] {
  // VS Code passes (clickedItem, allSelectedItems[]) for multi-select tree commands
  if (args.length >= 2 && Array.isArray(args[1])) return args[1];
  if (args.length === 1 && args[0]) return [args[0]];
  return [];
}

function getItemName(item: any): string {
  if (item instanceof QueueItem) return item.queueName;
  if (item instanceof TopicItem) return item.topicName;
  if (item instanceof SubscriptionItem) return item.subscriptionName;
  return String(item.label ?? 'unknown');
}

async function batchSetStatus(items: any[], status: string, admin: AdminService, tree: NamespacesTreeProvider): Promise<void> {
  await withProgress(`Setting ${items.length} entities to ${status}…`, async () => {
    for (const item of items) {
      try {
        if (item instanceof QueueItem) {
          const { properties } = await admin.getQueue(item.nsId, item.queueName);
          await admin.updateQueue(item.nsId, { ...properties, status } as any);
        } else if (item instanceof TopicItem) {
          const { properties } = await admin.getTopic(item.nsId, item.topicName);
          await admin.updateTopic(item.nsId, { ...properties, status } as any);
        } else if (item instanceof SubscriptionItem) {
          const { properties } = await admin.getSubscription(item.nsId, item.topicName, item.subscriptionName);
          await admin.updateSubscription(item.nsId, { ...properties, status } as any);
        }
      } catch (e) { showError(`Set status for ${getItemName(item)}`, e); }
    }
    const nsIds = new Set(items.map((i: any) => i.nsId));
    for (const id of nsIds) tree.invalidateNamespace(id);
  });
  void vscode.window.showInformationMessage(`${items.length} entities set to ${status}`);
}
