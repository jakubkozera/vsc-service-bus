import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode
vi.mock('vscode', () => ({
  TreeItem: class { constructor(public label: string, public collapsibleState?: number) {} },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  EventEmitter: class {
    private listeners: Function[] = [];
    event = (listener: Function) => { this.listeners.push(listener); return { dispose: () => {} }; };
    fire = (arg?: any) => { this.listeners.forEach(l => l(arg)); };
  },
  Uri: { joinPath: (...args: any[]) => ({ toString: () => args.join('/') }) },
  ThemeIcon: class { constructor(public id: string) {} },
  MarkdownString: class { constructor(public value: string) {} },
  window: { showInformationMessage: vi.fn(), createWebviewPanel: vi.fn() },
  commands: { registerCommand: vi.fn() },
  workspace: { getConfiguration: vi.fn().mockReturnValue({ get: vi.fn() }) },
  ViewColumn: { One: 1 },
}));

describe('Send/Message commands trigger tree refresh', () => {
  it('invalidateNamespace clears cached queues so next fetch is fresh', async () => {
    const { TreeCache } = await import('../src/state/treeCache');
    const cache = new TreeCache();

    // Simulate cached queue data
    const entry = cache.ensure('ns1');
    entry.queues = [
      { name: 'test', activeMessageCount: 1, deadLetterMessageCount: 0, scheduledMessageCount: 0, transferDeadLetterMessageCount: 0 },
    ];

    // Verify cache has data
    expect(cache.get('ns1')?.queues).toHaveLength(1);
    expect(cache.get('ns1')?.queues?.[0].activeMessageCount).toBe(1);

    // Simulate what happens after send: invalidateNamespace
    cache.invalidate('ns1');

    // Cache is gone — next getChildren will re-fetch from admin
    expect(cache.get('ns1')).toBeUndefined();
  });

  it('refresh with a QueueItem-like node invalidates its namespace', async () => {
    const { TreeCache } = await import('../src/state/treeCache');
    const { NamespacesTreeProvider } = await import('../src/providers/namespacesTreeProvider');

    const cache = new TreeCache();
    const store = { list: vi.fn().mockReturnValue([]), onDidChange: vi.fn() };
    const admin = { listQueues: vi.fn(), listTopics: vi.fn() };
    const tree = new NamespacesTreeProvider(store as any, admin as any, cache);

    // Setup cache
    const entry = cache.ensure('ns-abc');
    entry.queues = [
      { name: 'my-queue', activeMessageCount: 3, deadLetterMessageCount: 0, scheduledMessageCount: 0, transferDeadLetterMessageCount: 0 },
    ];

    // Simulate refreshNode on a queue item (has nsId property)
    tree.refresh({ nsId: 'ns-abc', queueName: 'my-queue' } as any);

    // Cache for that namespace should be invalidated
    expect(cache.get('ns-abc')).toBeUndefined();
  });

  it('refresh fires onDidChangeTreeData event', async () => {
    const { TreeCache } = await import('../src/state/treeCache');
    const { NamespacesTreeProvider } = await import('../src/providers/namespacesTreeProvider');

    const cache = new TreeCache();
    const store = { list: vi.fn().mockReturnValue([]), onDidChange: vi.fn() };
    const admin = { listQueues: vi.fn(), listTopics: vi.fn() };
    const tree = new NamespacesTreeProvider(store as any, admin as any, cache);

    const handler = vi.fn();
    tree.onDidChangeTreeData(handler);

    tree.refresh({ nsId: 'ns1' } as any);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
