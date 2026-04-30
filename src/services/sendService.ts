import { ServiceBusMessage } from '@azure/service-bus';
import { ClientFactory } from './clientFactory';

export interface SendTarget {
  queue?: string;
  topic?: string;
}

export class SendService {
  constructor(private factory: ClientFactory) {}

  private async sender(nsId: string, target: SendTarget) {
    const client = await this.factory.getData(nsId);
    const name = target.queue ?? target.topic;
    if (!name) throw new Error('Target queue or topic required');
    return client.createSender(name);
  }

  async send(nsId: string, target: SendTarget, messages: ServiceBusMessage | ServiceBusMessage[]): Promise<number> {
    const arr = Array.isArray(messages) ? messages : [messages];
    if (arr.length === 0) return 0;
    const sender = await this.sender(nsId, target);
    try {
      const batch = await sender.createMessageBatch();
      const overflow: ServiceBusMessage[] = [];
      for (const m of arr) {
        if (!batch.tryAddMessage(m)) overflow.push(m);
      }
      await sender.sendMessages(batch);
      if (overflow.length) {
        await sender.sendMessages(overflow);
      }
      return arr.length;
    } finally {
      await sender.close();
    }
  }

  async schedule(nsId: string, target: SendTarget, messages: ServiceBusMessage[], when: Date): Promise<any[]> {
    const sender = await this.sender(nsId, target);
    try {
      return await sender.scheduleMessages(messages, when) as any[];
    } finally {
      await sender.close();
    }
  }

  async cancelScheduled(nsId: string, target: SendTarget, sequenceNumbers: any[]): Promise<void> {
    const sender = await this.sender(nsId, target);
    try {
      await sender.cancelScheduledMessages(sequenceNumbers as any);
    } finally {
      await sender.close();
    }
  }
}
