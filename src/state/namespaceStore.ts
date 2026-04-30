import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { NamespaceMetadata } from '../models/namespace';

const STATE_KEY = 'serviceBusExplorer.namespaces';
const SECRET_PREFIX = 'serviceBusExplorer.secret.';

export class NamespaceStore {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  list(): NamespaceMetadata[] {
    return this.ctx.globalState.get<NamespaceMetadata[]>(STATE_KEY, []);
  }

  get(id: string): NamespaceMetadata | undefined {
    return this.list().find(n => n.id === id);
  }

  async add(meta: Omit<NamespaceMetadata, 'id' | 'createdAt'>, secret: string): Promise<NamespaceMetadata> {
    const full: NamespaceMetadata = {
      ...meta,
      id: randomUUID(),
      createdAt: new Date().toISOString()
    };
    const list = this.list();
    list.push(full);
    await this.ctx.globalState.update(STATE_KEY, list);
    await this.ctx.secrets.store(SECRET_PREFIX + full.id, secret);
    this._onDidChange.fire();
    return full;
  }

  async update(meta: NamespaceMetadata, secret?: string): Promise<void> {
    const list = this.list();
    const idx = list.findIndex(n => n.id === meta.id);
    if (idx === -1) throw new Error('Namespace not found');
    list[idx] = meta;
    await this.ctx.globalState.update(STATE_KEY, list);
    if (secret !== undefined) {
      await this.ctx.secrets.store(SECRET_PREFIX + meta.id, secret);
    }
    this._onDidChange.fire();
  }

  async remove(id: string): Promise<void> {
    const list = this.list().filter(n => n.id !== id);
    await this.ctx.globalState.update(STATE_KEY, list);
    await this.ctx.secrets.delete(SECRET_PREFIX + id);
    this._onDidChange.fire();
  }

  async getSecret(id: string): Promise<string | undefined> {
    return this.ctx.secrets.get(SECRET_PREFIX + id);
  }

  async touchLastUsed(id: string): Promise<void> {
    const list = this.list();
    const item = list.find(n => n.id === id);
    if (!item) return;
    item.lastUsedAt = new Date().toISOString();
    await this.ctx.globalState.update(STATE_KEY, list);
  }
}
