import { ServiceBusReceiver, ServiceBusReceivedMessage } from '@azure/service-bus';
import * as vscode from 'vscode';
import { ClientFactory } from './clientFactory';
import { MessageSource } from './messagesService';
import { Logger } from '../logging/logger';

export interface ListenerHandle {
  stop(): Promise<void>;
  onMessage: vscode.Event<ServiceBusReceivedMessage>;
  onError: vscode.Event<Error>;
}

export class ListenerService {
  constructor(private factory: ClientFactory) {}

  async start(nsId: string, src: MessageSource, autoComplete: boolean): Promise<ListenerHandle> {
    const client = await this.factory.getData(nsId);
    let receiver: ServiceBusReceiver;
    if (src.queue) {
      receiver = client.createReceiver(src.queue, { receiveMode: 'peekLock' });
    } else if (src.topic && src.subscription) {
      receiver = client.createReceiver(src.topic, src.subscription, { receiveMode: 'peekLock' });
    } else {
      throw new Error('Invalid source');
    }
    const onMsg = new vscode.EventEmitter<ServiceBusReceivedMessage>();
    const onErr = new vscode.EventEmitter<Error>();
    const closer = receiver.subscribe({
      processMessage: async (m) => {
        onMsg.fire(m);
        if (autoComplete) {
          try { await receiver.completeMessage(m); } catch (e) { Logger.warn('autoComplete', String(e)); }
        }
      },
      processError: async (args) => {
        onErr.fire(args.error as Error);
      }
    });
    return {
      onMessage: onMsg.event,
      onError: onErr.event,
      stop: async () => {
        try { await closer.close(); } catch (e) { Logger.debug('listener close', String(e)); }
        try { await receiver.close(); } catch (e) { Logger.debug('receiver close', String(e)); }
        onMsg.dispose();
        onErr.dispose();
      }
    };
  }
}
