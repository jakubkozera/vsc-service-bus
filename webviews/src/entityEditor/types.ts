export interface InitData {
  mode: 'create' | 'edit' | 'view';
  kind: 'queue' | 'topic' | 'subscription' | 'rule';
  name?: string;
  namespace?: string;
  topicName?: string;
  subscriptionName?: string;
  properties?: any;
  runtime?: any;
  availableTargets?: { name: string; kind: 'queue' | 'topic' }[];
}

export interface FeatureToggle {
  key: string;
  label: string;
  desc: string;
  checked: boolean;
  /** Cannot be changed after creation */
  immutable?: boolean;
}

export const STATUS_OPTIONS = [
  { value: 'Active', label: 'Active' },
  { value: 'Disabled', label: 'Disabled' },
  { value: 'SendDisabled', label: 'SendDisabled' },
  { value: 'ReceiveDisabled', label: 'ReceiveDisabled' },
];
