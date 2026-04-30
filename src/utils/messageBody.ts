/**
 * JSON serializer that handles bigint and Buffer/Uint8Array bodies.
 */
export function safeStringify(value: unknown, indent = 2): string {
  return JSON.stringify(value, (_k, v) => {
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Uint8Array) {
      try {
        return Buffer.from(v).toString('utf8');
      } catch {
        return Buffer.from(v).toString('base64');
      }
    }
    if (v && typeof v === 'object' && (v as any).type === 'Buffer' && Array.isArray((v as any).data)) {
      try { return Buffer.from((v as any).data).toString('utf8'); } catch { return v; }
    }
    return v;
  }, indent);
}

export function previewBody(body: unknown): string {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) {
    try { return Buffer.from(body).toString('utf8'); } catch { return Buffer.from(body).toString('base64'); }
  }
  return safeStringify(body);
}
