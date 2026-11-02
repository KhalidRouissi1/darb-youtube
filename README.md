<p align="center"><img src="public/icon-128.png" width="88" alt="Darb logo" /></p>
<h1 align="center">Darb · درب</h1>
<p align="center"><strong>Turn the YouTube course you saved into the course you finish.</strong></p>
<p align="center">
  <a href="https://github.com/KhalidRouissi1/darb-youtube/actions/workflows/ci.yml"><img src="https://github.com/KhalidRouissi1/darb-youtube/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="https://github.com/KhalidRouissi1/darb-youtube/releases/latest"><img src="https://img.shields.io/github/v/release/KhalidRouissi1/darb-youtube?color=f15a24" alt="Latest release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-f15a24" alt="MIT license" /></a>
</p>

A six-hour course is easier to return to when you know your next step. Choose a
study duration and Darb splits the video into sessions, saves your place and
helps you continue from the lesson you're actually working on.

## Install

**Check your version:** the current source targets extension 0.5.9. Published
GitHub/store packages can be older and may not include the workspace or assistant
features below. Check the version on the download page and [changelog](CHANGELOG.md).

### Chrome, Brave and Edge

1. Download `darb-*-chromium.zip` from [GitHub Releases](https://github.com/KhalidRouissi1/darb-youtube/releases/latest).
2. Extract it into a permanent folder. Keep that folder after installation.
3. Open `chrome://extensions`, `brave://extensions` or `edge://extensions`.
4. Enable **Developer mode**, choose **Load unpacked**, and select the extracted
   folder containing `manifest.json`. Select the folder, not the ZIP.
5. Pin Darb, open a recorded YouTube video and click the extension.

Unpacked installations do not update automatically. For an update, replace the
files in the same permanent folder, reload the existing extension entry and
refresh already-open video pages. Removing the extension can erase local data.

### Firefox

Install the signed version from [Mozilla Add-ons](https://addons.mozilla.org/en-US/firefox/addon/darb/).
The store version may differ from this source checkout. Permanent Firefox installs
require a Mozilla-signed package; a locally built ZIP is for submission/testing.

## Start learning

1. Open an individual YouTube video.
2. Choose **Study per day**: 15, 20, 30, 45, 60 or a custom number of minutes.
3. Create the course and start a session.
4. Return through Darb to resume from the saved checkpoint. The video pauses at
   the session boundary; continuing reuses its learning tab.

Open the dashboard from any website to find your saved courses.

## Build a learning path

- **Playlists:** enter **Select videos on YouTube**, select video cards, then save
  a local playlist. Rename it, follow the current-video cursor and see what's next.
  Natural video endings record completion and advance the playlist.
- **Video notes:** save a note at the current player time and click it to return
  to that moment. Toggle **Floating note mode** in the popup for an on-page bubble.
- **Workspace:** organize courses, playlists and notes with nested folders, tags,
  filters and library views. Choose a destination and press **Move** for bulk moves.
- **Graph:** explore saved relationships between learning material. It does not
  infer what you understand or grade your knowledge.

See the [workspace guide](docs/workspace-guide.md).

## Optional AI connection

Connect Codex, Claude Code or another compatible desktop MCP client to the
courses/playlists you choose to share. Ask for your next session or a study plan.
Selection drafting and playback requests have separate scopes and need review
inside Darb. Notes, folders, tags and graph layout are excluded.

Install the companion separately:

```sh
npm install --global @khalidrouissi/darb-mcp
darb-mcp --version
```

[Follow the setup guide](packages/darb-mcp/README.md). The companion has its own
version: the guided wizard is introduced in 0.5.5; older versions require explicit
setup options. Check the version available on npm before following wizard steps.

Ordinary study features do not need an AI app, terminal commands or a Darb account.
The local companion does not provide a model or AI subscription. An assistant
provider may process the information you choose to share.

## Experimental X and Facebook support

Newer builds support individual recorded X posts and dedicated Facebook video
pages. Enable platform access in Settings or from the popup's permission prompt.
Feeds, live streams, Reels, Stories and ambiguous multi-video posts are unsupported.
This support remains experimental; use YouTube for the primary study workflow.

Darb plays videos on their original websites. It does not download or rehost them.

## Privacy

Courses, progress, notes and settings live in your browser profile. Darb has no
hosted backend, advertising or telemetry and does not upload your library to the
developer. Remote thumbnails contact their original hosts. Optional assistant
sharing can send selected data through your AI client to its model provider.

Deleting a course removes its plan/progress. Deleting a playlist keeps individual
courses. Deleting a folder moves its material to Inbox. **Reset all local data**
removes Darb's stored library and settings. There is no automatic cross-device sync.

Read the [privacy policy](docs/privacy.md) and [assistant permissions](docs/mcp-setup.md).

## Development

Requires Node.js 20.19+ (Node.js 24 recommended), npm and a supported browser.

```sh
git clone https://github.com/KhalidRouissi1/darb-youtube.git
cd darb-youtube
npm ci
npm run build
```

Load `.output/chrome-mv3` as an unpacked extension. After rebuilding, reload the
extension and refresh video tabs. `npm run dev` starts WXT's development browser;
`web-ext.config.ts` currently selects Brave from `/usr/bin/brave`.

```sh
npm run audit:unused
npm run typecheck
npm test
npm run test:mcp-package
npm run zip
npm run zip:firefox
```

Browser archives are generated in `.output`. Firefox source reproduction
instructions are in [FIREFOX_REVIEW.md](FIREFOX_REVIEW.md). Build the companion
with `npm run build:mcp`; users of the published npm package need no source checkout.

The [architecture guide](docs/architecture.md) explains storage, playback ownership,
validation and messaging. The background worker serializes durable mutations;
popup and dashboard send intents rather than independently rewriting progress.

## Documentation website

Read the [Darb documentation](https://darb-docs.khalidrouissi7.workers.dev/).
The website source, recordings and Cloudflare configuration are maintained in
[darb-docs](https://github.com/KhalidRouissi1/darb-docs).
The extension and companion build independently of the website.

## Contribute

Bug fixes, accessibility, guides, design and focused feature proposals are welcome.
Read [CONTRIBUTING.md](CONTRIBUTING.md), search [existing issues](https://github.com/KhalidRouissi1/darb-youtube/issues)
and include reproducible steps plus browser/extension versions in bug reports.
Never include connection keys or private course exports.

Darb is licensed under [MIT](LICENSE). You can also [support its development](https://buymeacoffee.com/khalidrouissi).

### HackerTube

Darb also works on [HackerTube](https://hackertube.org/). Open a video, then open Darb to create daily sessions. Playback and
timestamped notes use the embedded YouTube player after it loads. Use
**Select videos** on HackerTube listings to build a local Darb playlist.
Videos keep their YouTube identity, so existing courses and notes are reused.
The local build includes this integration; check store versions before installing.

HackerTube embeds YouTube players. Darb enables the embedded player API, which
can reload an already-open player once. Unavailable, private, live or
embedding-restricted videos cannot be used. The integration is experimental. Session startup has been verified in Brave;
other browser and video edge cases may vary.
