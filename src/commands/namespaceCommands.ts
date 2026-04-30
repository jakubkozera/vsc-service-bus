import * as vscode from 'vscode';
import { NamespaceStore } from '../state/namespaceStore';
import { ClientFactory } from '../services/clientFactory';
import { AdminService } from '../services/adminService';
import { parseConnectionString } from '../auth/connectionString';
import { VsCodeMicrosoftCredential } from '../auth/vscodeMicrosoftCredential';
import { showError, withProgress } from '../utils/errors';
import { NamespaceItem } from '../providers/treeItems';

export function registerNamespaceCommands(
  ctx: vscode.ExtensionContext,
  store: NamespaceStore,
  factory: ClientFactory,
  admin: AdminService
): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('serviceBusExplorer.addNamespace', async () => {
      const choice = await vscode.window.showQuickPick(
        [
          { label: 'Connection string (SAS)', value: 'sas' as const },
          { label: 'Microsoft Entra ID (interactive)', value: 'aad' as const }
        ],
        { placeHolder: 'Select authentication mode' }
      );
      if (!choice) return;

      if (choice.value === 'sas') {
        const cs = await vscode.window.showInputBox({
          prompt: 'Paste the Service Bus connection string',
          ignoreFocusOut: true,
          password: true,
          validateInput: v => v && v.includes('Endpoint=') ? null : 'Invalid connection string'
        });
        if (!cs) return;
        try {
          const parsed = parseConnectionString(cs);
          const displayName = await vscode.window.showInputBox({
            prompt: 'Display name',
            value: parsed.fqdn.split('.')[0],
            ignoreFocusOut: true
          });
          if (!displayName) return;
          await store.add({
            displayName,
            fqdn: parsed.fqdn,
            authMode: 'sas',
            entityPath: parsed.entityPath
          }, cs);
          void vscode.window.showInformationMessage(`Added namespace: ${displayName}`);
        } catch (e) {
          showError('Failed to add namespace', e);
        }
      } else {
        const fqdn = await vscode.window.showInputBox({
          prompt: 'Namespace FQDN (e.g. mybus.servicebus.windows.net)',
          ignoreFocusOut: true,
          validateInput: v => v && /^[a-z0-9-]+\.servicebus\.windows\.net$/i.test(v) ? null : 'Expected <name>.servicebus.windows.net'
        });
        if (!fqdn) return;
        const tenantId = await vscode.window.showInputBox({
          prompt: 'Tenant ID (optional, default: organizations)',
          ignoreFocusOut: true
        });
        const displayName = await vscode.window.showInputBox({
          prompt: 'Display name',
          value: fqdn.split('.')[0],
          ignoreFocusOut: true
        });
        if (!displayName) return;
        const created = await store.add({
          displayName,
          fqdn,
          authMode: 'aad',
          tenantId: tenantId || undefined
        }, '');
        // Trigger interactive sign-in immediately so the user is not
        // surprised by an auth prompt later when opening a queue, and so
        // the VS Code 'microsoft' provider persists the session for reuse
        // across restarts.
        try {
          await withProgress(`Signing in to ${created.displayName}…`, async () => {
            const cred = new VsCodeMicrosoftCredential(created.tenantId);
            await cred.signIn();
          });
          void vscode.window.showInformationMessage(`Added namespace: ${displayName}`);
        } catch (e) {
          showError('Sign-in failed (namespace was added — you can retry from the tree)', e);
        }
      }
    }),

    vscode.commands.registerCommand('serviceBusExplorer.removeNamespace', async (item?: NamespaceItem) => {
      if (!item) return;
      const ok = await vscode.window.showWarningMessage(
        `Remove namespace "${item.meta.displayName}"?`,
        { modal: true },
        'Remove'
      );
      if (ok !== 'Remove') return;
      await factory.invalidate(item.meta.id);
      await store.remove(item.meta.id);
    }),

    vscode.commands.registerCommand('serviceBusExplorer.editNamespace', async (item?: NamespaceItem) => {
      if (!item) return;
      const newName = await vscode.window.showInputBox({
        prompt: 'New display name',
        value: item.meta.displayName,
        ignoreFocusOut: true
      });
      if (!newName) return;
      await store.update({ ...item.meta, displayName: newName });
    }),

    vscode.commands.registerCommand('serviceBusExplorer.testConnection', async (item?: NamespaceItem) => {
      if (!item) return;
      await withProgress(`Testing connection: ${item.meta.displayName}`, async () => {
        try {
          const props = await admin.getNamespaceProperties(item.meta.id);
          void vscode.window.showInformationMessage(`Connected: ${props.name} (SKU: ${props.messagingSku})`);
        } catch (e) {
          showError('Connection failed', e);
        }
      });
    })
  );
}
