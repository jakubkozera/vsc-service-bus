import * as vscode from 'vscode';
import { NamespaceStore } from '../state/namespaceStore';
import { AdminService } from '../services/adminService';
import { TreeCache } from '../state/treeCache';
import {
  NamespaceItem,
  QueuesFolderItem,
  TopicsFolderItem,
  QueueItem,
  TopicItem,
  SubscriptionItem,
  RuleItem,
  DeadLetterItem,
  PlaceholderItem,
  SbeTreeItem
} from './treeItems';
import { Logger } from '../logging/logger';

export class NamespacesTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private treeFilter = '';

  constructor(
    private store: NamespaceStore,
    private admin: AdminService,
    private cache: TreeCache
  ) {
    store.onDidChange(() => this.refresh());
  }

  setFilter(filter: string): void {
    this.treeFilter = filter;
    this._onDidChangeTreeData.fire();
  }

  refresh(node?: vscode.TreeItem): void {
    if (!node) {
      this.cache.invalidateAll();
    } else if ('nsId' in node) {
      this.cache.invalidate((node as any).nsId);
    }
    this._onDidChangeTreeData.fire();
  }

  invalidateNamespace(nsId: string): void {
    this.cache.invalidate(nsId);
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  private matchesFilter(name: string): boolean {
    if (!this.treeFilter) return true;
    const f = this.treeFilter;
    if (f.startsWith('re:')) {
      try { return new RegExp(f.slice(3), 'i').test(name); } catch { return false; }
    }
    if (f.startsWith('^')) {
      return name.toLowerCase().startsWith(f.slice(1).toLowerCase());
    }
    return name.toLowerCase().includes(f.toLowerCase());
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    try {
      if (!element) {
        return this.store.list().map(n => new NamespaceItem(n));
      }
      if (element instanceof NamespaceItem) {
        return [
          new QueuesFolderItem(element.meta.id),
          new TopicsFolderItem(element.meta.id)
        ];
      }
      if (element instanceof QueuesFolderItem) {
        const c = this.cache.ensure(element.nsId);
        if (!c.queues) c.queues = await this.admin.listQueues(element.nsId);
        const filtered = c.queues.filter(q => this.matchesFilter(q.name));
        if (filtered.length === 0) return [new PlaceholderItem('No queues')];
        return filtered.map(q => new QueueItem(
          element.nsId, q.name, q.activeMessageCount, q.deadLetterMessageCount, q.scheduledMessageCount, q.transferDeadLetterMessageCount
        ));
      }
      if (element instanceof TopicsFolderItem) {
        const c = this.cache.ensure(element.nsId);
        if (!c.topics) c.topics = await this.admin.listTopics(element.nsId);
        const filtered = c.topics.filter(t => this.matchesFilter(t.name));
        if (filtered.length === 0) return [new PlaceholderItem('No topics')];
        return filtered.map(t => new TopicItem(element.nsId, t.name, t.subscriptionCount));
      }
      if (element instanceof TopicItem) {
        const c = this.cache.ensure(element.nsId);
        let subs = c.subs.get(element.topicName);
        if (!subs) {
          subs = await this.admin.listSubscriptions(element.nsId, element.topicName);
          c.subs.set(element.topicName, subs);
        }
        const filtered = subs.filter(s => this.matchesFilter(s.subscriptionName));
        if (filtered.length === 0) return [new PlaceholderItem('No subscriptions')];
        return filtered.map(s => new SubscriptionItem(
          element.nsId, element.topicName, s.subscriptionName, s.activeMessageCount, s.deadLetterMessageCount, s.transferDeadLetterMessageCount
        ));
      }
      if (element instanceof SubscriptionItem) {
        const items: vscode.TreeItem[] = [];
        // Rules
        try {
          const rules = await this.admin.listRules(element.nsId, element.topicName, element.subscriptionName);
          for (const r of rules) {
            const filterDesc = (r.filter as any)?.sqlExpression
              ? `SQL: ${(r.filter as any).sqlExpression}`
              : 'Correlation';
            items.push(new RuleItem(element.nsId, element.topicName, element.subscriptionName, r.name, filterDesc));
          }
        } catch (e) {
          Logger.warn('list rules', String(e));
        }
        items.push(new DeadLetterItem(element.nsId, { topic: element.topicName, subscription: element.subscriptionName }, element.dlq));
        if (element.transferDlq > 0) items.push(new DeadLetterItem(element.nsId, { topic: element.topicName, subscription: element.subscriptionName }, element.transferDlq, true));
        return items;
      }
      return [];
    } catch (e) {
      Logger.error('getChildren failed', e);
      return [new PlaceholderItem(`⚠ Error: ${(e as Error).message}`, 'warning')];
    }
  }
}
