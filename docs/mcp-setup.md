# Connect an AI app to Darb

Darb's optional MCP companion gives compatible desktop AI clients access to the
courses and playlists you choose to share. It runs locally; the documentation
website is not a hosted MCP server.

## Requirements

- Darb with the Assistant workspace (not the original 0.1.0 extension).
- Node.js 20.19 or newer.
- Codex desktop/CLI, Claude Code, or another stdio-capable MCP client.
- Linux for guided setup and native browser installation. Brave, Chrome and
  Firefox are supported by the current installer; Windows/macOS live installers
  are not included.

Install the published companion:

```sh
npm install --global @khalidrouissi/darb-mcp
darb-mcp --version
```

Version 0.5.5 introduces the interactive wizard and supported Codex desktop
executable detection. Older packages require explicit setup options. Check the
published npm version; installing an older release does not include newer fixes.

## Live browser setup

1. Open Darb → Dashboard → **Assistant** and select courses/playlists to share.
2. Click **Save live access settings** and approve native messaging. On Firefox,
   approve optional data consent as well.
3. Click **Download private connection file**. Keep it local and private.
4. With a companion that includes guided setup, run:

   ```sh
   darb-mcp setup
   ```

5. Choose Codex or Claude Code, live mode, the browser holding Darb and your file.
6. Return to Darb and save live access settings again to reconnect.
7. Keep that browser profile open, restart/reconnect the AI client and use a fresh
   session. Ask: **Use Darb to list my shared courses and show my next session.**

**Success means a real Darb tool call returns a course you chose to share.**
A successful install message alone does not verify browser access.

## Explicit setup (including older companions)

This route requires the selected client's terminal executable in PATH:

```sh
darb-mcp setup --client codex --browser brave --connection /absolute/path/darb-connection.json
```

Change `codex` to `claude` for Claude Code; choose `chrome` or `firefox` as needed.
If Zsh suggests changing `codex` to `.codex`, answer **n**.

If an older companion cannot find Codex desktop's executable, follow the manual
stdio setup in the [package guide](../packages/darb-mcp/README.md). Codex's default
MCP configuration is `~/.codex/config.toml`; preserve unrelated settings.

## Read-only snapshot

In Assistant, select courses/playlists and choose **Export selected data**. Select
snapshot mode in the wizard, or use explicit setup:

```sh
darb-mcp setup --client codex --snapshot /absolute/path/darb-snapshot.json
```

The export is frozen at download time. It exposes four read-only tools: list
courses, inspect a course, find its next session and preview a time-budgeted plan.
Export again to refresh it. It cannot open videos or save playlists.

## Live tools and approvals

The live server adds selection-draft reading, playlist previews, requests to save
a preview, and playback requests. Selection and playback have separate opt-in
scopes. Review requested saves/playback in Darb before they run. The assistant
cannot mark sessions completed or read workspace notes.

Use **Disconnect and revoke** to rotate the pairing key and stop old connections.
To reconnect, download a new private file and rerun setup. Revocation does not
remove data already returned to an AI client.

## Troubleshooting

- **Tools missing:** confirm the server is enabled in the selected AI client and
  restart/reconnect it. An existing chat may not gain newly registered tools.
- **Darb disconnected:** open the paired browser profile and save live access
  settings again. Keep that profile open during use.
- **No courses:** save the sharing selections. Check the browser profile; snapshots
  must be exported again after changes.
- **Setup cannot find Codex:** check the companion version. Guided 0.5.5 supports
  known bundled Linux desktop paths; older setup expects a terminal CLI.
- **Node/package moved:** rerun setup to refresh native-host executable paths.
- **Revoked pairing:** use a freshly downloaded connection file.

Normal server startup never edits client configuration. Explicit setup installs
the browser host and registers the selected Darb server in the client's user
configuration. Keep the global companion installation in place for live access.

Read the [privacy policy](privacy.md). The bridge is local, but your AI provider
may process the information returned to its client.

HackerTube snapshot exports require companion 0.5.6 or newer. The local source
includes this compatibility update; check npm availability before relying on it.
