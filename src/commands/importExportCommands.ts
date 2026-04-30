import * as vscode from 'vscode';
import { AdminService } from '../services/adminService';
import { NamespaceStore } from '../state/namespaceStore';
import { exportNamespace } from '../io/exporter';
import { importLegacyXml, importNamespace } from '../io/importer';
import { validateExportFile, ImportMode } from '../io/schema';
import { NamespaceItem, QueueItem, TopicItem, SubscriptionItem, RuleItem } from '../providers/treeItems';
import { showError, withProgress } from '../utils/errors';
import { safeStringify } from '../utils/messageBody';
import { NamespacesTreeProvider } from '../providers/namespacesTreeProvider';

export function registerImportExportCommands(
  ctx: vscode.ExtensionContext,
  store: NamespaceStore,
  admin: AdminService,
  tree: NamespacesTreeProvider
): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('serviceBusExplorer.namespace.export', async (item?: NamespaceItem) => {
      if (!item) return;
      try {
        const file = await withProgress('Exporting namespace…', () => exportNamespace(item.meta.id, store, admin));
        const target = await vscode.window.showSaveDialog({ filters: { JSON: ['json'] }, defaultUri: vscode.Uri.file(`${item.meta.displayName}.json`) });
        if (!target) return;
        await vscode.workspace.fs.writeFile(target, Buffer.from(safeStringify(file)));
        void vscode.window.showInformationMessage(`Exported to ${target.fsPath}`);
      } catch (e) { showError('Export failed', e); }
    }),

    vscode.commands.registerCommand('serviceBusExplorer.namespace.import', async (item?: NamespaceItem) => {
      if (!item) return;
      const picks = await vscode.window.showOpenDialog({ filters: { JSON: ['json'] } });
      if (!picks || picks.length === 0) return;
      let file;
      try {
        const buf = await vscode.workspace.fs.readFile(picks[0]);
        file = JSON.parse(Buffer.from(buf).toString('utf8'));
      } catch (e) { return showError('Cannot read file', e); }
      if (!validateExportFile(file)) return showError('Invalid file', new Error('Schema mismatch'));
      const modePick = await vscode.window.showQuickPick(['skip-if-exists', 'overwrite'], { placeHolder: 'Import mode' });
      if (!modePick) return;
      try {
        const report = await withProgress('Importing…', () => importNamespace(item.meta.id, file, modePick as ImportMode, admin));
        tree.invalidateNamespace(item.meta.id);
        const summary = `Created: ${report.created.length}, Updated: ${report.updated.length}, Skipped: ${report.skipped.length}, Failed: ${report.failed.length}`;
        if (report.failed.length) {
          void vscode.window.showWarningMessage(summary + ' (see Output for details)');
          for (const f of report.failed) console.error(f);
        } else {
          void vscode.window.showInformationMessage(summary);
        }
      } catch (e) { showError('Import failed', e); }
    }),

    vscode.commands.registerCommand('serviceBusExplorer.entity.export', async (item?: any) => {
      if (!item) return;
      try {
        let payload: any;
        if (item instanceof QueueItem) {
          const { properties } = await admin.getQueue(item.nsId, item.queueName);
          payload = { kind: 'queue', properties };
        } else if (item instanceof TopicItem) {
          const { properties } = await admin.getTopic(item.nsId, item.topicName);
          const subs = await admin.listSubscriptions(item.nsId, item.topicName);
          const subProps = await Promise.all(subs.map(async s => {
            const sp = (await admin.getSubscription(item.nsId, item.topicName, s.subscriptionName)).properties as any;
            const rules = await admin.listRules(item.nsId, item.topicName, s.subscriptionName);
            return { ...sp, rules };
          }));
          payload = { kind: 'topic', properties, subscriptions: subProps };
        } else if (item instanceof SubscriptionItem) {
          const { properties } = await admin.getSubscription(item.nsId, item.topicName, item.subscriptionName);
          const rules = await admin.listRules(item.nsId, item.topicName, item.subscriptionName);
          payload = { kind: 'subscription', properties, rules };
        } else if (item instanceof RuleItem) {
          const props = await admin.getRule(item.nsId, item.topicName, item.subscriptionName, item.ruleName);
          payload = { kind: 'rule', properties: props };
        } else return;
        const target = await vscode.window.showSaveDialog({ filters: { JSON: ['json'] }, defaultUri: vscode.Uri.file('entity.json') });
        if (!target) return;
        await vscode.workspace.fs.writeFile(target, Buffer.from(safeStringify(payload)));
        void vscode.window.showInformationMessage('Entity exported');
      } catch (e) { showError('Entity export failed', e); }
    }),

    vscode.commands.registerCommand('serviceBusExplorer.legacyXml.import', async (item?: NamespaceItem) => {
      if (!item) return;
      const picks = await vscode.window.showOpenDialog({ filters: { XML: ['xml'] } });
      if (!picks || picks.length === 0) return;
      try {
        const buf = await vscode.workspace.fs.readFile(picks[0]);
        const file = importLegacyXml(Buffer.from(buf).toString('utf8'));
        const report = await withProgress('Importing legacy XML…', () => importNamespace(item.meta.id, file, 'skip-if-exists', admin));
        tree.invalidateNamespace(item.meta.id);
        void vscode.window.showInformationMessage(`Imported. Created: ${report.created.length}, Skipped: ${report.skipped.length}, Failed: ${report.failed.length}`);
      } catch (e) { showError('Legacy XML import failed', e); }
    })
  );
}
