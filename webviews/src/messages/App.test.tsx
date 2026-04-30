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
  IconCheck: (props: any) => <svg data-testid="icon-check" {...props} />,
  IconRotate: (props: any) => <svg data-testid="icon-rotate" {...props} />,
  IconPlayerPause: (props: any) => <svg data-testid="icon-player-pause" {...props} />,
  IconSkull: (props: any) => <svg data-testid="icon-skull" {...props} />,
  IconChevronLeft: (props: any) => <svg data-testid="icon-chevron-left" {...props} />,
  IconChevronRight: (props: any) => <svg data-testid="icon-chevron-right" {...props} />,
  IconFilter: (props: any) => <svg data-testid="icon-filter" {...props} />,
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
const initDataDLQ = { source: { queue: 'test-queue' }, isDLQ: true, peekDefault: 50 };

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

function makeMessages(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...sampleMsg,
    sequenceNumber: String(i + 1),
    messageId: `msg-${i + 1}`,
    subject: `subject-${i + 1}`,
  }));
}

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

  it('shows custom loader during fetch', () => {
    render(<App />);
    sendInit(initData);
    sendMessages([sampleMsg]);
    
    const fetchButton = screen.getByTitle('Fetch messages');
    
    // Initially should show download icon
    expect(screen.getByTestId('icon-download')).toBeInTheDocument();
    expect(fetchButton.querySelector('.loader')).not.toBeInTheDocument();

    // Click fetch
    fireEvent.click(fetchButton);
    
    // Should show loader div instead of icon
    expect(fetchButton.querySelector('.loader')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-download')).not.toBeInTheDocument();
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

  describe('Pagination', () => {
    it('does not show pagination when totalMessageCount fits in one page', () => {
      render(<App />);
      sendInit({ ...initData, peekDefault: 50, totalMessageCount: 10 });
      sendMessages(makeMessages(10));
      expect(screen.queryByText(/Page/)).not.toBeInTheDocument();
    });

    it('shows pagination when totalMessageCount exceeds page size', () => {
      render(<App />);
      sendInit({ ...initData, peekDefault: 10, totalMessageCount: 25 });
      act(() => { if (messageHandler) messageHandler({ command: 'messages', items: makeMessages(10), totalMessageCount: 25 }); });
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    });

    it('navigates to next page by posting peek with fromSequenceNumber', () => {
      render(<App />);
      sendInit({ ...initData, peekDefault: 10, totalMessageCount: 25 });
      act(() => { if (messageHandler) messageHandler({ command: 'messages', items: makeMessages(10), totalMessageCount: 25 }); });

      mockPostMessage.mockClear();
      fireEvent.click(screen.getByTitle('Next page'));
      // Should post a peek command with fromSequenceNumber = last seq + 1
      expect(mockPostMessage).toHaveBeenCalledWith({ command: 'peek', count: 10, fromSequenceNumber: '11' });
    });

    it('navigates to previous page by re-fetching from start', () => {
      render(<App />);
      sendInit({ ...initData, peekDefault: 10, totalMessageCount: 25 });
      act(() => { if (messageHandler) messageHandler({ command: 'messages', items: makeMessages(10), totalMessageCount: 25 }); });
      // Go to page 2
      fireEvent.click(screen.getByTitle('Next page'));
      act(() => { if (messageHandler) messageHandler({ command: 'messages', items: makeMessages(10).map((m, i) => ({ ...m, sequenceNumber: String(i + 11) })), totalMessageCount: 25 }); });

      mockPostMessage.mockClear();
      fireEvent.click(screen.getByTitle('Previous page'));
      // Should re-fetch from beginning (no fromSequenceNumber)
      expect(mockPostMessage).toHaveBeenCalledWith({ command: 'peek', count: 10, fromSequenceNumber: undefined });
    });

    it('disables Previous button on first page', () => {
      render(<App />);
      sendInit({ ...initData, peekDefault: 10, totalMessageCount: 25 });
      act(() => { if (messageHandler) messageHandler({ command: 'messages', items: makeMessages(10), totalMessageCount: 25 }); });
      expect(screen.getByTitle('Previous page')).toBeDisabled();
    });

    it('disables Next button on last page', () => {
      render(<App />);
      sendInit({ ...initData, peekDefault: 10, totalMessageCount: 20 });
      act(() => { if (messageHandler) messageHandler({ command: 'messages', items: makeMessages(10), totalMessageCount: 20 }); });

      // Go to page 2 (last)
      fireEvent.click(screen.getByTitle('Next page'));
      act(() => { if (messageHandler) messageHandler({ command: 'messages', items: makeMessages(10).map((m, i) => ({ ...m, sequenceNumber: String(i + 11) })), totalMessageCount: 20 }); });
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
      expect(screen.getByTitle('Next page')).toBeDisabled();
    });
  });

  describe('Contextual buttons', () => {
    it('hides Clear and Export when no messages', () => {
      render(<App />);
      sendInit(initData);
      sendMessages([]);
      expect(screen.queryByTitle(/Clear list/)).not.toBeInTheDocument();
      expect(screen.queryByTitle(/Export/)).not.toBeInTheDocument();
    });

    it('shows Clear and Export when messages exist', () => {
      render(<App />);
      sendInit(initData);
      sendMessages([sampleMsg]);
      expect(screen.getByTitle('Clear list')).toBeInTheDocument();
      expect(screen.getByTitle('Export all to JSON')).toBeInTheDocument();
    });

    it('shows "Remove selected" when items are selected', () => {
      render(<App />);
      sendInit(initData);
      sendMessages([sampleMsg]);
      const checkbox = screen.getAllByRole('checkbox')[1];
      fireEvent.click(checkbox);
      expect(screen.getByTitle('Remove selected from list')).toBeInTheDocument();
    });

    it('shows "Export selected" when items are selected', () => {
      render(<App />);
      sendInit(initData);
      sendMessages([sampleMsg]);
      const checkbox = screen.getAllByRole('checkbox')[1];
      fireEvent.click(checkbox);
      expect(screen.getByTitle('Export selected to JSON')).toBeInTheDocument();
    });

    it('hides Resubmit and Move to when nothing is selected', () => {
      render(<App />);
      sendInit(initDataDLQ);
      sendMessages([sampleMsg]);
      expect(screen.queryByTitle('Resubmit selected messages')).not.toBeInTheDocument();
      expect(screen.queryByTitle(/Move/)).not.toBeInTheDocument();
    });

    it('shows Resubmit and Move to when items are selected (DLQ)', () => {
      render(<App />);
      sendInit(initDataDLQ);
      sendMessages([sampleMsg]);
      const checkbox = screen.getAllByRole('checkbox')[1];
      fireEvent.click(checkbox);
      expect(screen.getByTitle('Resubmit selected messages')).toBeInTheDocument();
      expect(screen.getByTitle('Move selected to another queue or topic')).toBeInTheDocument();
    });

    it('shows Move to when items selected (non-DLQ)', () => {
      render(<App />);
      sendInit(initData);
      sendMessages([sampleMsg]);
      const checkbox = screen.getAllByRole('checkbox')[1];
      fireEvent.click(checkbox);
      expect(screen.getByTitle('Move selected to another queue or topic')).toBeInTheDocument();
    });

    it('exports only selected items when selection exists', () => {
      render(<App />);
      sendInit(initData);
      const msgs = makeMessages(3);
      sendMessages(msgs);
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]); // first row checkbox
      mockPostMessage.mockClear();
      fireEvent.click(screen.getByTitle('Export selected to JSON'));
      expect(mockPostMessage).toHaveBeenCalledWith({ command: 'export', items: [msgs[0]] });
    });

    it('removes selected from list on Clear when selection exists', () => {
      render(<App />);
      sendInit(initData);
      sendMessages(makeMessages(3));
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);
      fireEvent.click(screen.getByTitle('Remove selected from list'));
      // Should still have 2 messages
      expect(screen.getByText('msg-2')).toBeInTheDocument();
      expect(screen.getByText('msg-3')).toBeInTheDocument();
      expect(screen.queryByText('msg-1')).not.toBeInTheDocument();
    });
  });

  describe('Ctrl+Click and Shift+Click selection', () => {
    it('toggles checkbox on Ctrl+Click', () => {
      render(<App />);
      sendInit(initData);
      sendMessages(makeMessages(5));

      const row = screen.getByText('msg-2').closest('tr')!;
      fireEvent.click(row, { ctrlKey: true });
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      expect(checkboxes[2].checked).toBe(true); // 0=header, 1=row1, 2=row2
    });

    it('deselects on second Ctrl+Click', () => {
      render(<App />);
      sendInit(initData);
      sendMessages(makeMessages(5));

      const row = screen.getByText('msg-2').closest('tr')!;
      fireEvent.click(row, { ctrlKey: true });
      fireEvent.click(row, { ctrlKey: true });
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      expect(checkboxes[2].checked).toBe(false);
    });

    it('selects range on Shift+Click', () => {
      render(<App />);
      sendInit(initData);
      sendMessages(makeMessages(5));

      // First Ctrl+click row 1
      const row1 = screen.getByText('msg-1').closest('tr')!;
      fireEvent.click(row1, { ctrlKey: true });

      // Shift+Click row 4
      const row4 = screen.getByText('msg-4').closest('tr')!;
      fireEvent.click(row4, { shiftKey: true });

      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      expect(checkboxes[1].checked).toBe(true);
      expect(checkboxes[2].checked).toBe(true);
      expect(checkboxes[3].checked).toBe(true);
      expect(checkboxes[4].checked).toBe(true);
      expect(checkboxes[5].checked).toBe(false);
    });

    it('does not toggle checkbox on normal click (selects message instead)', () => {
      render(<App />);
      sendInit(initData);
      sendMessages(makeMessages(3));

      const row = screen.getByText('msg-2').closest('tr')!;
      fireEvent.click(row);
      expect(screen.getByText('#2')).toBeInTheDocument();
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      expect(checkboxes[2].checked).toBe(false);
    });

    it('does not show detail panel when clicking checkbox', () => {
      render(<App />);
      sendInit(initData);
      sendMessages(makeMessages(3));

      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      fireEvent.click(checkboxes[2]);
      expect(checkboxes[2].checked).toBe(true);
      // Detail panel should not appear (no #2 heading)
      expect(screen.queryByText('#2')).not.toBeInTheDocument();
    });
  });

  describe('Badge placement', () => {
    it('shows message count badge in toolbar', () => {
      render(<App />);
      sendInit(initData);
      sendMessages(makeMessages(3));
      expect(screen.getByText('3 messages')).toBeInTheDocument();
    });

    it('shows selected count badge when items selected', () => {
      render(<App />);
      sendInit(initData);
      sendMessages(makeMessages(3));
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);
      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });
  });
});
