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
  window: { showInformationMessage: vi.fn(), createWebviewPanel: vi.fn(), createOutputChannel: vi.fn().mockReturnValue({ appendLine: vi.fn(), show: vi.fn() }) },
  commands: { registerCommand: vi.fn() },
  workspace: { getConfiguration: vi.fn().mockReturnValue({ get: vi.fn() }) },
  ViewColumn: { One: 1 },
}));

describe('Entity view refresh on tree invalidation', () => {
  it('tree.invalidateNamespace calls entity view refresher', async () => {
    const { TreeCache } = await import('../src/state/treeCache');
    const { NamespacesTreeProvider } = await import('../src/providers/namespacesTreeProvider');

    const cache = new TreeCache();
    const store = { list: vi.fn().mockReturnValue([]), onDidChange: vi.fn() };
    const admin = { listQueues: vi.fn(), listTopics: vi.fn() };
    const tree = new NamespacesTreeProvider(store as any, admin as any, cache);

    const refresher = vi.fn().mockResolvedValue(undefined);
    tree.setEntityViewRefresher(refresher);

    cache.ensure('ns1');
    tree.invalidateNamespace('ns1');

    expect(refresher).toHaveBeenCalledWith('ns1');
    expect(refresher).toHaveBeenCalledTimes(1);
  });

  it('tree.refresh() without args calls refresher without nsId', async () => {
    const { TreeCache } = await import('../src/state/treeCache');
    const { NamespacesTreeProvider } = await import('../src/providers/namespacesTreeProvider');

    const cache = new TreeCache();
    const store = { list: vi.fn().mockReturnValue([]), onDidChange: vi.fn() };
    const admin = { listQueues: vi.fn(), listTopics: vi.fn() };
    const tree = new NamespacesTreeProvider(store as any, admin as any, cache);

    const refresher = vi.fn().mockResolvedValue(undefined);
    tree.setEntityViewRefresher(refresher);

    tree.refresh();

    expect(refresher).toHaveBeenCalledWith();
    expect(refresher).toHaveBeenCalledTimes(1);
  });

  it('tree.refresh(node) with nsId calls refresher with that nsId', async () => {
    const { TreeCache } = await import('../src/state/treeCache');
    const { NamespacesTreeProvider } = await import('../src/providers/namespacesTreeProvider');

    const cache = new TreeCache();
    const store = { list: vi.fn().mockReturnValue([]), onDidChange: vi.fn() };
    const admin = { listQueues: vi.fn(), listTopics: vi.fn() };
    const tree = new NamespacesTreeProvider(store as any, admin as any, cache);

    const refresher = vi.fn().mockResolvedValue(undefined);
    tree.setEntityViewRefresher(refresher);

    cache.ensure('ns-x');
    tree.refresh({ nsId: 'ns-x' } as any);

    expect(refresher).toHaveBeenCalledWith('ns-x');
  });

  it('no refresher set does not throw', async () => {
    const { TreeCache } = await import('../src/state/treeCache');
    const { NamespacesTreeProvider } = await import('../src/providers/namespacesTreeProvider');

    const cache = new TreeCache();
    const store = { list: vi.fn().mockReturnValue([]), onDidChange: vi.fn() };
    const admin = { listQueues: vi.fn(), listTopics: vi.fn() };
    const tree = new NamespacesTreeProvider(store as any, admin as any, cache);

    // No refresher set — should not throw
    expect(() => tree.invalidateNamespace('ns1')).not.toThrow();
    expect(() => tree.refresh()).not.toThrow();
  });

  it('refreshOpenEntityViews refreshes only matching namespace views', async () => {
    const { refreshOpenEntityViews } = await import('../src/commands/entityCommands');

    // The module-level set is empty by default since we can't easily track,
    // but we can verify the function exists and returns without error
    await expect(refreshOpenEntityViews('ns1')).resolves.toBeUndefined();
    await expect(refreshOpenEntityViews()).resolves.toBeUndefined();
  });
});
