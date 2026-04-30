import { AdminService } from './adminService';
import { ClientFactory } from './clientFactory';
import { MessageSource, MessagesService } from './messagesService';
import { Logger } from '../logging/logger';

export type PurgeStrategy = 'receiveAndDelete' | 'deleteAndRecreate';

export class PurgeService {
  constructor(private admin: AdminService, private factory: ClientFactory, private messages: MessagesService) {}

  async purge(nsId: string, src: MessageSource, strategy: PurgeStrategy, batchSize = 100, timeoutMs = 60_000, onProgress?: (deleted: number) => void): Promise<{ deleted: number }> {
    if (strategy === 'deleteAndRecreate') {
      if (src.queue) {
        const { properties } = await this.admin.getQueue(nsId, src.queue);
        await this.admin.deleteQueue(nsId, src.queue);
        const { name, ...opts } = properties as any;
        await this.admin.createQueue(nsId, src.queue, opts);
        return { deleted: -1 };
      }
      if (src.topic && src.subscription) {
        const { properties } = await this.admin.getSubscription(nsId, src.topic, src.subscription);
        await this.admin.deleteSubscription(nsId, src.topic, src.subscription);
        const { topicName, subscriptionName, ...opts } = properties as any;
        await this.admin.createSubscription(nsId, src.topic, src.subscription, opts);
        return { deleted: -1 };
      }
      throw new Error('Invalid source');
    }
    // receiveAndDelete loop
    const start = Date.now();
    let deleted = 0;
    while (Date.now() - start < timeoutMs) {
      try {
        const batch = await this.messages.receiveAndDelete(nsId, src, batchSize, 2000);
        if (batch.length === 0) break;
        deleted += batch.length;
        onProgress?.(deleted);
      } catch (e) {
        Logger.warn('purge batch failed', String(e));
        break;
      }
    }
    return { deleted };
  }
}
