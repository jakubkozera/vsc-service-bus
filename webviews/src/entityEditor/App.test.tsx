import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from './App';

// Mock messaging hook
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
    if (messageHandler) {
      messageHandler({ command: 'init', data });
    }
  });
}

function sendMessage(msg: any) {
  act(() => {
    if (messageHandler) {
      messageHandler(msg);
    }
  });
}

describe('EntityEditor App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageHandler = null;
  });

  it('shows loading state initially', () => {
    render(<App />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('sends webviewReady on mount', () => {
    render(<App />);
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'webviewReady' });
  });

  describe('Queue View Mode', () => {
    const queueData = {
      mode: 'view' as const,
      kind: 'queue' as const,
      name: 'test-queue',
      namespace: 'my-namespace.servicebus.windows.net',
      properties: {
        lockDuration: 'PT1M',
        defaultMessageTimeToLive: 'P14D',
        maxDeliveryCount: 10,
        maxSizeInMegabytes: 1024,
        status: 'Active',
        requiresSession: false,
        requiresDuplicateDetection: false,
        enablePartitioning: false,
        deadLetteringOnMessageExpiration: false,
        enableBatchedOperations: true,
      },
      runtime: {
        activeMessageCount: 5,
        totalMessageCount: 5,
        deadLetterMessageCount: 0,
        scheduledMessageCount: 2,
        sizeInBytes: 1623,
      },
    };

    it('renders queue header with name and status', () => {
      render(<App />);
      sendInit(queueData);
      // name appears in header and breadcrumb
      expect(screen.getAllByText('test-queue').length).toBeGreaterThanOrEqual(1);
      // Active appears in badge and possibly dropdown
      expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    });

    it('renders breadcrumb with namespace path', () => {
      render(<App />);
      sendInit(queueData);
      expect(screen.getByText('Service Bus')).toBeInTheDocument();
      expect(screen.getByText('Queues')).toBeInTheDocument();
    });

    it('renders stats row with runtime data', () => {
      render(<App />);
      sendInit(queueData);
      expect(screen.getByText('Dead-letter')).toBeInTheDocument();
      expect(screen.getByText('Scheduled')).toBeInTheDocument();
    });

    it('renders timing and delivery panel', () => {
      render(<App />);
      sendInit(queueData);
      expect(screen.getByText('Timing & Delivery')).toBeInTheDocument();
      // Lock duration PT1M → minutes = 1
      expect(screen.getByText('Lock duration')).toBeInTheDocument();
      expect(screen.getByText('Default message TTL')).toBeInTheDocument();
    });

    it('renders storage and routing panel', () => {
      render(<App />);
      sendInit(queueData);
      expect(screen.getByText('Storage')).toBeInTheDocument();
      expect(screen.getByText('Routing')).toBeInTheDocument();
      expect(screen.getByDisplayValue('1024')).toBeInTheDocument();
    });

    it('renders feature toggles section', () => {
      render(<App />);
      sendInit(queueData);
      expect(screen.getByText('Features')).toBeInTheDocument();
      expect(screen.getByText('Requires session')).toBeInTheDocument();
      expect(screen.getByText('Enable batched operations')).toBeInTheDocument();
    });

    it('renders JSON viewer with runtime data', () => {
      render(<App />);
      sendInit(queueData);
      expect(screen.getByText('Runtime — raw response')).toBeInTheDocument();
    });

    it('does not render save bar in view mode', () => {
      render(<App />);
      sendInit(queueData);
      expect(screen.queryByText('Save changes')).not.toBeInTheDocument();
    });
  });

  describe('Queue Edit Mode', () => {
    const editData = {
      mode: 'edit' as const,
      kind: 'queue' as const,
      name: 'orders',
      properties: {
        lockDuration: 'PT30S',
        defaultMessageTimeToLive: 'P14D',
        maxDeliveryCount: 10,
        maxSizeInMegabytes: 1024,
        status: 'Active',
        enableBatchedOperations: true,
      },
    };

    it('renders save bar in edit mode', () => {
      render(<App />);
      sendInit(editData);
      expect(screen.getByText('Save changes')).toBeInTheDocument();
      expect(screen.getByText('Discard')).toBeInTheDocument();
      expect(screen.getByText('No unsaved changes')).toBeInTheDocument();
    });

    it('marks dirty when field changes', () => {
      render(<App />);
      sendInit(editData);
      // maxDeliveryCount is a NumberInput with value "10"
      const input = screen.getByDisplayValue('10');
      fireEvent.change(input, { target: { value: '5' } });
      expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
    });

    it('sends save message with properties', () => {
      render(<App />);
      sendInit(editData);
      const input = screen.getByDisplayValue('10');
      fireEvent.change(input, { target: { value: '5' } });
      fireEvent.click(screen.getByText('Save changes'));
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'save', payload: expect.objectContaining({ properties: expect.objectContaining({ maxDeliveryCount: 5 }) }) })
      );
    });

    it('discards changes on discard click', () => {
      render(<App />);
      sendInit(editData);
      const input = screen.getByDisplayValue('10');
      fireEvent.change(input, { target: { value: '5' } });
      expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Discard'));
      expect(screen.getByText('No unsaved changes')).toBeInTheDocument();
      expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    });
  });

  describe('Queue Create Mode', () => {
    const createData = {
      mode: 'create' as const,
      kind: 'queue' as const,
    };

    it('renders create form with title', () => {
      render(<App />);
      sendInit(createData);
      expect(screen.getByText('Create Queue')).toBeInTheDocument();
    });

    it('renders name input', () => {
      render(<App />);
      sendInit(createData);
      expect(screen.getByLabelText('Queue name')).toBeInTheDocument();
    });

    it('renders create and cancel buttons', () => {
      render(<App />);
      sendInit(createData);
      expect(screen.getByText('Create')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('sends save with name and options on create', () => {
      render(<App />);
      sendInit(createData);
      const nameInput = screen.getByLabelText('Queue name');
      fireEvent.change(nameInput, { target: { value: 'my-queue' } });
      fireEvent.click(screen.getByText('Create'));
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'save', payload: expect.objectContaining({ name: 'my-queue' }) })
      );
    });

    it('sends cancel on cancel click', () => {
      render(<App />);
      sendInit(createData);
      fireEvent.click(screen.getByText('Cancel'));
      expect(mockPostMessage).toHaveBeenCalledWith({ command: 'cancel' });
    });
  });

  describe('Topic View Mode', () => {
    const topicData = {
      mode: 'view' as const,
      kind: 'topic' as const,
      name: 'events',
      properties: {
        defaultMessageTimeToLive: 'P14D',
        maxSizeInMegabytes: 1024,
        status: 'Active',
        enableBatchedOperations: true,
      },
      runtime: {
        subscriptionCount: 3,
        scheduledMessageCount: 0,
        sizeInBytes: 4096,
      },
    };

    it('renders topic header', () => {
      render(<App />);
      sendInit(topicData);
      // 'events' appears in header, breadcrumb, and JSON
      expect(screen.getAllByText('events').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Topics').length).toBeGreaterThanOrEqual(1);
    });

    it('shows subscription count in stats', () => {
      render(<App />);
      sendInit(topicData);
      expect(screen.getByText('Subscriptions')).toBeInTheDocument();
      // Stat value appears
      const statCards = document.querySelectorAll('[class*="statValue"]');
      expect(statCards.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Subscription Edit Mode', () => {
    const subData = {
      mode: 'edit' as const,
      kind: 'subscription' as const,
      name: 'processor',
      topicName: 'events',
      properties: {
        lockDuration: 'PT30S',
        defaultMessageTimeToLive: 'P14D',
        maxDeliveryCount: 5,
        status: 'Active',
        requiresSession: false,
        deadLetteringOnMessageExpiration: true,
        deadLetteringOnFilterEvaluationExceptions: false,
      },
    };

    it('renders subscription editor panels', () => {
      render(<App />);
      sendInit(subData);
      expect(screen.getByText('Timing & Delivery')).toBeInTheDocument();
      expect(screen.getByText('Routing')).toBeInTheDocument();
    });

    it('shows dead-letter toggle features', () => {
      render(<App />);
      sendInit(subData);
      expect(screen.getByText('Dead-letter on message expiration')).toBeInTheDocument();
      expect(screen.getByText('Dead-letter on filter exceptions')).toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('shows error message from extension', () => {
      render(<App />);
      sendInit({ mode: 'edit', kind: 'queue', name: 'test', properties: { status: 'Active' } });
      sendMessage({ command: 'error', error: 'Connection failed' });
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });
  });
});
