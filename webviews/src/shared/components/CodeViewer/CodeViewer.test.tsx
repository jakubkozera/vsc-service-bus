import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CodeViewer } from './CodeViewer';

describe('CodeViewer JSON colorization', () => {
  function renderJson(value: string): string {
    const { container } = render(<CodeViewer value={value} language="json" />);
    return container.querySelector('pre')?.innerHTML ?? '';
  }

  it('preserves date strings with internal colons untouched', () => {
    const json = `{
  "createdAt": "2026-04-30T12:22:25.882Z"
}`;
    const html = renderJson(json);
    // The date string content must be intact — no extra spaces or wrapping spans
    expect(html).toContain('"2026-04-30T12:22:25.882Z"');
    // Internal colons should NOT be split out
    expect(html).not.toMatch(/T12:\s*<\/?span/);
    expect(html).not.toMatch(/T12:\s+22/);
  });

  it('does not insert spaces inside string values containing digits/colons', () => {
    const json = '{"a":"2026-04-30T12:22:25.882Z","b":660}';
    const html = renderJson(json);
    expect(html).toContain('"2026-04-30T12:22:25.882Z"');
    // Numbers outside strings should still be highlighted
    expect(html).toMatch(/<span class="number">660<\/span>/);
  });

  it('highlights keys with key class', () => {
    const html = renderJson('{"name": "x"}');
    expect(html).toMatch(/<span class="key">"name"<\/span>:/);
  });

  it('highlights string values with string class (not key)', () => {
    const html = renderJson('{"name": "value"}');
    expect(html).toMatch(/<span class="string">"value"<\/span>/);
  });

  it('highlights numbers, booleans, and null as separate token classes', () => {
    const html = renderJson('{"a":1,"b":true,"c":false,"d":null,"e":-3.14}');
    expect(html).toMatch(/<span class="number">1<\/span>/);
    expect(html).toMatch(/<span class="keyword">true<\/span>/);
    expect(html).toMatch(/<span class="keyword">false<\/span>/);
    expect(html).toMatch(/<span class="keyword">null<\/span>/);
    expect(html).toMatch(/<span class="number">-3\.14<\/span>/);
  });

  it('does not match digits inside strings as numbers', () => {
    const json = '{"id":"abc-123-xyz"}';
    const html = renderJson(json);
    // The digits inside the string should not be wrapped in a number span
    expect(html).not.toMatch(/<span class="number">123<\/span>/);
    expect(html).toContain('"abc-123-xyz"');
  });

  it('handles realistic runtime payload exactly', () => {
    const payload = JSON.stringify({
      name: 'testt',
      sizeInBytes: 660,
      subscriptionCount: 1,
      createdAt: '2026-04-30T12:22:25.882Z',
      scheduledMessageCount: 0,
      modifiedAt: '2026-04-30T13:02:05.307Z',
      accessedAt: '2026-04-30T13:02:31.925Z'
    }, null, 2);
    const html = renderJson(payload);
    expect(html).toContain('"2026-04-30T12:22:25.882Z"');
    expect(html).toContain('"2026-04-30T13:02:05.307Z"');
    expect(html).toContain('"2026-04-30T13:02:31.925Z"');
    expect(html).toMatch(/<span class="number">660<\/span>/);
  });
});
