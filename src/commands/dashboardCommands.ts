import * as vscode from 'vscode';
import { AdminService } from '../services/adminService';
import { NamespaceItem } from '../providers/treeItems';
import { WebviewHost } from '../webviews/webviewHost';
import { showError } from '../utils/errors';

export function registerDashboardCommands(ctx: vscode.ExtensionContext, admin: AdminService): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('serviceBusExplorer.dashboard.open', async (item?: NamespaceItem) => {
      if (!item) return;
      const host = new WebviewHost(ctx, {
        viewType: 'sbe.dashboard',
        title: `Dashboard: ${item.meta.displayName}`,
        bundleId: 'dashboard',
        initData: { namespaceName: item.meta.displayName, fqdn: item.meta.fqdn }
      });

      const refresh = async () => {
        try {
          const queues = await admin.listQueues(item.meta.id);
          const topics = await admin.listTopics(item.meta.id);
          const subRows: any[] = [];
          for (const t of topics) {
            const subs = await admin.listSubscriptions(item.meta.id, t.name);
            for (const s of subs) {
              subRows.push({
                kind: 'sub',
                name: `${t.name}/${s.subscriptionName}`,
                active: s.activeMessageCount,
                dlq: s.deadLetterMessageCount,
                scheduled: 0,
                total: s.totalMessageCount,
                sizeBytes: 0
              });
            }
          }
          host.post({
            command: 'snapshot',
            capturedAt: new Date().toISOString(),
            queues: queues.map(q => ({
              kind: 'queue', name: q.name,
              active: q.activeMessageCount, dlq: q.deadLetterMessageCount,
              scheduled: q.scheduledMessageCount, total: q.totalMessageCount,
              sizeBytes: q.sizeInBytes
            })),
            subscriptions: subRows
          });
        } catch (e) {
          showError('Dashboard refresh failed', e);
          host.post({ command: 'error', error: (e as Error).message });
        }
      };

      host.onMessage(async (msg: any) => {
        if (msg.command === 'refresh') return refresh();
        if (msg.command === 'openMessages') {
          // Forward to messages.view by searching the tree — simplified: just notify
          void vscode.window.showInformationMessage(`Open messages for ${msg.name} via the tree`);
        }
      });

      await refresh();
    })
  );
}
