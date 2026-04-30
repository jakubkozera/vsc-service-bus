import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from './App';

const mockPostMessage = vi.fn();
let messageHandler: ((msg: any) => void) | null = null;

vi.mock('@shared/hooks/useVSCodeMessaging', () => ({
  useVSCodeMessaging: () => ({
    postMessage: mockPostMessage,
    subscribe: (handler: (msg: any) => void) => {
      messageHandler = handler;
      return () => { messageHandler = null; };
    },
  }),
}));

function sendInit(data: any) {
  act(() => {
    if (messageHandler) messageHandler({ command: 'init', data });
  });
}

function sendMessage(msg: any) {
  act(() => {
    if (messageHandler) messageHandler(msg);
  });
}

describe('SendMessage App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageHandler = null;
  });

  it('shows loading state before init', () => {
    render(<App />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('posts webviewReady on mount', () => {
    render(<App />);
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'webviewReady' });
  });

  it('renders "Send messages" title for queue target', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });
    expect(screen.getByText('Send messages')).toBeInTheDocument();
  });

  it('renders "Test Sender" title when isTestSender is true', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, isTestSender: true, availableTargets: [] });
    expect(screen.getByText('Test Sender')).toBeInTheDocument();
  });

  it('renders selected target in dropdown trigger', () => {
    render(<App />);
    sendInit({
      target: { queue: 'orders' },
      availableTargets: [
        { name: 'orders', kind: 'queue' },
        { name: 'events', kind: 'topic' }
      ]
    });
    expect(screen.getByText('orders')).toBeInTheDocument();
  });

  it('hides Session ID and Partition key fields for topic targets', () => {
    render(<App />);
    sendInit({ target: { topic: 'events' }, availableTargets: [] });
    expect(screen.queryByLabelText(/Session ID/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Partition key/i)).not.toBeInTheDocument();
  });

  it('shows Session ID and Partition key fields for queue targets', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });
    expect(screen.getByLabelText(/Session ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Partition key/i)).toBeInTheDocument();
  });

  it('sends payload with body, contentType and repeat in single mode', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });

    // Use valid JSON body (content type defaults to application/json)
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '{"msg": "hello"}' } });

    const sendBtn = screen.getByRole('button', { name: /Send Message/i });
    fireEvent.click(sendBtn);

    const sendCall = mockPostMessage.mock.calls.find(c => c[0]?.command === 'send');
    expect(sendCall).toBeDefined();
    const payload = sendCall![0].payload;
    expect(payload.body).toBe('{"msg": "hello"}');
    expect(payload.contentType).toBe('application/json');
    expect(payload.repeat).toBe(1);
  });

  it('omits sessionId/partitionKey for topic when sending', () => {
    render(<App />);
    sendInit({ target: { topic: 'events' }, availableTargets: [] });

    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '{"hello":"world"}' } });

    fireEvent.click(screen.getByRole('button', { name: /Send Message/i }));

    const sendCall = mockPostMessage.mock.calls.find(c => c[0]?.command === 'send');
    expect(sendCall).toBeDefined();
    expect(sendCall![0].payload.sessionId).toBeUndefined();
    expect(sendCall![0].payload.partitionKey).toBeUndefined();
  });

  it('shows success feedback when sendResult arrives', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });
    sendMessage({ command: 'sendResult', count: 5 });
    expect(screen.getByText(/Sent 5 message\(s\) successfully/)).toBeInTheDocument();
  });

  it('shows error feedback when error message arrives', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });
    sendMessage({ command: 'error', error: 'Connection failed' });
    expect(screen.getByText(/Connection failed/)).toBeInTheDocument();
  });

  it('rejects invalid JSON in batch mode', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });

    const batchSwitch = screen.getByRole('checkbox');
    fireEvent.click(batchSwitch);

    // Type invalid JSON
    const editor = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'not valid json' } });

    fireEvent.click(screen.getByRole('button', { name: /Send Message/i }));

    expect(screen.getByText(/Batch JSON invalid/)).toBeInTheDocument();
    // Should NOT have sent
    expect(mockPostMessage.mock.calls.find(c => c[0]?.command === 'send')).toBeUndefined();
  });

  it('coerces application property values by type', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });

    // Use valid JSON body
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '{"x":1}' } });

    // Add a property
    fireEvent.click(screen.getByRole('button', { name: /Add property/i }));

    const inputs = screen.getAllByPlaceholderText(/key|value/i);
    const keyInput = inputs.find(i => i.getAttribute('placeholder') === 'key') as HTMLInputElement;
    const valueInput = inputs.find(i => i.getAttribute('placeholder') === 'value') as HTMLInputElement;

    fireEvent.change(keyInput, { target: { value: 'priority' } });
    fireEvent.change(valueInput, { target: { value: '42' } });

    // Default type is 'string', so should remain string here
    fireEvent.click(screen.getByRole('button', { name: /Send Message/i }));

    const sendCall = mockPostMessage.mock.calls.find(c => c[0]?.command === 'send');
    expect(sendCall).toBeDefined();
    expect(sendCall![0].payload.applicationProperties).toEqual({ priority: '42' });
  });

  it('does not render legacy emoji icons (📨/📢)', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });
    expect(screen.queryByText('📨')).not.toBeInTheDocument();
    expect(screen.queryByText('📢')).not.toBeInTheDocument();
  });

  it('posts changeTarget when user picks a different queue/topic', () => {
    render(<App />);
    sendInit({
      target: { queue: 'orders' },
      availableTargets: [
        { name: 'orders', kind: 'queue' },
        { name: 'events', kind: 'topic' }
      ]
    });

    // Open the target dropdown (combobox role)
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    // Click the 'events' option
    const eventsOption = screen.getByText('events');
    fireEvent.click(eventsOption);

    const changeCall = mockPostMessage.mock.calls.find(c => c[0]?.command === 'changeTarget');
    expect(changeCall).toBeDefined();
    expect(changeCall![0].target).toEqual({ topic: 'events' });
  });

  it('does not show Queue/Topic label in target dropdown options', () => {
    render(<App />);
    sendInit({
      target: { queue: 'orders' },
      availableTargets: [{ name: 'orders', kind: 'queue' }, { name: 'events', kind: 'topic' }]
    });
    // Open dropdown
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByText('Queue')).not.toBeInTheDocument();
    expect(screen.queryByText('Topic')).not.toBeInTheDocument();
  });

  it('shows Format button when content type is application/json', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });
    // content type default is application/json
    expect(screen.getByRole('button', { name: /Format/i })).toBeInTheDocument();
  });

  it('does not show Format button when content type is text/plain', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });
    const ctInput = screen.getByLabelText(/Content type/i) as HTMLInputElement;
    fireEvent.change(ctInput, { target: { value: 'text/plain' } });
    expect(screen.queryByRole('button', { name: /Format/i })).not.toBeInTheDocument();
  });

  it('formats body JSON when Format button clicked', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });

    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '{"a":1,"b":2}' } });

    fireEvent.click(screen.getByRole('button', { name: /Format/i }));

    const updated = (document.querySelector('textarea') as HTMLTextAreaElement).value;
    expect(updated).toContain('\n');
    expect(updated).toContain('"a": 1');
  });

  it('shows JSON error on blur with invalid body when content type is application/json', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });

    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'not valid json' } });
    fireEvent.blur(ta);

    expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument();
  });

  it('clears JSON error on blur when body becomes valid JSON', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });

    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    // Make invalid first
    fireEvent.change(ta, { target: { value: 'bad' } });
    fireEvent.blur(ta);
    expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument();

    // Now fix it
    fireEvent.change(ta, { target: { value: '{"ok": true}' } });
    fireEvent.blur(ta);
    expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument();
  });

  it('blocks send with invalid JSON body and application/json content type', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });

    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'not valid json' } });

    fireEvent.click(screen.getByRole('button', { name: /Send Message/i }));

    expect(screen.getByText(/Message body is not valid JSON/)).toBeInTheDocument();
    expect(mockPostMessage.mock.calls.find(c => c[0]?.command === 'send')).toBeUndefined();
  });

  it('does not validate JSON body when content type is not application/json', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });

    const ctInput = screen.getByLabelText(/Content type/i) as HTMLInputElement;
    fireEvent.change(ctInput, { target: { value: 'text/plain' } });

    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'this is not json' } });
    fireEvent.blur(ta);

    expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Send Message/i }));
    expect(mockPostMessage.mock.calls.find(c => c[0]?.command === 'send')).toBeDefined();
  });

  it('shows Format button in batch mode', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });

    const batchSwitch = screen.getByRole('checkbox');
    fireEvent.click(batchSwitch);

    expect(screen.getByRole('button', { name: /Format/i })).toBeInTheDocument();
  });

  it('validates batch JSON on blur', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });

    const batchSwitch = screen.getByRole('checkbox');
    fireEvent.click(batchSwitch);

    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'invalid json' } });
    fireEvent.blur(ta);

    expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument();
  });

  it('formats batch JSON when Format clicked', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });

    const batchSwitch = screen.getByRole('checkbox');
    fireEvent.click(batchSwitch);

    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '[{"a":1}]' } });

    fireEvent.click(screen.getByRole('button', { name: /Format/i }));

    const updated = ta.value;
    expect(updated).toContain('\n');
    expect(updated).toContain('"a": 1');
  });

  it('clears error when user starts editing body', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });

    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'bad' } });
    fireEvent.blur(ta);

    expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument();

    // Start editing - error should disappear
    fireEvent.change(ta, { target: { value: 'bad2' } });
    expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument();
  });

  it('clears error when user starts editing batch JSON', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });

    const batchSwitch = screen.getByRole('checkbox');
    fireEvent.click(batchSwitch);

    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'bad' } });
    fireEvent.blur(ta);

    expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument();

    // Start editing - error should disappear
    fireEvent.change(ta, { target: { value: 'bad2' } });
    expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument();
  });

  it('clears errors when switching between batch and single mode', () => {
    render(<App />);
    sendInit({ target: { queue: 'orders' }, availableTargets: [] });

    // Create error in single mode
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'bad' } });
    fireEvent.blur(ta);
    expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument();

    // Switch to batch mode - error should clear
    const batchSwitch = screen.getByRole('checkbox');
    fireEvent.click(batchSwitch);
    expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument();

    // Create error in batch mode
    fireEvent.change(ta, { target: { value: 'also bad' } });
    fireEvent.blur(ta);
    expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument();

    // Switch back to single mode - error should clear
    fireEvent.click(batchSwitch);
    expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument();
  });
});
