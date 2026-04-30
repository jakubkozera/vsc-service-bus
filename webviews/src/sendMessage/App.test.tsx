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

    const sendBtn = screen.getByRole('button', { name: /Send Message/i });
    fireEvent.click(sendBtn);

    const sendCall = mockPostMessage.mock.calls.find(c => c[0]?.command === 'send');
    expect(sendCall).toBeDefined();
    const payload = sendCall![0].payload;
    expect(payload.body).toContain('Hello from Service Bus Explorer');
    expect(payload.contentType).toBe('application/json');
    expect(payload.repeat).toBe(1);
  });

  it('omits sessionId/partitionKey for topic when sending', () => {
    render(<App />);
    sendInit({ target: { topic: 'events' }, availableTargets: [] });

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
});
