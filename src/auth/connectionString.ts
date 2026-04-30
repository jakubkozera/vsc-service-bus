export interface ParsedConnectionString {
  endpoint: string;
  fqdn: string;
  sharedAccessKeyName?: string;
  sharedAccessKey?: string;
  entityPath?: string;
  authMode?: 'sas' | 'aad';
  tenantId?: string;
}

export function parseConnectionString(cs: string): ParsedConnectionString {
  const parts = cs.split(';').map(p => p.trim()).filter(Boolean);
  const map: Record<string, string> = {};
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const key = p.slice(0, idx).trim();
    const val = p.slice(idx + 1).trim();
    map[key.toLowerCase()] = val;
  }

  const endpoint = map['endpoint'];
  if (!endpoint) {
    throw new Error('Connection string is missing Endpoint=...');
  }
  let fqdn = endpoint.replace(/^sb:\/\//i, '').replace(/\/?$/, '');
  fqdn = fqdn.replace(/\/$/, '');

  const authModeRaw = map['authmode'];
  const authMode: 'sas' | 'aad' | undefined = authModeRaw
    ? authModeRaw.toLowerCase() === 'aad' ? 'aad' : 'sas'
    : undefined;

  const result: ParsedConnectionString = {
    endpoint,
    fqdn,
    sharedAccessKeyName: map['sharedaccesskeyname'],
    sharedAccessKey: map['sharedaccesskey'],
    entityPath: map['entitypath'],
    authMode,
    tenantId: map['tenantid']
  };

  if (result.authMode !== 'aad' && (!result.sharedAccessKeyName || !result.sharedAccessKey)) {
    throw new Error('Connection string requires SharedAccessKeyName and SharedAccessKey, or AuthMode=AAD');
  }
  return result;
}

export function buildConnectionStringFromMeta(fqdn: string, keyName: string, key: string, entityPath?: string): string {
  let cs = `Endpoint=sb://${fqdn}/;SharedAccessKeyName=${keyName};SharedAccessKey=${key}`;
  if (entityPath) cs += `;EntityPath=${entityPath}`;
  return cs;
}
