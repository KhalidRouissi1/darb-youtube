# Contributing to Darb

Thanks for helping people finish the long courses they save on YouTube.

Darb welcomes bug fixes, documentation, accessibility improvements, design
work, tests, translations, and focused feature proposals. You do not need to
ask before fixing a documented issue. For larger features, open an issue first
so we can agree on the user problem and the smallest useful solution.

## Start here

- Read the [README](README.md) for the product and installation flow.
- Read the [architecture guide](docs/architecture.md) before changing storage,
  playback, messaging, or tab ownership.
- Search [existing issues](https://github.com/KhalidRouissi1/darb-youtube/issues)
  before opening a new one.
- Never include private videos, course data, browsing history, credentials, or
  access tokens in an issue, test, screenshot, or pull request.

## Development setup

Requirements:

- Node.js 20.19 or newer
- npm
- Chrome, Brave, Edge, or another Chromium browser

Fork the repository, then run:

```bash
git clone https://github.com/YOUR-USERNAME/darb-youtube.git
cd darb-youtube
npm ci
npm run dev
```

The development configuration opens Brave from `/usr/bin/brave`. If your
browser is installed elsewhere, update `web-ext.config.ts` locally.

To load a production build manually:

```bash
npm run build
```

Open your browser's extensions page, enable **Developer mode**, select
**Load unpacked**, and choose `.output/chrome-mv3`.

## Find something to work on

Good first contributions include:

- Reproducible fixes for YouTube navigation or playback edge cases
- Accessibility and keyboard-navigation improvements
- Clearer empty, loading, and error states
- Documentation and installation improvements
- Focused tests for session, progress, storage, or messaging logic

For a bug, include:

1. Browser name and version
2. YouTube page type, such as a standard video, live video, or premiere
3. Exact reproduction steps
4. Expected and actual behavior
5. Console errors with personal information removed

Use the repository's
[bug report or feature request form](https://github.com/KhalidRouissi1/darb-youtube/issues/new/choose).

## Make a change

1. Create a branch from the latest `main`.
2. Keep the change focused on one problem.
3. Follow the existing TypeScript, React, and Tailwind patterns.
4. Add tests when behavior or failure handling changes.
5. Test the affected flow in a real browser.

Useful commands:

```bash
npm run typecheck
npm test
npm run build
```

Run all three before opening a pull request.

## Engineering rules

- Keep browser permissions as narrow as possible.
- Keep persistent mutations in the background worker.
- Validate stored data and runtime messages at their boundaries.
- Keep YouTube player and navigation code inside `src/lib/youtube`.
- Treat tab changes, browser restarts, and YouTube's client-side navigation as
  normal behavior.
- Preserve local-only storage unless a proposal explicitly discusses consent,
  privacy, and migration.
- Do not add analytics, advertisements, a backend, or external AI services
  without prior discussion.
- Do not commit generated `.output` files, dependencies, credentials, or user
  data.

## Pull requests

A useful pull request explains:

- The user-visible problem
- What changed and why
- How reviewers can verify it
- Any permission, privacy, storage, or migration impact

Include screenshots or a short recording for visible changes. Keep unrelated
cleanup in a separate pull request. A maintainer may ask you to reduce the
scope before review.

By contributing, you agree that your work will be released under Darb's
[MIT License](LICENSE) and that you will follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Security reports

Do not open a public issue for a vulnerability. Follow the private reporting
instructions in [SECURITY.md](SECURITY.md).
