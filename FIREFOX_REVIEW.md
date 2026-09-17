# Firefox reviewer build instructions

This source archive corresponds to Darb version 0.1.0.

## Environment

- Ubuntu 24.04 LTS or another current Linux distribution
- Node.js 24.14.0
- npm 11.9.0
- No global build tools are required

The project declares Node.js 20.19.0 or newer. The versions above match
Mozilla's default reviewer environment at the time of submission.

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

Darb runs a content script only on `*.youtube.com`. It reads the active video's
public metadata, controls the local YouTube HTML5 player during an explicitly
started learning session, and stores courses, settings, and progress in browser
local storage. It does not transmit data outside the browser.

The generated React runtime contains framework-managed `innerHTML` assignments
that Mozilla's static validator may report. Darb's own source does not assign
dynamic HTML; the YouTube completion overlay is assembled with DOM APIs and
`textContent`.

No account or reviewer credentials are required.
