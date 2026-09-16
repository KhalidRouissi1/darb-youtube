# Contributing to Darb

Thanks for helping make long-form learning easier to finish.

## Setup

1. Fork and clone the repository.
2. Install Node.js 20.19 or newer.
3. Install dependencies and start the extension:

   ```bash
   npm install
   npm run dev
   ```

4. Open a YouTube video in the temporary browser profile.

Update `web-ext.config.ts` if your Chromium binary is not `/usr/bin/brave`.

## Before opening a pull request

Run every quality check:

```bash
npm run typecheck
npm run test
npm run build
```

Add tests for business logic and failure cases. Keep YouTube-specific selectors
inside `src/lib/youtube`, validate anything stored locally, and avoid broad
extension permissions.

## Pull requests

- Keep each pull request focused on one change.
- Explain the user problem and the chosen behavior.
- Include manual verification instructions.
- Include screenshots for visible UI changes when possible.
- Do not introduce analytics, external APIs, or a backend without prior
  discussion.

## Reporting bugs

Use the bug report template. Include the browser version, the video URL format
(without private information), reproduction steps, and any visible error.

## Security and privacy

Never include access tokens, private video information, transcripts, browsing
history, or personal course data in issues or tests.
