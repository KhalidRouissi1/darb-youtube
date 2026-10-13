# Firefox reviewer build instructions

This source archive corresponds to Darb version 0.2.0.

## Environment

- Ubuntu 24.04 LTS or another current Linux distribution
- Node.js 24.14.0
- npm 11.9.0
- No global build tools are required

The project declares Node.js 20.19.0 or newer. The versions above match
the original build instructions; Node.js 20.19.0 or newer is supported.

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
storage. It does not upload progress or course records. Thumbnails are loaded
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

YouTube testing requires no Darb account. See `docs/multi-platform-qa.md`
for the current verification status and platform limitations.
