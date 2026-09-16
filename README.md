# Darb · درب

Turn long YouTube videos into structured, trackable daily courses.

Darb is an open-source Manifest V3 browser extension for Chrome, Edge,
Brave, and other Chromium browsers. It divides educational YouTube videos into
manageable daily sessions, resumes at the correct timestamp, pauses at session
boundaries, and stores progress locally.

## Features

- Detects the active YouTube video's title, channel, thumbnail, and duration.
- Creates 15, 20, 30, 45, 60, or custom-minute learning sessions.
- Handles duplicate videos with open-existing and create-another choices.
- Opens each session at its exact YouTube timestamp.
- Pauses and completes a session at its configured end time.
- Resumes incomplete sessions from their last saved checkpoint.
- Tracks completion percentage, watched time, and remaining time.
- Includes course, session detail, today, activity, and settings screens.
- Supports manual session completion, dark mode, and optional notifications.
- Requires no account, backend, analytics, transcript, or external AI API.

Playlist conversion and AI features are intentionally outside the MVP.

## Install for development

Requirements:

- Node.js 20.19 or newer
- npm
- A Chromium browser

```bash
git clone https://github.com/KhalidRouissi1/darb-youtube.git
cd darb
npm install
npm run dev
```

This development environment is configured to launch the installed Brave
binary at `/usr/bin/brave`. Change `binaries.chrome` in
`web-ext.config.ts` if your Chromium executable is elsewhere.

WXT launches a temporary browser profile with Darb installed. Keep the
terminal process running for hot reload.

## Use Darb

1. Open a standard `youtube.com/watch` video.
2. Open the browser's Extensions menu and pin Darb if desired.
3. Click Darb.
4. Choose a daily session duration.
5. Click **Create course**.
6. Start the first session or open the dashboard.

When a session reaches its end, Darb applies your pause and completion
settings once, then releases control of the player. Incomplete sessions resume
from their last saved checkpoint. After a browser restart, select **Continue**
to establish a fresh tracked tab.

If the popup cannot connect after first installing the extension, reload the
existing YouTube tab once.

## Production build

```bash
npm run typecheck
npm run test
npm run build
```

The unpacked extension is generated at:

```text
.output/chrome-mv3/
```

To install it manually:

1. Open `chrome://extensions` or `brave://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `.output/chrome-mv3/`.

Create a store-ready archive with:

```bash
npm run zip
```

## Architecture

```text
src/
├── components/          Shared UI and brand components
├── entrypoints/
│   ├── popup/           Active-video detection and course creation
│   ├── dashboard/       Course, detail, activity, and settings UI
│   ├── background.ts    MV3 orchestration and tab/notification handling
│   └── content.ts       YouTube metadata and playback bridge
├── features/
│   ├── courses/         Course store, cards, and detail view
│   └── settings/        Local extension preferences
├── lib/
│   ├── messaging/       Validated runtime message contracts
│   ├── storage/         Chrome Storage repository
│   ├── youtube/         Selectors, metadata, SPA navigation, and player logic
│   ├── validation/      Zod schemas for stored and page-derived data
│   └── utils/           Sessions, progress, and time formatting
└── types/               Domain types
```

See [docs/architecture.md](docs/architecture.md) for the runtime data flow and
reliability decisions.

## Manifest permissions

- `storage`: saves courses, settings, and active playback locally.
- `activeTab`: reads the current tab only after the user opens Darb.
- YouTube content-script match: runs only on `*.youtube.com`.
- `notifications` (optional): requested only when the user enables it.

Darb does not request broad access to unrelated websites.

## Testing

```bash
npm run typecheck
npm run test
npm run build
```

The unit suite covers session generation, final short sessions, time
formatting, progress, course completion, next-session selection, storage
serialization, legacy checkpoint migration, duplicate handling, corrupt data,
YouTube URL parsing, playback boundaries, and restart recovery.

## Screenshots

Screenshots are kept out of source until the first store submission so they
reflect the packaged release UI. The dashboard, popup, course detail, and
completion overlay are all included in the production build.

## Privacy

All course and playback data is stored in `chrome.storage.local`. Darb does
not download or rehost videos, collect transcripts, send viewing history to a
server, or run analytics. See [docs/privacy.md](docs/privacy.md).

## Roadmap

- YouTube chapter-aware splitting
- Playlist courses
- Notes, quizzes, and flashcards
- Learning streaks
- Markdown and Notion export
- Optional cloud synchronization
- Bring-your-own AI provider integrations

These features will be considered only after the local MVP is stable.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). By participating, you agree to follow
the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
