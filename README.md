<p align="center">
  <img src="public/icon-128.png" width="96" alt="Darb logo" />
</p>

<h1 align="center">Darb · درب</h1>

<p align="center">
  <strong>Turn the YouTube course you saved into the course you finish.</strong>
</p>

<p align="center">
  Darb splits long YouTube videos into focused learning sessions, remembers
  where you stopped, and brings you back to the right lesson every time.
</p>

<p align="center">
  <a href="https://github.com/KhalidRouissi1/darb-youtube/actions/workflows/ci.yml"><img src="https://github.com/KhalidRouissi1/darb-youtube/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="https://github.com/KhalidRouissi1/darb-youtube/releases/latest"><img src="https://img.shields.io/github/v/release/KhalidRouissi1/darb-youtube?color=f97316" alt="Latest GitHub release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-f97316" alt="MIT license" /></a>
  <a href="https://buymeacoffee.com/khalidrouissi"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-support%20Darb-FFDD00?logo=buymeacoffee&amp;logoColor=000000" alt="Support Darb on Buy Me a Coffee" /></a>
  <img src="https://img.shields.io/badge/data-local%20only-16a34a" alt="Data stays local" />
  <img src="https://img.shields.io/badge/account-not%20required-334155" alt="No account required" />
</p>

## The problem

A six-hour YouTube course looks useful when you save it. It looks impossible
when you try to finish it.

You lose your timestamp, forget which lesson comes next, open another tab, and
eventually start over. YouTube remembers the video; it does not give you a
learning plan.

Darb does. Choose how long you want to study each day and Darb turns the video
into a course you can make steady progress through.

## Install

### Chrome, Brave, and Edge

1. Download `darb-*-chromium.zip` from the
   [latest GitHub release](https://github.com/KhalidRouissi1/darb-youtube/releases/latest).
2. Extract the ZIP into a permanent folder. Do not delete this folder after
   installation.
3. Open `chrome://extensions`, `brave://extensions`, or `edge://extensions`.
4. Enable **Developer mode**.
5. Select **Load unpacked** and choose the extracted folder.
6. Pin Darb to the browser toolbar.

This short [video installation guide](https://www.youtube.com/watch?v=yNFwFQrc27Q)
shows the same process. Local installations do not update automatically, so
check the [releases page](https://github.com/KhalidRouissi1/darb-youtube/releases)
for new versions.

### Firefox

Darb `0.1.0` has been submitted to Mozilla Add-ons. The signed installation
link will be added here after Mozilla approves the listing.

### Build from source

```bash
git clone https://github.com/KhalidRouissi1/darb-youtube.git
cd darb-youtube
npm ci
npm run build
```

Load the generated `.output/chrome-mv3` directory as an unpacked extension.

## How it works

### 1. Turn a video into a course

Open a regular YouTube video, select Darb, and choose a daily session length:
15, 20, 30, 45, 60, or any custom number of minutes.

### 2. Learn one session at a time

Darb opens the correct timestamp, tracks the active session, and pauses at its
boundary. Your course page shows what is complete and what remains.

### 3. Continue from where you actually stopped

Leave halfway through a session and come back later. Darb resumes from the
saved checkpoint in that session instead of sending you back to the beginning
of the course.

## What Darb gives you

- **A realistic plan.** Long videos become small, non-overlapping sessions.
- **Reliable continuation.** Each session keeps its own resume checkpoint.
- **Visible progress.** See completed sessions, watched time, and time left.
- **The correct next step.** Continue from your current place in the course.
- **YouTube-native playback.** Videos stay on YouTube; Darb controls the normal
  HTML5 player only during an active learning session.
- **A useful dashboard anywhere.** Open Darb from any website to see all your
  courses, today's work, activity, and settings.
- **Local ownership.** Your courses and progress stay inside your browser.
- **No account or subscription.** Darb has no backend, analytics, advertising,
  transcript collection, or external AI service.

## A course, not a playlist

Darb is deliberately focused on one job: helping you finish long educational
videos.

It does not download videos, replace YouTube, or pretend every minute watched
is meaningful progress. It creates a clear path through the material and keeps
that path intact across tabs, sessions, and browser restarts.

## Privacy by construction

Darb works without a server. It stores the following in
`chrome.storage.local`:

- YouTube video details needed to display the course
- Session timestamps and completion dates
- Resume checkpoints and overall progress
- Your Darb settings

Nothing is sent to Darb's developer. Deleting a course removes its local plan
and progress; **Reset all local data** removes every Darb storage key.

Read the complete [privacy policy](docs/privacy.md).

## Browser support

| Browser | Status |
| --- | --- |
| Chrome | Installable from GitHub Releases |
| Brave | Installable from GitHub Releases |
| Microsoft Edge | Installable from GitHub Releases |
| Other Chromium browsers | Expected to work through Manifest V3 |
| Firefox | Submission package ready for AMO |

## Development

Requirements:

- Node.js 20.19 or newer
- npm
- A Chromium browser

Start the development browser:

```bash
npm ci
npm run dev
```

The development configuration currently launches Brave from `/usr/bin/brave`.
If your browser lives elsewhere, update `web-ext.config.ts`.

Run the complete verification suite:

```bash
npm run typecheck
npm test
npm run build
```

Create the Chrome Web Store archive:

```bash
npm run zip
```

Build the Firefox package:

```bash
npm run build:firefox
```

## Architecture

Darb is a local-first browser extension built with WXT, React, TypeScript,
Tailwind CSS, Zustand, and Zod.

```text
YouTube tab
  → content script reads video state and controls the player
  → background worker owns the active learning session
  → validated repository saves progress in browser storage
  → popup and dashboard react to storage changes
```

The important rule is that UI surfaces send intentions; they do not rewrite
course data independently. The background worker serializes persistent changes,
and every stored value is validated when read. Activation IDs and sequence
numbers prevent stale tabs from overwriting newer progress.

Read the [architecture guide](docs/architecture.md) for the complete runtime
flow and reliability decisions.

## Project structure

```text
src/
├── components/          Shared UI and brand components
├── entrypoints/
│   ├── popup/           Video detection and course creation
│   ├── dashboard/       Courses, activity, and settings
│   ├── background.ts    Tab orchestration and persistent mutations
│   └── content.ts       YouTube metadata and playback bridge
├── features/            Course and settings features
├── lib/
│   ├── messaging/       Validated runtime message contracts
│   ├── storage/         Browser storage repository
│   ├── youtube/         Player, metadata, and navigation logic
│   ├── validation/      Runtime schemas
│   └── utils/           Session and progress calculations
└── types/               Domain types
```

## Engineering principles

- Request the smallest browser permissions that can do the job.
- Keep user data local unless a future feature receives explicit consent.
- Treat YouTube navigation, tab ownership, and browser restarts as normal
  behavior rather than edge cases.
- Validate browser messages and stored data at runtime.
- Keep session calculations pure and covered by focused tests.
- Prefer a small reliable learning tool over a crowded feature list.

## Roadmap

The immediate goal is a stable Chrome and Firefox release. After that:

- YouTube chapter-aware splitting
- Playlist courses
- Notes, quizzes, and flashcards
- Learning streaks
- Markdown and Notion export
- Optional cloud synchronization
- Bring-your-own AI integrations

Have a different priority? Open a
[feature request](https://github.com/KhalidRouissi1/darb-youtube/issues/new/choose)
and describe the learning problem first.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), keep
each pull request focused, and include reproduction or verification steps.

Found a bug? [Open an issue](https://github.com/KhalidRouissi1/darb-youtube/issues/new/choose).
Found a security problem? Follow [SECURITY.md](SECURITY.md).

## Support Darb

If Darb helps you finish a course, you can
[support its development on Buy Me a Coffee](https://buymeacoffee.com/khalidrouissi).
Your support helps cover browser-store fees and ongoing maintenance while Darb
remains free and open source.

## License

Darb is open source under the [MIT License](LICENSE).
