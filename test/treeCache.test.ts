import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TreeCache } from '../src/state/treeCache';

describe('TreeCache', () => {
  let cache: TreeCache;

  beforeEach(() => {
    cache = new TreeCache();
  });

  it('returns undefined for unknown namespace', () => {
    expect(cache.get('unknown')).toBeUndefined();
  });

  it('ensure creates a new entry', () => {
    const entry = cache.ensure('ns1');
    expect(entry).toBeDefined();
    expect(entry.subs).toBeInstanceOf(Map);
  });

  it('ensure returns existing entry within TTL', () => {
    const first = cache.ensure('ns1');
    first.queues = [{ name: 'q1', activeMessageCount: 5, deadLetterMessageCount: 0, scheduledMessageCount: 0, transferDeadLetterMessageCount: 0 }];
    const second = cache.ensure('ns1');
    expect(second.queues).toEqual(first.queues);
  });

  it('invalidate removes a specific namespace', () => {
    cache.ensure('ns1');
    cache.ensure('ns2');
    cache.invalidate('ns1');
    expect(cache.get('ns1')).toBeUndefined();
    expect(cache.get('ns2')).toBeDefined();
  });

  it('invalidateAll clears all namespaces', () => {
    cache.ensure('ns1');
    cache.ensure('ns2');
    cache.invalidateAll();
    expect(cache.get('ns1')).toBeUndefined();
    expect(cache.get('ns2')).toBeUndefined();
  });

  it('expired entries are removed on get', () => {
    vi.useFakeTimers();
    cache.ensure('ns1');
    vi.advanceTimersByTime(31_000); // TTL is 30s
    expect(cache.get('ns1')).toBeUndefined();
    vi.useRealTimers();
  });
});
