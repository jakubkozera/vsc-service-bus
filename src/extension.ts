import * as vscode from 'vscode';
import { Logger } from './logging/logger';
import { NamespaceStore } from './state/namespaceStore';
import { TreeCache } from './state/treeCache';
import { ClientFactory } from './services/clientFactory';
import { AdminService } from './services/adminService';
import { MessagesService } from './services/messagesService';
import { SendService } from './services/sendService';
import { PurgeService } from './services/purgeService';
import { ListenerService } from './services/listenerService';
import { NamespacesTreeProvider } from './providers/namespacesTreeProvider';
import { setExtensionUri } from './providers/treeItems';
import { registerNamespaceCommands } from './commands/namespaceCommands';
import { registerEntityCommands } from './commands/entityCommands';
import { registerMessageCommands } from './commands/messageCommands';
import { registerSendCommands } from './commands/sendCommands';
import { registerDashboardCommands } from './commands/dashboardCommands';
import { registerImportExportCommands } from './commands/importExportCommands';
import { registerAdvancedCommands } from './commands/advancedCommands';

let factoryRef: ClientFactory | undefined;

export function activate(context: vscode.ExtensionContext): void {
  Logger.info('Service Bus Explorer activating');

  setExtensionUri(context.extensionUri);

  const store = new NamespaceStore(context);
  const factory = new ClientFactory(store);
  factoryRef = factory;
  const cache = new TreeCache();
  const admin = new AdminService(factory);
  const messages = new MessagesService(factory);
  const send = new SendService(factory);
  const purge = new PurgeService(admin, factory, messages);
  const listener = new ListenerService(factory);

  const tree = new NamespacesTreeProvider(store, admin, cache);
  const view = vscode.window.createTreeView('serviceBusExplorer.namespacesView', {
    treeDataProvider: tree,
    showCollapseAll: true,
    canSelectMany: true
  });
  context.subscriptions.push(view);

  registerNamespaceCommands(context, store, factory, admin);
  registerEntityCommands(context, admin, tree, purge, send, messages);
  registerMessageCommands(context, messages, send, admin, tree);
  registerSendCommands(context, send, tree, admin);
  registerDashboardCommands(context, admin);
  registerImportExportCommands(context, store, admin, tree);
  registerAdvancedCommands(context, purge, listener, tree, admin);

  context.subscriptions.push(
    vscode.commands.registerCommand('serviceBusExplorer.hello', () => {
      void vscode.window.showInformationMessage('Hello from Service Bus Explorer');
    })
  );

  Logger.info(`Activated with ${store.list().length} namespace(s)`);
}

export async function deactivate(): Promise<void> {
  Logger.info('Service Bus Explorer deactivating');
  if (factoryRef) {
    try { await factoryRef.dispose(); } catch (e) { Logger.warn('factory dispose', String(e)); }
  }
  Logger.dispose();
}
