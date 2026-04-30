import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TreeCache } from '../src/state/treeCache';

// Mock vscode module
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
}));

// Must import after mock is set up
const { NamespacesTreeProvider } = await import('../src/providers/namespacesTreeProvider');

// Create mocks
function createMockStore() {
  return {
    list: vi.fn().mockReturnValue([]),
    onDidChange: vi.fn(),
  };
}

function createMockAdmin() {
  return {
    listQueues: vi.fn().mockResolvedValue([
      { name: 'queue1', activeMessageCount: 10, deadLetterMessageCount: 0, scheduledMessageCount: 0, transferDeadLetterMessageCount: 0 },
    ]),
    listTopics: vi.fn().mockResolvedValue([]),
    listSubscriptions: vi.fn().mockResolvedValue([]),
    listRules: vi.fn().mockResolvedValue([]),
  };
}

describe('NamespacesTreeProvider.refresh', () => {
  let store: ReturnType<typeof createMockStore>;
  let admin: ReturnType<typeof createMockAdmin>;
  let cache: TreeCache;
  let tree: InstanceType<typeof NamespacesTreeProvider>;

  beforeEach(() => {
    store = createMockStore();
    admin = createMockAdmin();
    cache = new TreeCache();
    tree = new NamespacesTreeProvider(store as any, admin as any, cache);
  });

  it('refresh() without args invalidates entire cache', () => {
    cache.ensure('ns1');
    cache.ensure('ns2');
    tree.refresh();
    expect(cache.get('ns1')).toBeUndefined();
    expect(cache.get('ns2')).toBeUndefined();
  });

  it('refresh(node) with nsId invalidates that namespace cache', () => {
    cache.ensure('ns1');
    cache.ensure('ns2');
    const fakeNode = { nsId: 'ns1', label: 'queue1' } as any;
    tree.refresh(fakeNode);
    expect(cache.get('ns1')).toBeUndefined();
    expect(cache.get('ns2')).toBeDefined();
  });

  it('invalidateNamespace invalidates cache and fires change event', () => {
    cache.ensure('ns1');
    const handler = vi.fn();
    tree.onDidChangeTreeData(handler);
    tree.invalidateNamespace('ns1');
    expect(cache.get('ns1')).toBeUndefined();
    expect(handler).toHaveBeenCalled();
  });

  it('refresh after send causes fresh data fetch on next getChildren', async () => {
    // Simulate initial fetch
    const folderItem = { nsId: 'ns1', contextValue: 'queuesFolder' };
    Object.setPrototypeOf(folderItem, Object.getPrototypeOf(
      new (await import('../src/providers/treeItems')).QueuesFolderItem('ns1')
    ));

    // First call caches
    await tree.getChildren(folderItem as any);
    expect(admin.listQueues).toHaveBeenCalledTimes(1);

    // Simulate send → invalidate
    tree.invalidateNamespace('ns1');

    // Update mock to return new count
    admin.listQueues.mockResolvedValue([
      { name: 'queue1', activeMessageCount: 15, deadLetterMessageCount: 0, scheduledMessageCount: 0, transferDeadLetterMessageCount: 0 },
    ]);

    // Next getChildren should re-fetch
    const children = await tree.getChildren(folderItem as any);
    expect(admin.listQueues).toHaveBeenCalledTimes(2);
    expect((children[0] as any).active).toBe(15);
  });
});
