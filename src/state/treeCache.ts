import { QueueRuntime, TopicRuntime, SubscriptionRuntime } from '../models/namespace';

interface NsCache {
  queues?: QueueRuntime[];
  topics?: TopicRuntime[];
  subs: Map<string, SubscriptionRuntime[]>; // by topic
  expiresAt: number;
}

const TTL_MS = 30_000;

export class TreeCache {
  private map = new Map<string, NsCache>();

  get(nsId: string): NsCache | undefined {
    const c = this.map.get(nsId);
    if (!c) return undefined;
    if (c.expiresAt < Date.now()) {
      this.map.delete(nsId);
      return undefined;
    }
    return c;
  }

  ensure(nsId: string): NsCache {
    let c = this.get(nsId);
    if (!c) {
      c = { subs: new Map(), expiresAt: Date.now() + TTL_MS };
      this.map.set(nsId, c);
    }
    return c;
  }

  invalidate(nsId: string): void {
    this.map.delete(nsId);
  }

  invalidateAll(): void {
    this.map.clear();
  }
}
