import * as vscode from 'vscode';
import { NamespaceMetadata } from '../models/namespace';

let _extensionUri: vscode.Uri;

export function setExtensionUri(uri: vscode.Uri): void {
  _extensionUri = uri;
}

function mediaUri(filename: string): vscode.Uri {
  return vscode.Uri.joinPath(_extensionUri, 'media', filename);
}

function themedIcon(baseName: string): { light: vscode.Uri; dark: vscode.Uri } {
  return {
    light: mediaUri(`${baseName}-light.svg`),
    dark: mediaUri(`${baseName}-dark.svg`),
  };
}

export class NamespaceItem extends vscode.TreeItem {
  constructor(public readonly meta: NamespaceMetadata) {
    super(meta.displayName, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'namespace';
    this.id = `ns:${meta.id}`;
    this.tooltip = new vscode.MarkdownString(
      `**${meta.displayName}**\n\n` +
      `- FQDN: \`${meta.fqdn}\`\n` +
      `- Auth: ${meta.authMode.toUpperCase()}\n` +
      (meta.tenantId ? `- Tenant: \`${meta.tenantId}\`\n` : '') +
      (meta.lastUsedAt ? `- Last used: ${meta.lastUsedAt}\n` : '')
    );
    this.iconPath = mediaUri('namespace.svg');
    this.description = meta.fqdn;
  }
}

export class QueuesFolderItem extends vscode.TreeItem {
  constructor(public readonly nsId: string) {
    super('Queues', vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'queuesFolder';
    this.id = `ns:${nsId}:queues`;
    this.iconPath = mediaUri('queue.svg');
  }
}

export class TopicsFolderItem extends vscode.TreeItem {
  constructor(public readonly nsId: string) {
    super('Topics', vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'topicsFolder';
    this.id = `ns:${nsId}:topics`;
    this.iconPath = mediaUri('topic.svg');
  }
}

export class QueueItem extends vscode.TreeItem {
  constructor(
    public readonly nsId: string,
    public readonly queueName: string,
    public readonly active: number,
    public readonly dlq: number,
    public readonly scheduled: number,
    public readonly transferDlq: number
  ) {
    super(queueName, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'queue';
    this.id = `ns:${nsId}:q:${queueName}`;
    this.description = `(${active}, ${dlq}, ${scheduled})`;
    this.iconPath = mediaUri('queue.svg');
    this.tooltip = new vscode.MarkdownString(
      `**${queueName}**\n\n` +
      `- Active: ${active}\n- Dead-letter: ${dlq}\n- Scheduled: ${scheduled}\n- Transfer DLQ: ${transferDlq}\n`
    );
    this.command = { command: 'serviceBusExplorer.queue.open', title: 'Open Queue', arguments: [this] };
  }
}

export class TopicItem extends vscode.TreeItem {
  constructor(
    public readonly nsId: string,
    public readonly topicName: string,
    public readonly subscriptionCount: number
  ) {
    super(topicName, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'topic';
    this.id = `ns:${nsId}:t:${topicName}`;
    this.description = `${subscriptionCount} sub${subscriptionCount === 1 ? '' : 's'}`;
    this.iconPath = mediaUri('topic.svg');
    this.command = { command: 'serviceBusExplorer.topic.open', title: 'Open Topic', arguments: [this] };
  }
}

export class SubscriptionItem extends vscode.TreeItem {
  constructor(
    public readonly nsId: string,
    public readonly topicName: string,
    public readonly subscriptionName: string,
    public readonly active: number,
    public readonly dlq: number,
    public readonly transferDlq: number
  ) {
    super(subscriptionName, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'subscription';
    this.id = `ns:${nsId}:t:${topicName}:s:${subscriptionName}`;
    this.description = `(${active}, ${dlq}, ${transferDlq})`;
    this.iconPath = new vscode.ThemeIcon('rss');
    this.tooltip = new vscode.MarkdownString(
      `**${subscriptionName}**\n\nTopic: \`${topicName}\`\n\n- Active: ${active}\n- DLQ: ${dlq}\n- Transfer DLQ: ${transferDlq}`
    );
    this.command = { command: 'serviceBusExplorer.subscription.edit', title: 'Open Subscription', arguments: [this] };
  }
}

export class RuleItem extends vscode.TreeItem {
  constructor(
    public readonly nsId: string,
    public readonly topicName: string,
    public readonly subscriptionName: string,
    public readonly ruleName: string,
    public readonly filterDescription: string
  ) {
    super(ruleName, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'rule';
    this.id = `ns:${nsId}:t:${topicName}:s:${subscriptionName}:r:${ruleName}`;
    this.description = filterDescription;
    this.iconPath = new vscode.ThemeIcon('filter');
  }
}

export class DeadLetterItem extends vscode.TreeItem {
  constructor(
    public readonly nsId: string,
    public readonly source: { queue?: string; topic?: string; subscription?: string },
    public readonly count: number,
    transfer = false
  ) {
    super(`${transfer ? 'Transfer dead-letter' : 'Dead-letter'} (${count})`, vscode.TreeItemCollapsibleState.None);
    this.contextValue = transfer ? 'transferDeadLetter' : 'deadLetter';
    this.iconPath = new vscode.ThemeIcon(count > 0 ? 'warning' : 'archive');
  }
}

export class PlaceholderItem extends vscode.TreeItem {
  constructor(label: string, icon = 'info') {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'placeholder';
  }
}

export type SbeTreeItem =
  | NamespaceItem
  | QueuesFolderItem
  | TopicsFolderItem
  | QueueItem
  | TopicItem
  | SubscriptionItem
  | RuleItem
  | DeadLetterItem
  | PlaceholderItem;
