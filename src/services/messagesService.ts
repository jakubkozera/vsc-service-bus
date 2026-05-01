import {
  ServiceBusClient,
  ServiceBusReceiver,
  ServiceBusReceivedMessage,
  ServiceBusMessage,
  ServiceBusReceiverOptions
} from '@azure/service-bus';
import Long from 'long';
import { ClientFactory } from './clientFactory';
import { Logger } from '../logging/logger';

export type SubQueue = 'deadLetter' | 'transferDeadLetter';

export interface MessageSource {
  queue?: string;
  topic?: string;
  subscription?: string;
  subQueue?: SubQueue;
}

export class MessagesService {
  constructor(private factory: ClientFactory) {}

  private async createReceiver(nsId: string, src: MessageSource, opts?: ServiceBusReceiverOptions): Promise<{ client: ServiceBusClient; receiver: ServiceBusReceiver; }> {
    const client = await this.factory.getData(nsId);
    let receiver: ServiceBusReceiver;
    if (src.queue) {
      receiver = client.createReceiver(src.queue, opts);
    } else if (src.topic && src.subscription) {
      receiver = client.createReceiver(src.topic, src.subscription, opts);
    } else {
      throw new Error('Invalid source');
    }
    return { client, receiver };
  }

  async peek(nsId: string, src: MessageSource, count: number, fromSequenceNumber?: bigint): Promise<ServiceBusReceivedMessage[]> {
    const { receiver } = await this.createReceiver(nsId, src, src.subQueue ? { subQueueType: src.subQueue } : undefined);
    try {
      const from = fromSequenceNumber !== undefined ? Long.fromString(fromSequenceNumber.toString()) : Long.ZERO;
      return await receiver.peekMessages(count, { fromSequenceNumber: from });
    } finally {
      await receiver.close();
    }
  }

  /**
   * Peek scheduled messages by iterating through the queue in batches.
   * Unlike `peek` + client-side filter, this keeps peeking until it finds
   * the desired count of scheduled messages or exhausts the queue.
   */
  async peekScheduled(nsId: string, src: MessageSource, count: number): Promise<ServiceBusReceivedMessage[]> {
    const { receiver } = await this.createReceiver(nsId, src);
    try {
      const result: ServiceBusReceivedMessage[] = [];
      let from: Long = Long.ZERO;
      const batchSize = 200;

      while (result.length < count) {
        const batch = await receiver.peekMessages(batchSize, { fromSequenceNumber: from });
        if (batch.length === 0) { break; }

        for (const m of batch) {
          if (m.state === 'scheduled') {
            result.push(m);
            if (result.length >= count) { break; }
          }
        }

        const lastSeq = batch[batch.length - 1].sequenceNumber;
        if (lastSeq === undefined || lastSeq === null) { break; }
        const nextFrom = Long.fromValue(lastSeq as any).add(1);
        if (nextFrom.lte(from)) { break; }
        from = nextFrom;
      }

      return result;
    } finally {
      await receiver.close();
    }
  }

  async receiveAndDelete(nsId: string, src: MessageSource, count: number, timeoutMs: number): Promise<ServiceBusReceivedMessage[]> {
    const { receiver } = await this.createReceiver(nsId, src, {
      receiveMode: 'receiveAndDelete',
      ...(src.subQueue ? { subQueueType: src.subQueue } : {})
    });
    try {
      return await receiver.receiveMessages(count, { maxWaitTimeInMs: timeoutMs });
    } finally {
      await receiver.close();
    }
  }

  /**
   * Open a long-lived peekLock receiver. Caller is responsible for closing it.
   */
  async openPeekLockReceiver(nsId: string, src: MessageSource): Promise<ServiceBusReceiver> {
    const { receiver } = await this.createReceiver(nsId, src, {
      receiveMode: 'peekLock',
      ...(src.subQueue ? { subQueueType: src.subQueue } : {})
    });
    return receiver;
  }

  /**
   * Bulk delete-by-sequence-numbers using peekLock + complete.
   */
  async deleteBySequence(nsId: string, src: MessageSource, sequenceNumbers: bigint[], timeoutMs = 30_000, maxAttempts = 5): Promise<{ deleted: number; remaining: bigint[] }> {
    const target = new Set(sequenceNumbers.map(s => s.toString()));
    const { receiver } = await this.createReceiver(nsId, src, {
      receiveMode: 'peekLock',
      ...(src.subQueue ? { subQueueType: src.subQueue } : {})
    });
    let deleted = 0;
    try {
      const start = Date.now();
      let attempts = 0;
      while (target.size > 0 && Date.now() - start < timeoutMs && attempts < maxAttempts) {
        attempts++;
        const batch = await receiver.receiveMessages(Math.min(target.size, 50), { maxWaitTimeInMs: 2000 });
        if (batch.length === 0) break;
        for (const m of batch) {
          const s = m.sequenceNumber?.toString();
          if (s && target.has(s)) {
            await receiver.completeMessage(m);
            target.delete(s);
            deleted++;
          } else {
            try { await receiver.abandonMessage(m); } catch (e) { Logger.debug('abandon', String(e)); }
          }
        }
      }
    } finally {
      await receiver.close();
    }
    return { deleted, remaining: Array.from(target).map(s => BigInt(s)) };
  }

  toServiceBusMessage(received: ServiceBusReceivedMessage, stripDlqProps = true): ServiceBusMessage {
    const msg: ServiceBusMessage = {
      body: received.body,
      contentType: received.contentType,
      correlationId: received.correlationId,
      messageId: received.messageId,
      partitionKey: received.partitionKey,
      replyTo: received.replyTo,
      replyToSessionId: received.replyToSessionId,
      sessionId: received.sessionId,
      subject: received.subject,
      timeToLive: received.timeToLive,
      to: received.to,
      applicationProperties: { ...(received.applicationProperties ?? {}) }
    };
    if (stripDlqProps && msg.applicationProperties) {
      delete msg.applicationProperties['DeadLetterReason'];
      delete msg.applicationProperties['DeadLetterErrorDescription'];
      delete msg.applicationProperties['DeadLetterSource'];
    }
    return msg;
  }
}
