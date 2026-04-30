import { QueueProperties, TopicProperties, SubscriptionProperties, RuleProperties } from '@azure/service-bus';

export interface ExportFile {
  version: 1;
  exportedAt: string;
  source: { fqdn: string };
  queues: QueueProperties[];
  topics: Array<TopicProperties & {
    subscriptions: Array<SubscriptionProperties & { rules: RuleProperties[] }>;
  }>;
}

export type ImportMode = 'skip-if-exists' | 'overwrite';

export function validateExportFile(obj: unknown): obj is ExportFile {
  if (!obj || typeof obj !== 'object') return false;
  const f = obj as ExportFile;
  return f.version === 1 && Array.isArray(f.queues) && Array.isArray(f.topics);
}
