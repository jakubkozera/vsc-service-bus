import { AdminService } from '../services/adminService';
import { ExportFile, ImportMode } from './schema';
import { Logger } from '../logging/logger';

export interface ImportReport {
  created: string[];
  updated: string[];
  skipped: string[];
  failed: Array<{ name: string; error: string }>;
}

const RUNTIME_ONLY_FIELDS = new Set([
  'accessedAt', 'createdAt', 'modifiedAt', 'sizeInBytes',
  'messageCount', 'messageCountDetails', 'subscriptionCount', 'topicName'
]);

function strip(obj: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (RUNTIME_ONLY_FIELDS.has(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export async function importNamespace(nsId: string, file: ExportFile, mode: ImportMode, admin: AdminService): Promise<ImportReport> {
  const report: ImportReport = { created: [], updated: [], skipped: [], failed: [] };

  for (const q of file.queues) {
    const name = (q as any).name;
    try {
      const exists = await admin.getQueue(nsId, name).then(() => true).catch(() => false);
      if (exists) {
        if (mode === 'skip-if-exists') { report.skipped.push(`queue:${name}`); continue; }
        await admin.updateQueue(nsId, { ...strip(q), name } as any);
        report.updated.push(`queue:${name}`);
      } else {
        await admin.createQueue(nsId, name, strip(q));
        report.created.push(`queue:${name}`);
      }
    } catch (e) {
      report.failed.push({ name: `queue:${name}`, error: (e as Error).message });
      Logger.error(`Import queue ${name}`, e);
    }
  }

  for (const t of file.topics) {
    const tName = (t as any).name;
    try {
      const exists = await admin.getTopic(nsId, tName).then(() => true).catch(() => false);
      if (exists) {
        if (mode === 'overwrite') {
          await admin.updateTopic(nsId, { ...strip(t), name: tName } as any);
          report.updated.push(`topic:${tName}`);
        } else {
          report.skipped.push(`topic:${tName}`);
        }
      } else {
        await admin.createTopic(nsId, tName, strip(t));
        report.created.push(`topic:${tName}`);
      }
    } catch (e) {
      report.failed.push({ name: `topic:${tName}`, error: (e as Error).message });
      continue;
    }

    for (const s of (t as any).subscriptions || []) {
      const sName = s.subscriptionName;
      try {
        const subExists = await admin.getSubscription(nsId, tName, sName).then(() => true).catch(() => false);
        if (subExists) {
          if (mode === 'overwrite') {
            await admin.updateSubscription(nsId, { ...strip(s), topicName: tName, subscriptionName: sName } as any);
            report.updated.push(`sub:${tName}/${sName}`);
          } else {
            report.skipped.push(`sub:${tName}/${sName}`);
          }
        } else {
          await admin.createSubscription(nsId, tName, sName, strip(s));
          report.created.push(`sub:${tName}/${sName}`);
        }
      } catch (e) {
        report.failed.push({ name: `sub:${tName}/${sName}`, error: (e as Error).message });
        continue;
      }

      for (const r of s.rules || []) {
        const rName = r.name;
        try {
          const rExists = await admin.getRule(nsId, tName, sName, rName).then(() => true).catch(() => false);
          if (rExists) {
            if (mode === 'overwrite') {
              await admin.updateRule(nsId, tName, sName, { ...r } as any);
              report.updated.push(`rule:${tName}/${sName}/${rName}`);
            } else {
              report.skipped.push(`rule:${tName}/${sName}/${rName}`);
            }
          } else {
            await admin.createRule(nsId, tName, sName, rName, { filter: r.filter, action: r.action } as any);
            report.created.push(`rule:${tName}/${sName}/${rName}`);
          }
        } catch (e) {
          report.failed.push({ name: `rule:${tName}/${sName}/${rName}`, error: (e as Error).message });
        }
      }
    }
  }

  return report;
}

export function importLegacyXml(xml: string): ExportFile {
  // Minimal best-effort port: parse <Queue Name="..."> and <Topic Name="..."><Subscription Name="...">
  const parseAttrs = (tag: string) => {
    const map: Record<string, string> = {};
    const re = /(\w+)="([^"]*)"/g;
    let m;
    while ((m = re.exec(tag))) map[m[1]] = m[2];
    return map;
  };
  const queues: any[] = [];
  for (const m of xml.matchAll(/<Queue\s+([^>]+)\/>/g)) {
    const a = parseAttrs(m[1]);
    if (a.Name) queues.push({ name: a.Name });
  }
  for (const m of xml.matchAll(/<Queue\s+([^>]+)>/g)) {
    const a = parseAttrs(m[1]);
    if (a.Name && !queues.find(q => q.name === a.Name)) queues.push({ name: a.Name });
  }
  const topics: any[] = [];
  for (const m of xml.matchAll(/<Topic\s+([^>]+)>([\s\S]*?)<\/Topic>/g)) {
    const a = parseAttrs(m[1]);
    const inner = m[2];
    const subscriptions: any[] = [];
    for (const sm of inner.matchAll(/<Subscription\s+([^>]+?)(?:\/>|>([\s\S]*?)<\/Subscription>)/g)) {
      const sa = parseAttrs(sm[1]);
      if (sa.Name) subscriptions.push({ subscriptionName: sa.Name, rules: [] });
    }
    if (a.Name) topics.push({ name: a.Name, subscriptions });
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: { fqdn: 'legacy-xml' },
    queues,
    topics
  };
}
