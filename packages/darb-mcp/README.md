# Darb MCP

Connect Codex or Claude Code to the courses you choose to share from
[Darb](https://github.com/KhalidRouissi1/darb-youtube), an open-source browser
extension for learning from videos.

Requires Node.js 20.19+ and a desktop MCP client. Guided setup and the live browser
installer currently support **Linux**, with Chrome, Brave or Firefox. Windows and
macOS live installers are not included in this release. No Darb account, API key,
cloud service or repository checkout is required.

## Install

```sh
npm install --global @khalidrouissi/darb-mcp
darb-mcp --version
darb-mcp --help
```

Use a permanent global installation for the live bridge: the browser registration
references that installed program. Re-run setup after moving/removing Node.js or
changing its installation. Installing/upgrading the package does not configure
clients, read browser data or register a native host automatically.

## Easy setup

Run one command:

```sh
darb-mcp setup
```

The interactive wizard asks you to choose Codex or Claude Code, live connection or
read-only snapshot, and your browser. It finds recent Darb exports in Downloads
(including Linux's configured localized Downloads folder), newest first. Choose
one by number. You can also paste or drag a file from another folder. The wizard
does not print file contents. There are no client/browser names for the shell to
spell-correct and no connection path to type when the download is found.

### Live browser connection

1. In Darb's dashboard, open **Assistant** and select courses/playlists to share.
2. Click **Save live access settings** and approve native messaging. On Firefox,
   also accept the optional data-consent prompt.
3. Click **Download private connection file**. Keep it local; never paste its
   contents into a chat, issue or repository.
4. Run `darb-mcp setup`, choose your client, **Live**, browser and downloaded file.
5. Return to Darb and click **Save live access settings** again to reconnect.
6. Keep that browser profile running and start a new client session. Ask:

> Use Darb to list my shared courses and show my next session.

The wizard registers the native browser host and the named `darb-live` MCP server
in the selected client's user configuration. It does not log in to your AI account.
On Linux, setup checks for Codex in PATH, then supported desktop installation
locations, including `/usr/lib/chatgpt/resources/codex`. A separate Codex CLI
installation is not required when a bundled desktop executable is found.
Live access is limited to explicitly shared courses/playlists. Selection drafting
and playback requests have separate opt-in scopes. Review and approve AI requests
in Darb. The assistant cannot mark sessions completed. Notes are excluded.

The bridge uses native messaging and a private, authenticated Unix socket; no
public HTTP server is opened. Pairing files are private under
`~/.local/share/darb-mcp`; browser native-host registrations use the standard Linux
user configuration directory. **Disconnect and revoke** rotates access; download
a fresh connection file and rerun setup to reconnect.

### Read-only snapshot

In Darb → Assistant, select courses/playlists and choose **Export selected data**.
Run `darb-mcp setup`, choose your client, **Read-only snapshot**, and the downloaded
export. This registers `darb-snapshot`. Restart the client session and use the same
prompt above.

Snapshot mode exposes four read-only tools: `darb_list_courses`, `darb_get_course`,
`darb_get_next_session` and `darb_preview_study_plan`. It cannot open videos, update
progress or refresh browser data. Replace the export and reconnect to refresh it.
Notes are excluded.

### Advanced non-interactive setup

```sh
darb-mcp setup --client codex --browser brave --connection /absolute/path/connection.json
darb-mcp setup --client claude --snapshot /absolute/path/export.json
```

If Zsh asks to correct `codex` to `.codex`, answer **n**, or use the interactive
wizard. Setup reports common errors without dumping internal validation stacks.

## Other MCP clients and manual setup

A desktop client supporting stdio can run:

```sh
darb-mcp --snapshot /absolute/path/export.json
# Or, after installing the native host:
darb-mcp --live /absolute/path/private-profile.json
```

Commands that only print configuration instructions:

```sh
darb-mcp --setup-snapshot /absolute/path/export.json
darb-mcp --setup-live /absolute/path/private-profile.json
```

Manual browser registration, without modifying a client:

```sh
darb-mcp --install /absolute/path/darb-connection.json brave
```

The installer prints the installed private configuration path and exact client
registration commands. Cloud-only chats cannot directly access this local stdio
connection. A `chrome-extension://…/mcp-help.html` URL is local documentation, not
an MCP endpoint.

## Troubleshooting

- Run `codex mcp list` or `claude mcp list`, then inspect `/mcp` in a new session.
- If the named server already exists, inspect it before replacing/removing it;
  setup never removes an existing registration automatically.
- For live mode, check Darb → Assistant, granted permissions, selected courses and
  that the paired browser profile is open. Snap/Flatpak browser registrations are
  not covered by this release's installer.
- If registration fails after browser installation, the native host stays installed.
  Use the manual commands above; no course data is deleted.

Report problems in [GitHub Issues](https://github.com/KhalidRouissi1/darb-youtube/issues).
Include your OS, browser, Node.js version and error message. Remove secrets first.

MIT licensed. Source: [Darb repository](https://github.com/KhalidRouissi1/darb-youtube).
