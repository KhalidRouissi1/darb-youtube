# Changelog

## Unreleased — extension 0.5.4

### Learning workspace

- Local playlists built from explicitly selected YouTube video cards, with rename,
  current-video position, completion counts and automatic advance at video end.
- Timestamped video notes and optional floating note mode.
- Folders, tags, library filters/views and a graph of saved relationships.
- Single-video detection follows same-tab navigation and recovers from connection
  failures without leaving the popup indefinitely loading.
- Session continuation uses the active lesson and its checkpoint, reusing the
  learning tab. Playlist completion is distinct from a study-session boundary.
- Concurrent MCP calls are queued with a bounded limit and rechecked permissions.
- Optional Linux MCP sharing for selected courses/playlists, read-only study plans
  and user-reviewed playlist/playback proposals. Workspace notes are excluded.
- Experimental recorded-video support for X and Facebook with optional permissions.

These changes are in the current source. A release appears on GitHub or a browser
store only after it is published there.

## MCP companion 0.5.5 — unreleased

- Interactive `darb-mcp setup` with client, mode, browser and downloaded-file choices.
- Detect supported bundled Linux Codex desktop executables when the terminal CLI
  is unavailable.
- Friendly argument/file errors, including Zsh's `codex` → `.codex` correction.

The companion is published separately as `@khalidrouissi/darb-mcp`. Check npm for
the version actually available; extension and companion versions can differ.

## 0.1.0

Initial public release: daily sessions for long YouTube videos, saved resume
checkpoints, local progress tracking and a dashboard accessible from any website.
