# Changelog

## [0.1.2] - 2025-05-04

### Added

- **Refresh button** on queue/topic/subscription entity editor views — reloads entity data (properties, runtime stats, message counts) as if re-opening the view.
- **Tree refresh syncs open webviews** — when refreshing a node in the tree explorer (or the entire tree), all open entity editor webviews for that namespace are automatically refreshed with fresh data.

### Fixed

- Open entity views no longer show stale data after tree-level refresh operations (e.g. after sending messages, purging, or manual refresh).
