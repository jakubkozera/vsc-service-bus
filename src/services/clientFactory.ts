import { ServiceBusClient, ServiceBusAdministrationClient } from '@azure/service-bus';
import { DefaultAzureCredential, InteractiveBrowserCredential, TokenCredential } from '@azure/identity';
import { NamespaceMetadata } from '../models/namespace';
import { NamespaceStore } from '../state/namespaceStore';
import { Logger } from '../logging/logger';

interface CachedClients {
  admin: ServiceBusAdministrationClient;
  data: ServiceBusClient;
  credential?: TokenCredential;
}

export class ClientFactory {
  private cache = new Map<string, CachedClients>();

  constructor(private store: NamespaceStore) {}

  async getAdmin(nsId: string): Promise<ServiceBusAdministrationClient> {
    return (await this.get(nsId)).admin;
  }

  async getData(nsId: string): Promise<ServiceBusClient> {
    return (await this.get(nsId)).data;
  }

  private async get(nsId: string): Promise<CachedClients> {
    const cached = this.cache.get(nsId);
    if (cached) return cached;

    const meta = this.store.get(nsId);
    if (!meta) throw new Error(`Namespace ${nsId} not found`);
    const secret = await this.store.getSecret(nsId);

    let admin: ServiceBusAdministrationClient;
    let data: ServiceBusClient;
    let credential: TokenCredential | undefined;

    if (meta.authMode === 'sas') {
      if (!secret) throw new Error('Missing connection string secret');
      admin = new ServiceBusAdministrationClient(secret);
      data = new ServiceBusClient(secret);
    } else {
      credential = await this.createCredential(meta);
      admin = new ServiceBusAdministrationClient(meta.fqdn, credential);
      data = new ServiceBusClient(meta.fqdn, credential);
    }

    const entry: CachedClients = { admin, data, credential };
    this.cache.set(nsId, entry);
    void this.store.touchLastUsed(nsId);
    return entry;
  }

  private async createCredential(meta: NamespaceMetadata): Promise<TokenCredential> {
    try {
      const tenantId = meta.tenantId ?? 'organizations';
      return new InteractiveBrowserCredential({
        tenantId,
        redirectUri: 'http://localhost'
      });
    } catch (e) {
      Logger.warn('Falling back to DefaultAzureCredential', String(e));
      return new DefaultAzureCredential();
    }
  }

  async invalidate(nsId: string): Promise<void> {
    const entry = this.cache.get(nsId);
    if (!entry) return;
    this.cache.delete(nsId);
    try { await entry.data.close(); } catch (e) { Logger.debug('close data client', String(e)); }
  }

  async dispose(): Promise<void> {
    for (const [, entry] of this.cache) {
      try { await entry.data.close(); } catch { /* ignore */ }
    }
    this.cache.clear();
  }
}
