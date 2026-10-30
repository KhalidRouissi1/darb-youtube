# Firefox reviewer build instructions

This source archive corresponds to Darb version 0.5.4.

## Environment

- Linux
- Node.js 24.21.0
- npm 11.19.0
- No global build tools are required

The project declares Node.js 20.19.0 or newer. The versions above were used
for the current release-candidate validation.

## Reproduce the submitted extension

From the root of this source archive, run:

```bash
npm ci
npm run build:firefox
```

The resulting extension is written to:

```text
.output/firefox-mv2/
```

To create the same ZIP layout used for submission, run:

```bash
npm run zip:firefox
```

The installable archive is written to `.output/` with `firefox` in its name.

## Build system

Darb uses WXT, Vite, TypeScript, React, and Tailwind CSS. All build tools and
third-party libraries are open-source npm packages pinned by
`package-lock.json`. The project does not use obfuscation, proprietary build
tools, remote code, generated secrets, or environment variables.

## Extension behavior

Darb registers its YouTube content script statically. X and Facebook scripts
are packaged locally and registered dynamically only after the user grants the
selected platform's optional host permissions. The scripting API also connects
already-open pages after access is granted. The additional platforms are
experimental and operate only on dedicated recorded-video pages.

Darb reads video metadata, controls the original HTML5 player during an
explicitly started session, and saves courses/settings/progress in local
storage. It does not upload progress or course records to the developer. Optional
assistant exports and live sharing are described below. Thumbnails are loaded
from their original image hosts; see `docs/privacy.md`.

To test optional platform support, open a supported video page, click Darb,
and choose Enable; or enable the platform in the dashboard Settings. Press
Play on the original video if its metadata has not loaded. User account access
may be needed on X or Facebook depending on the selected video. No credentials
are bundled with this source archive.

The generated React runtime contains framework-managed `innerHTML` assignments
that Mozilla's static validator may report. Darb's own source does not assign
dynamic HTML; the shared completion overlay is assembled with DOM APIs and
`textContent`.

YouTube testing requires no Darb account. Additional platforms remain experimental; feeds, live streams, Reels and Stories are unsupported.

## Optional playlist and MCP features

YouTube search and channel cards have an explicit selection mode, opened from
the popup. Review, reorder, and save the resulting local playlist in the
dashboard. A playlist stores its own current-video cursor and preserves course
checkpoints when edited. No YouTube OAuth, remote script, or video download is used.

The Assistant screen offers explicit exports of selected course/playlist data.
The separate optional Linux companion uses nativeMessaging and authenticated
Unix sockets. Its SDK is not included in the browser extension bundle. Build it
with `npm run build:mcp`. Setup and review instructions are in docs/mcp-setup.md.
Normal courses and playlists work without the companion. Firefox nativeMessaging
and optional browsingActivity/websiteActivity/websiteContent data consent are
requested only when the user enables live access. Scope is enforced in the
extension; proposals and playback requests need user approval in Darb.

Assistant providers may receive information explicitly shared with them. The
updated privacy policy explains this optional transfer; do not use older
submission language claiming that no third party can access exported data.
Real installed-profile review is still required before store submission.

## Workspace review

The dashboard includes local folders, tags, notes, library views and an SVG graph.
Notes render as React text and a small Markdown subset; raw HTML is not executed.
Workspace data stays in local storage and is excluded from MCP and snapshot
responses. To test, open the dashboard, create a folder and note in Library, then
open Graph. Course-linked timestamp buttons use the ordinary owned-tab playback
flow. Moving material or deleting folders preserves course progress.
