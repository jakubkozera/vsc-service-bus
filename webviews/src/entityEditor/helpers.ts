export function defaultsFor(kind: string): any {
  if (kind === 'queue' || kind === 'subscription') {
    return { lockDuration: 'PT30S', defaultMessageTimeToLive: 'P14D', maxDeliveryCount: 10, status: 'Active', enableBatchedOperations: true };
  }
  if (kind === 'topic') {
    return { defaultMessageTimeToLive: 'P14D', maxSizeInMegabytes: 1024, status: 'Active', enableBatchedOperations: true };
  }
  return {};
}

export function stripImmutable(props: any): any {
  const { name, topicName, subscriptionName, ...rest } = props;
  return rest;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function colorizeJson(json: string, classNames: { jsonKey: string; jsonString: string; jsonNumber: string }): string {
  const escaped = json
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return escaped.replace(
    /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (_match, str, trailingColon, kw, num) => {
      if (str !== undefined) {
        if (trailingColon) {
          return `<span class="${classNames.jsonKey}">${str}</span>${trailingColon}`;
        }
        return `<span class="${classNames.jsonString}">${str}</span>`;
      }
      if (kw !== undefined) return `<span class="${classNames.jsonNumber}">${kw}</span>`;
      if (num !== undefined) return `<span class="${classNames.jsonNumber}">${num}</span>`;
      return _match;
    }
  );
}
