# Changelog

## [0.2.0] - 2026-06-16

### Added

- **Inline refresh button** on `Queues` and `Topics` folder nodes in the tree — refreshes the folder without needing right-click.
- **Inline action buttons** on individual queue nodes (visible on hover):
  - **View Messages** (`$(inbox)`) — opens the messages view in peek mode.
  - **Refresh** (`$(refresh)`) — refreshes the queue node (counts, stats).
  - **Send Message** (`$(send)`) — opens the send message dialog.

### Fixed

- `Remove selected` button in the messages view now actually deletes messages from the Service Bus queue (previously it only removed them from the local UI list).
- Resubmitting messages with *Remove from DLQ* enabled now immediately removes them from the messages table in the UI.
- Peek count above 250 now correctly fetches all requested messages by batching `peekMessages` calls (Azure SDK limit is 250 per call).
- `resend`, `delete`, and `moveTo` operations now correctly locate messages by sequence number regardless of their position in the queue (previously only searched in the first 50 messages).

## [0.1.2] - 2025-05-04

### Added

- **Refresh button** on queue/topic/subscription entity editor views — reloads entity data (properties, runtime stats, message counts) as if re-opening the view.
- **Tree refresh syncs open webviews** — when refreshing a node in the tree explorer (or the entire tree), all open entity editor webviews for that namespace are automatically refreshed with fresh data.

### Fixed

- Open entity views no longer show stale data after tree-level refresh operations (e.g. after sending messages, purging, or manual refresh).
