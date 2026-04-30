export type AuthMode = 'sas' | 'aad';

export interface NamespaceMetadata {
  id: string;
  displayName: string;
  fqdn: string;
  authMode: AuthMode;
  tenantId?: string;
  entityPath?: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface QueueRuntime {
  name: string;
  activeMessageCount: number;
  deadLetterMessageCount: number;
  scheduledMessageCount: number;
  transferDeadLetterMessageCount: number;
  totalMessageCount: number;
  sizeInBytes: number;
  status?: string;
}

export interface SubscriptionRuntime {
  topicName: string;
  subscriptionName: string;
  activeMessageCount: number;
  deadLetterMessageCount: number;
  totalMessageCount: number;
  transferDeadLetterMessageCount: number;
  status?: string;
}

export interface TopicRuntime {
  name: string;
  sizeInBytes: number;
  scheduledMessageCount: number;
  subscriptionCount: number;
  status?: string;
}
