import {
  ServiceBusAdministrationClient,
  CreateQueueOptions,
  QueueProperties,
  CreateTopicOptions,
  TopicProperties,
  CreateSubscriptionOptions,
  SubscriptionProperties,
  RuleProperties
} from '@azure/service-bus';
import { ClientFactory } from './clientFactory';
import { QueueRuntime, SubscriptionRuntime, TopicRuntime } from '../models/namespace';
import { Logger } from '../logging/logger';

const CONCURRENCY = 8;

async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, limit = CONCURRENCY): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export class AdminService {
  constructor(private factory: ClientFactory) {}

  private async admin(nsId: string): Promise<ServiceBusAdministrationClient> {
    return this.factory.getAdmin(nsId);
  }

  // Namespace
  async getNamespaceProperties(nsId: string) {
    const a = await this.admin(nsId);
    return a.getNamespaceProperties();
  }

  // Queues
  async listQueues(nsId: string): Promise<QueueRuntime[]> {
    const a = await this.admin(nsId);
    const names: string[] = [];
    for await (const q of a.listQueues()) {
      names.push(q.name);
    }
    return pMap(names, async (name) => {
      try {
        const r = await a.getQueueRuntimeProperties(name);
        return {
          name,
          activeMessageCount: r.activeMessageCount ?? 0,
          deadLetterMessageCount: r.deadLetterMessageCount ?? 0,
          scheduledMessageCount: r.scheduledMessageCount ?? 0,
          transferDeadLetterMessageCount: r.transferDeadLetterMessageCount ?? 0,
          totalMessageCount: r.totalMessageCount ?? 0,
          sizeInBytes: r.sizeInBytes ?? 0
        };
      } catch (e) {
        Logger.warn(`Failed runtime for queue ${name}: ${String(e)}`);
        return {
          name, activeMessageCount: 0, deadLetterMessageCount: 0, scheduledMessageCount: 0,
          transferDeadLetterMessageCount: 0, totalMessageCount: 0, sizeInBytes: 0
        };
      }
    });
  }

  async getQueue(nsId: string, name: string): Promise<{ properties: QueueProperties; runtime: QueueRuntime }> {
    const a = await this.admin(nsId);
    const properties = await a.getQueue(name) as QueueProperties;
    const r = await a.getQueueRuntimeProperties(name);
    return {
      properties,
      runtime: {
        name,
        activeMessageCount: r.activeMessageCount ?? 0,
        deadLetterMessageCount: r.deadLetterMessageCount ?? 0,
        scheduledMessageCount: r.scheduledMessageCount ?? 0,
        transferDeadLetterMessageCount: r.transferDeadLetterMessageCount ?? 0,
        totalMessageCount: r.totalMessageCount ?? 0,
        sizeInBytes: r.sizeInBytes ?? 0
      }
    };
  }

  createQueue(nsId: string, name: string, options?: CreateQueueOptions) {
    return this.admin(nsId).then(a => a.createQueue(name, options));
  }

  updateQueue(nsId: string, props: QueueProperties) {
    return this.admin(nsId).then(a => a.updateQueue(props as any));
  }

  deleteQueue(nsId: string, name: string) {
    return this.admin(nsId).then(a => a.deleteQueue(name));
  }

  // Topics
  async listTopics(nsId: string): Promise<TopicRuntime[]> {
    const a = await this.admin(nsId);
    const names: string[] = [];
    for await (const t of a.listTopics()) names.push(t.name);
    return pMap(names, async (name) => {
      try {
        const r = await a.getTopicRuntimeProperties(name);
        return {
          name,
          sizeInBytes: r.sizeInBytes ?? 0,
          scheduledMessageCount: r.scheduledMessageCount ?? 0,
          subscriptionCount: r.subscriptionCount ?? 0
        };
      } catch (e) {
        Logger.warn(`Failed runtime for topic ${name}: ${String(e)}`);
        return { name, sizeInBytes: 0, scheduledMessageCount: 0, subscriptionCount: 0 };
      }
    });
  }

  async getTopic(nsId: string, name: string) {
    const a = await this.admin(nsId);
    return { properties: await a.getTopic(name) as TopicProperties, runtime: await a.getTopicRuntimeProperties(name) };
  }

  createTopic(nsId: string, name: string, options?: CreateTopicOptions) {
    return this.admin(nsId).then(a => a.createTopic(name, options));
  }

  updateTopic(nsId: string, props: TopicProperties) {
    return this.admin(nsId).then(a => a.updateTopic(props as any));
  }

  deleteTopic(nsId: string, name: string) {
    return this.admin(nsId).then(a => a.deleteTopic(name));
  }

  // Subscriptions
  async listSubscriptions(nsId: string, topicName: string): Promise<SubscriptionRuntime[]> {
    const a = await this.admin(nsId);
    const names: string[] = [];
    for await (const s of a.listSubscriptions(topicName)) names.push(s.subscriptionName);
    return pMap(names, async (subscriptionName) => {
      try {
        const r = await a.getSubscriptionRuntimeProperties(topicName, subscriptionName);
        return {
          topicName,
          subscriptionName,
          activeMessageCount: r.activeMessageCount ?? 0,
          deadLetterMessageCount: r.deadLetterMessageCount ?? 0,
          totalMessageCount: r.totalMessageCount ?? 0,
          transferDeadLetterMessageCount: r.transferDeadLetterMessageCount ?? 0
        };
      } catch (e) {
        Logger.warn(`Failed runtime for sub ${topicName}/${subscriptionName}: ${String(e)}`);
        return {
          topicName, subscriptionName,
          activeMessageCount: 0, deadLetterMessageCount: 0, totalMessageCount: 0, transferDeadLetterMessageCount: 0
        };
      }
    });
  }

  async getSubscription(nsId: string, topic: string, subscription: string) {
    const a = await this.admin(nsId);
    return { properties: await a.getSubscription(topic, subscription) as SubscriptionProperties, runtime: await a.getSubscriptionRuntimeProperties(topic, subscription) };
  }

  createSubscription(nsId: string, topic: string, subscription: string, options?: CreateSubscriptionOptions) {
    return this.admin(nsId).then(a => a.createSubscription(topic, subscription, options));
  }

  updateSubscription(nsId: string, props: SubscriptionProperties) {
    return this.admin(nsId).then(a => a.updateSubscription(props as any));
  }

  deleteSubscription(nsId: string, topic: string, subscription: string) {
    return this.admin(nsId).then(a => a.deleteSubscription(topic, subscription));
  }

  // Rules
  async listRules(nsId: string, topic: string, subscription: string): Promise<RuleProperties[]> {
    const a = await this.admin(nsId);
    const out: RuleProperties[] = [];
    for await (const r of a.listRules(topic, subscription)) out.push(r);
    return out;
  }

  getRule(nsId: string, topic: string, subscription: string, rule: string): Promise<RuleProperties> {
    return this.admin(nsId).then(a => a.getRule(topic, subscription, rule).then(r => r as RuleProperties));
  }

  createRule(nsId: string, topic: string, subscription: string, ruleName: string, options?: { filter?: any; action?: any }) {
    return this.admin(nsId).then(a => {
      // SDK has overloaded createRule signature; pass ruleFilter from options
      const filter = options?.filter ?? { sqlExpression: '1=1' };
      const action = options?.action;
      return action
        ? a.createRule(topic, subscription, ruleName, filter as any, action as any)
        : a.createRule(topic, subscription, ruleName, filter as any);
    });
  }

  updateRule(nsId: string, topic: string, subscription: string, props: RuleProperties) {
    return this.admin(nsId).then(a => a.updateRule(topic, subscription, props as any));
  }

  deleteRule(nsId: string, topic: string, subscription: string, rule: string) {
    return this.admin(nsId).then(a => a.deleteRule(topic, subscription, rule));
  }
}
