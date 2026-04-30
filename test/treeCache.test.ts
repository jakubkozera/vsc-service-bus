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

  describe('getAvailableTargets', () => {
    it('returns undefined if namespace not cached', () => {
      expect(cache.getAvailableTargets('unknown')).toBeUndefined();
    });

    it('returns undefined if queues or topics are not populated', () => {
      cache.ensure('ns1');
      expect(cache.getAvailableTargets('ns1')).toBeUndefined();
    });

    it('returns undefined if only queues are populated', () => {
      const entry = cache.ensure('ns1');
      entry.queues = [{ name: 'q1', activeMessageCount: 0, deadLetterMessageCount: 0, scheduledMessageCount: 0, transferDeadLetterMessageCount: 0, totalMessageCount: 0, sizeInBytes: 0 }];
      expect(cache.getAvailableTargets('ns1')).toBeUndefined();
    });

    it('returns combined list when both queues and topics are cached', () => {
      const entry = cache.ensure('ns1');
      entry.queues = [
        { name: 'q1', activeMessageCount: 0, deadLetterMessageCount: 0, scheduledMessageCount: 0, transferDeadLetterMessageCount: 0, totalMessageCount: 0, sizeInBytes: 0 },
        { name: 'q2', activeMessageCount: 0, deadLetterMessageCount: 0, scheduledMessageCount: 0, transferDeadLetterMessageCount: 0, totalMessageCount: 0, sizeInBytes: 0 },
      ];
      entry.topics = [
        { name: 't1', sizeInBytes: 0, scheduledMessageCount: 0, subscriptionCount: 1 },
      ];

      const result = cache.getAvailableTargets('ns1');
      expect(result).toEqual([
        { name: 'q1', kind: 'queue' },
        { name: 'q2', kind: 'queue' },
        { name: 't1', kind: 'topic' },
      ]);
    });

    it('returns undefined for expired entries', () => {
      vi.useFakeTimers();
      const entry = cache.ensure('ns1');
      entry.queues = [{ name: 'q1', activeMessageCount: 0, deadLetterMessageCount: 0, scheduledMessageCount: 0, transferDeadLetterMessageCount: 0, totalMessageCount: 0, sizeInBytes: 0 }];
      entry.topics = [{ name: 't1', sizeInBytes: 0, scheduledMessageCount: 0, subscriptionCount: 0 }];
      vi.advanceTimersByTime(31_000);
      expect(cache.getAvailableTargets('ns1')).toBeUndefined();
      vi.useRealTimers();
    });

    it('returns fresh data after invalidate and re-populate', () => {
      const entry = cache.ensure('ns1');
      entry.queues = [{ name: 'old-q', activeMessageCount: 0, deadLetterMessageCount: 0, scheduledMessageCount: 0, transferDeadLetterMessageCount: 0, totalMessageCount: 0, sizeInBytes: 0 }];
      entry.topics = [{ name: 'old-t', sizeInBytes: 0, scheduledMessageCount: 0, subscriptionCount: 0 }];

      cache.invalidate('ns1');
      expect(cache.getAvailableTargets('ns1')).toBeUndefined();

      const newEntry = cache.ensure('ns1');
      newEntry.queues = [{ name: 'new-q', activeMessageCount: 1, deadLetterMessageCount: 0, scheduledMessageCount: 0, transferDeadLetterMessageCount: 0, totalMessageCount: 1, sizeInBytes: 100 }];
      newEntry.topics = [{ name: 'new-t', sizeInBytes: 200, scheduledMessageCount: 0, subscriptionCount: 2 }];

      expect(cache.getAvailableTargets('ns1')).toEqual([
        { name: 'new-q', kind: 'queue' },
        { name: 'new-t', kind: 'topic' },
      ]);
    });
  });
});
