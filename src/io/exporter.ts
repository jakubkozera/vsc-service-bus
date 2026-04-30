import { AdminService } from '../services/adminService';
import { NamespaceStore } from '../state/namespaceStore';
import { ExportFile } from './schema';

export async function exportNamespace(nsId: string, store: NamespaceStore, admin: AdminService): Promise<ExportFile> {
  const meta = store.get(nsId);
  if (!meta) throw new Error('Namespace not found');

  const queueRuntimes = await admin.listQueues(nsId);
  const queues = await Promise.all(queueRuntimes.map(q => admin.getQueue(nsId, q.name).then(r => r.properties)));

  const topicRuntimes = await admin.listTopics(nsId);
  const topics = await Promise.all(topicRuntimes.map(async t => {
    const props = (await admin.getTopic(nsId, t.name)).properties as any;
    const subRuntimes = await admin.listSubscriptions(nsId, t.name);
    const subscriptions = await Promise.all(subRuntimes.map(async s => {
      const subProps = (await admin.getSubscription(nsId, t.name, s.subscriptionName)).properties as any;
      const rules = await admin.listRules(nsId, t.name, s.subscriptionName);
      return { ...subProps, rules };
    }));
    return { ...props, subscriptions };
  }));

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: { fqdn: meta.fqdn },
    queues: queues as any,
    topics: topics as any
  };
}
