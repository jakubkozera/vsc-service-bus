import * as vscode from 'vscode';
import { AdminService } from '../services/adminService';
import { MessagesService } from '../services/messagesService';
import { NamespacesTreeProvider } from '../providers/namespacesTreeProvider';
import { QueueItem, QueuesFolderItem, TopicItem, TopicsFolderItem, SubscriptionItem, RuleItem, NamespaceItem, DeadLetterItem } from '../providers/treeItems';
import { WebviewHost } from '../webviews/webviewHost';
import { showError, withProgress } from '../utils/errors';
import { PurgeService } from '../services/purgeService';
import { SendService } from '../services/sendService';

function entityWebview(ctx: vscode.ExtensionContext, viewType: string, title: string, initData: any, onSave: (payload: any) => Promise<void>): WebviewHost {
  const kind = initData.kind as string;
  const iconPath = kind === 'topic'
    ? { light: vscode.Uri.joinPath(ctx.extensionUri, 'media', 'topic-light.svg'), dark: vscode.Uri.joinPath(ctx.extensionUri, 'media', 'topic-dark.svg') }
    : { light: vscode.Uri.joinPath(ctx.extensionUri, 'media', 'queue-light.svg'), dark: vscode.Uri.joinPath(ctx.extensionUri, 'media', 'queue-dark.svg') };
  const host = new WebviewHost(ctx, { viewType, title, bundleId: 'entityEditor', initData, iconPath });
  host.onMessage(async (msg: any) => {
    if (msg?.command === 'save') {
      try {
        await onSave(msg.payload);
        void vscode.window.showInformationMessage(`${title}: saved`);
        host.dispose();
      } catch (e) {
        host.post({ command: 'error', error: (e as Error).message });
        showError('Save failed', e);
      }
    } else if (msg?.command === 'cancel') {
      host.dispose();
    }
  });
  return host;
}

export function registerEntityCommands(
  ctx: vscode.ExtensionContext,
  admin: AdminService,
  tree: NamespacesTreeProvider,
  purge: PurgeService,
  send: SendService,
  messages: MessagesService
): void {
  // ---- Queue ----
  ctx.subscriptions.push(
    vscode.commands.registerCommand('serviceBusExplorer.queue.create', async (item?: QueuesFolderItem) => {
      if (!item) return;
      entityWebview(ctx, 'sbe.queueEditor', 'Create Queue', { mode: 'create', kind: 'queue' }, async (p) => {
        await admin.createQueue(item.nsId, p.name, p.options);
        tree.invalidateNamespace(item.nsId);
      });
    }),
    vscode.commands.registerCommand('serviceBusExplorer.queue.open', async (item?: QueueItem) => {
      if (!item) return;
      const { properties, runtime } = await admin.getQueue(item.nsId, item.queueName);
      const host = entityWebview(ctx, 'sbe.queueOpen', `Queue: ${item.queueName}`,
        { mode: 'edit', kind: 'queue', name: item.queueName, properties, runtime },
        async (p) => {
          await admin.updateQueue(item.nsId, p.properties);
          tree.invalidateNamespace(item.nsId);
        }
      );
      host.onMessage(async (msg: any) => {
        if (msg?.command === 'viewMessages') {
          vscode.commands.executeCommand('serviceBusExplorer.messages.view', item);
        } else if (msg?.command === 'viewDeadLetter') {
          const dlqItem = new DeadLetterItem(item.nsId, { queue: item.queueName }, item.dlq);
          vscode.commands.executeCommand('serviceBusExplorer.messages.view', dlqItem);
        } else if (msg?.command === 'viewTransferDeadLetter') {
          const tdlqItem = new DeadLetterItem(item.nsId, { queue: item.queueName }, item.transferDlq, true);
          vscode.commands.executeCommand('serviceBusExplorer.messages.view', tdlqItem);
        } else if (msg?.command === 'viewScheduled') {
          vscode.commands.executeCommand('serviceBusExplorer.messages.viewScheduled', item);
        } else if (msg?.command === 'sendMessage') {
          vscode.commands.executeCommand('serviceBusExplorer.queue.send', item);
        } else if (msg?.command === 'sendScheduled') {
          vscode.commands.executeCommand('serviceBusExplorer.queue.send', item);
        } else if (msg?.command === 'purgeActive') {
          try {
            await withProgress('Purging…', () => purge.purge(item.nsId, { queue: item.queueName }, 'receiveAndDelete'));
            tree.invalidateNamespace(item.nsId);
            const { runtime } = await admin.getQueue(item.nsId, item.queueName);
            host.post({ command: 'purgeDone', runtime });
          } catch (e) { showError('Purge failed', e); host.post({ command: 'purgeCancelled' }); }
        } else if (msg?.command === 'purgeDeadLetter') {
          try {
            await withProgress('Purging DLQ…', () => purge.purge(item.nsId, { queue: item.queueName, subQueue: 'deadLetter' } as any, 'receiveAndDelete'));
            tree.invalidateNamespace(item.nsId);
            const { runtime } = await admin.getQueue(item.nsId, item.queueName);
            host.post({ command: 'purgeDone', runtime });
          } catch (e) { showError('Purge failed', e); host.post({ command: 'purgeCancelled' }); }
        } else if (msg?.command === 'purgeScheduled') {
          try {
            await withProgress('Cancelling scheduled…', async () => {
              const peeked = await messages.peek(item.nsId, { queue: item.queueName }, 500);
              const scheduledSeqs = peeked.filter(m => m.state === 'scheduled' && m.sequenceNumber).map(m => m.sequenceNumber!);
              if (scheduledSeqs.length > 0) {
                await send.cancelScheduled(item.nsId, { queue: item.queueName }, scheduledSeqs);
              }
            });
            tree.invalidateNamespace(item.nsId);
            const { runtime } = await admin.getQueue(item.nsId, item.queueName);
            host.post({ command: 'purgeDone', runtime });
          } catch (e) { showError('Cancel scheduled failed', e); host.post({ command: 'purgeCancelled' }); }
        }
      });
    }),
    vscode.commands.registerCommand('serviceBusExplorer.queue.edit', async (item?: QueueItem) => {
      if (!item) return;
      const { properties, runtime } = await admin.getQueue(item.nsId, item.queueName);
      entityWebview(ctx, 'sbe.queueEdit', `Queue: ${item.queueName}`,
        { mode: 'edit', kind: 'queue', name: item.queueName, properties, runtime },
        async (p) => {
          await admin.updateQueue(item.nsId, p.properties);
          tree.invalidateNamespace(item.nsId);
        }
      );
    }),
    vscode.commands.registerCommand('serviceBusExplorer.queue.delete', async (item?: QueueItem) => {
      if (!item) return;
      const ok = await vscode.window.showWarningMessage(`Delete queue "${item.queueName}"?`, { modal: true }, 'Delete');
      if (ok !== 'Delete') return;
      try {
        await withProgress(`Deleting ${item.queueName}…`, () => admin.deleteQueue(item.nsId, item.queueName));
        tree.invalidateNamespace(item.nsId);
      } catch (e) { showError('Delete failed', e); }
    }),

    // ---- Topic ----
    vscode.commands.registerCommand('serviceBusExplorer.topic.create', async (item?: TopicsFolderItem) => {
      if (!item) return;
      entityWebview(ctx, 'sbe.topicEditor', 'Create Topic', { mode: 'create', kind: 'topic' }, async (p) => {
        await admin.createTopic(item.nsId, p.name, p.options);
        tree.invalidateNamespace(item.nsId);
      });
    }),
    vscode.commands.registerCommand('serviceBusExplorer.topic.open', async (item?: TopicItem) => {
      if (!item) return;
      const { properties, runtime } = await admin.getTopic(item.nsId, item.topicName);
      entityWebview(ctx, 'sbe.topicOpen', `Topic: ${item.topicName}`,
        { mode: 'edit', kind: 'topic', name: item.topicName, properties, runtime },
        async (p) => {
          await admin.updateTopic(item.nsId, p.properties);
          tree.invalidateNamespace(item.nsId);
        }
      );
    }),
    vscode.commands.registerCommand('serviceBusExplorer.topic.edit', async (item?: TopicItem) => {
      if (!item) return;
      const { properties, runtime } = await admin.getTopic(item.nsId, item.topicName);
      entityWebview(ctx, 'sbe.topicEdit', `Topic: ${item.topicName}`,
        { mode: 'edit', kind: 'topic', name: item.topicName, properties, runtime },
        async (p) => {
          await admin.updateTopic(item.nsId, p.properties);
          tree.invalidateNamespace(item.nsId);
        }
      );
    }),
    vscode.commands.registerCommand('serviceBusExplorer.topic.delete', async (item?: TopicItem) => {
      if (!item) return;
      const ok = await vscode.window.showWarningMessage(`Delete topic "${item.topicName}"?`, { modal: true }, 'Delete');
      if (ok !== 'Delete') return;
      try {
        await admin.deleteTopic(item.nsId, item.topicName);
        tree.invalidateNamespace(item.nsId);
      } catch (e) { showError('Delete failed', e); }
    }),

    // ---- Subscription ----
    vscode.commands.registerCommand('serviceBusExplorer.subscription.create', async (item?: TopicItem) => {
      if (!item) return;
      entityWebview(ctx, 'sbe.subEditor', 'Create Subscription',
        { mode: 'create', kind: 'subscription', topicName: item.topicName },
        async (p) => {
          await admin.createSubscription(item.nsId, item.topicName, p.name, p.options);
          tree.invalidateNamespace(item.nsId);
        }
      );
    }),
    vscode.commands.registerCommand('serviceBusExplorer.subscription.edit', async (item?: SubscriptionItem) => {
      if (!item) return;
      const { properties, runtime } = await admin.getSubscription(item.nsId, item.topicName, item.subscriptionName);
      entityWebview(ctx, 'sbe.subEdit', `Subscription: ${item.subscriptionName}`,
        { mode: 'edit', kind: 'subscription', topicName: item.topicName, name: item.subscriptionName, properties, runtime },
        async (p) => {
          await admin.updateSubscription(item.nsId, p.properties);
          tree.invalidateNamespace(item.nsId);
        }
      );
    }),
    vscode.commands.registerCommand('serviceBusExplorer.subscription.delete', async (item?: SubscriptionItem) => {
      if (!item) return;
      const ok = await vscode.window.showWarningMessage(`Delete subscription "${item.subscriptionName}"?`, { modal: true }, 'Delete');
      if (ok !== 'Delete') return;
      try {
        await admin.deleteSubscription(item.nsId, item.topicName, item.subscriptionName);
        tree.invalidateNamespace(item.nsId);
      } catch (e) { showError('Delete failed', e); }
    }),

    // ---- Rule ----
    vscode.commands.registerCommand('serviceBusExplorer.rule.create', async (item?: SubscriptionItem) => {
      if (!item) return;
      entityWebview(ctx, 'sbe.ruleEditor', 'Create Rule',
        { mode: 'create', kind: 'rule', topicName: item.topicName, subscriptionName: item.subscriptionName },
        async (p) => {
          await admin.createRule(item.nsId, item.topicName, item.subscriptionName, p.name, { filter: p.filter, action: p.action });
          tree.invalidateNamespace(item.nsId);
        }
      );
    }),
    vscode.commands.registerCommand('serviceBusExplorer.rule.edit', async (item?: RuleItem) => {
      if (!item) return;
      const props = await admin.getRule(item.nsId, item.topicName, item.subscriptionName, item.ruleName);
      entityWebview(ctx, 'sbe.ruleEdit', `Edit Rule: ${item.ruleName}`,
        { mode: 'edit', kind: 'rule', topicName: item.topicName, subscriptionName: item.subscriptionName, name: item.ruleName, properties: props },
        async (p) => {
          await admin.updateRule(item.nsId, item.topicName, item.subscriptionName, p.properties);
          tree.invalidateNamespace(item.nsId);
        }
      );
    }),
    vscode.commands.registerCommand('serviceBusExplorer.rule.delete', async (item?: RuleItem) => {
      if (!item) return;
      const ok = await vscode.window.showWarningMessage(`Delete rule "${item.ruleName}"?`, { modal: true }, 'Delete');
      if (ok !== 'Delete') return;
      try {
        await admin.deleteRule(item.nsId, item.topicName, item.subscriptionName, item.ruleName);
        tree.invalidateNamespace(item.nsId);
      } catch (e) { showError('Delete failed', e); }
    }),

    // ---- Common ----
    vscode.commands.registerCommand('serviceBusExplorer.refreshTree', () => tree.refresh()),
    vscode.commands.registerCommand('serviceBusExplorer.refreshNode', (item?: vscode.TreeItem) => tree.refresh(item)),
    vscode.commands.registerCommand('serviceBusExplorer.copyName', async (item?: any) => {
      const name = item?.queueName ?? item?.topicName ?? item?.subscriptionName ?? item?.ruleName ?? item?.meta?.displayName ?? item?.label;
      if (name) {
        await vscode.env.clipboard.writeText(String(name));
        void vscode.window.showInformationMessage(`Copied: ${name}`);
      }
    })
  );
}
