import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from './App';

// Mock Tabler Icons
vi.mock('@tabler/icons-react', () => ({
  IconRefresh: (props: any) => <svg data-testid="icon-refresh" {...props} />,
  IconTrash: (props: any) => <svg data-testid="icon-trash" {...props} />,
  IconX: (props: any) => <svg data-testid="icon-x" {...props} />,
  IconCopy: (props: any) => <svg data-testid="icon-copy" {...props} />,
  IconMailboxOff: (props: any) => <svg data-testid="icon-mailbox-off" {...props} />,
  IconDownload: (props: any) => <svg data-testid="icon-download" {...props} />,
  IconClearAll: (props: any) => <svg data-testid="icon-clear-all" {...props} />,
  IconFileExport: (props: any) => <svg data-testid="icon-file-export" {...props} />,
  IconArrowBackUp: (props: any) => <svg data-testid="icon-arrow-back-up" {...props} />,
  IconArrowMoveRight: (props: any) => <svg data-testid="icon-arrow-move-right" {...props} />,
}));

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
    if (messageHandler) messageHandler({ command: 'init', data });
  });
}

function sendMessages(items: any[]) {
  act(() => {
    if (messageHandler) messageHandler({ command: 'messages', items });
  });
}

const initData = { source: { queue: 'test-queue' }, isDLQ: false, peekDefault: 50 };

const sampleMsg = {
  sequenceNumber: '42',
  messageId: 'msg-abc-123',
  subject: 'test-subject',
  contentType: 'application/json',
  enqueuedTimeUtc: '2025-03-24T09:38:35Z',
  deliveryCount: 3,
  state: 'active',
  body: '{"hello":"world"}',
  applicationProperties: { 'Diagnostic-Id': '00-abc123', 'Source': 'test' },
};

describe('Messages App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageHandler = null;
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('shows loading state initially', () => {
    render(<App />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('sends webviewReady on mount', () => {
    render(<App />);
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'webviewReady' });
  });

  describe('Detail panel actions', () => {
    function renderWithSelectedMessage() {
      render(<App />);
      sendInit(initData);
      sendMessages([sampleMsg]);
      // Click on the message row to select it
      fireEvent.click(screen.getByText('42'));
    }

    it('shows detail panel when message is selected', () => {
      renderWithSelectedMessage();
      expect(screen.getByText('#42')).toBeInTheDocument();
      expect(screen.getByTitle('Close')).toBeInTheDocument();
    });

    it('shows Resend button in detail header', () => {
      renderWithSelectedMessage();
      const resendBtn = screen.getByTitle('Resend message');
      expect(resendBtn).toBeInTheDocument();
    });

    it('shows Delete button in detail header', () => {
      renderWithSelectedMessage();
      const deleteBtn = screen.getByTitle('Delete message');
      expect(deleteBtn).toBeInTheDocument();
    });

    it('posts resend command when Resend is clicked', () => {
      renderWithSelectedMessage();
      mockPostMessage.mockClear();
      fireEvent.click(screen.getByTitle('Resend message'));
      expect(mockPostMessage).toHaveBeenCalledWith({ command: 'resend', sequenceNumber: '42' });
    });

    it('posts delete command when Delete is clicked', () => {
      renderWithSelectedMessage();
      mockPostMessage.mockClear();
      fireEvent.click(screen.getByTitle('Delete message'));
      expect(mockPostMessage).toHaveBeenCalledWith({ command: 'delete', sequenceNumber: '42' });
    });

    it('closes detail panel when Close is clicked', () => {
      renderWithSelectedMessage();
      fireEvent.click(screen.getByTitle('Close'));
      expect(screen.queryByText('#42')).not.toBeInTheDocument();
    });

    it('shows Copy button for Body column', () => {
      renderWithSelectedMessage();
      expect(screen.getByTitle('Copy body to clipboard')).toBeInTheDocument();
    });

    it('shows Copy button for Application Properties column', () => {
      renderWithSelectedMessage();
      expect(screen.getByTitle('Copy properties to clipboard')).toBeInTheDocument();
    });

    it('copies body text to clipboard when copy button is clicked', () => {
      renderWithSelectedMessage();
      fireEvent.click(screen.getByTitle('Copy body to clipboard'));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        JSON.stringify({ hello: 'world' }, null, 2)
      );
    });

    it('copies application properties to clipboard when copy button is clicked', () => {
      renderWithSelectedMessage();
      fireEvent.click(screen.getByTitle('Copy properties to clipboard'));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        JSON.stringify(sampleMsg.applicationProperties, null, 2)
      );
    });

    it('renders Tabler SVG icons for action buttons', () => {
      renderWithSelectedMessage();
      expect(screen.getByTestId('icon-refresh')).toBeInTheDocument();
      expect(screen.getByTestId('icon-trash')).toBeInTheDocument();
      expect(screen.getByTestId('icon-x')).toBeInTheDocument();
    });

    it('renders Tabler copy icons in editor headers', () => {
      renderWithSelectedMessage();
      const copyIcons = screen.getAllByTestId('icon-copy');
      expect(copyIcons.length).toBeGreaterThanOrEqual(2);
    });

    it('renders resize handle in detail panel', () => {
      const { container } = render(<App />);
      sendInit(initData);
      sendMessages([sampleMsg]);
      fireEvent.click(screen.getByText('42'));
      const handle = container.querySelector('[class*="resizeHandle"]');
      expect(handle).toBeInTheDocument();
    });
  });
});
