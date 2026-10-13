# Darb 0.2.0: multi-platform implementation and QA

## Implemented

- Platform identity and local-storage migration from existing YouTube courses.
- Shared tracking, checkpoints, completion overlays, and browser autoplay notice.
- X post-scoped players and Facebook players associated with a video permalink.
- Optional platform access, dynamic script registration, and current-page injection.
- Platform labels, missing-thumbnail fallback, and local-only progress storage.
- Sender-origin, tab, frame, activation, and sequence validation.

X and Facebook are **experimental** and require explicit enablement in Settings
or the popup. They support dedicated recorded-video pages, not feeds, live
streams, Reels, Stories, or posts with several ambiguous videos. A short video
forms a single session. Unsupported or inaccessible videos return an error.

## Live-page observations (October 12, 2026)

These observations were made in the user's connected Brave browser. They are
player/DOM inspection, not evidence of a full installed-extension smoke test.

| Platform | Page | Observed |
| --- | --- | --- |
| X | https://x.com/hayatomaruu/status/2109373280041816140 | Post-scoped `article[data-testid="tweet"]`, recorded player duration 7500.336 seconds, seekable range covering the recording |
| Facebook | https://www.facebook.com/NASASCaN/videos/how-nasa-uses-gravity-and-radio-waves-to-study-planets-and-moons/8368792419872400/ | Redirects to `/watch/?v=8368792419872400`; player duration 167.358708 seconds; recommendations have separate players; matching permalink exists in the target player's single-video ancestor |

The test fixture contains synthetic IDs and text with the observed structural
shape. It contains no credentials, account details, or private comments.

## Automated coverage

Tests exercise URL normalization and deceptive hosts, platform-aware duplicates,
legacy migration and recovery backups, player ownership and ambiguity, optional
permission denial/revocation, packaged injection, checkpoint saves, autoplay
blocking, navigation and replacement cleanup, exactly-once completion, session
eight continuation, same-tab reuse, and stale/foreign progress reports.

Run:

```sh
npm run typecheck
npm test
npm run build
npm run build:firefox
npm run zip
npm run zip:firefox
```

Inspect both generated manifests: X/Facebook hosts must be optional, and social
scripts must not appear in static `content_scripts`. Firefox MV2 lists the
optional origins in `optional_permissions`; Chrome MV3 uses
`optional_host_permissions`. The `scripting` permission loads packaged social
scripts after the selected site's host access is granted.

## Verified local checks

- TypeScript check: passed.
- Automated tests: 80 passed across 13 files.
- Chrome and Firefox production builds: passed.
- Chrome/Firefox ZIP manifests: packaged social script present, only YouTube
  registered statically, X/Facebook origins optional in each browser's format.
- Firefox reviewer source archive: includes new source, tests, dependency lock,
  and build instructions.
- Git whitespace check: passed.

## Required before claiming stable support

Install the production builds in Chrome and Firefox and complete the manual
matrix in `multi-platform-video-plan.md`, including two recordings per platform,
one with multiple sessions. Test permission enable/revoke and browser restart
in both browsers. Verify seeking, mid-roll ads, fullscreen/player replacement,
private/deleted videos, and end-of-session Continue with actual platform players.

No store upload, publication, or stable-support claim is part of this local
implementation. Existing store releases are unchanged. See the plan for the
release gates; these browser checks remain pending.

## Try the local build

1. Build/install Darb 0.2.0 as a development extension.
2. Open an individual X post or dedicated Facebook video page.
3. Click Darb and enable the platform when prompted, or enable it in Settings.
4. If metadata is unavailable, press Play on the original player and retry.
5. Create a course, start a session, pause, and use Continue to check the checkpoint.

The Firefox ZIP is unsigned; use `about:debugging` → This Firefox → Load
Temporary Add-on for development. Public Firefox installation requires Mozilla
signing.

## X advertisement false-positive fix

The user-reported X post failed because `placementTracking` was interpreted
as an advertisement marker. Live DOM inspection showed the same wrapper on
ordinary post and reply videos. Removed that unsupported inference (including
the equally ambiguous Facebook `data-ad-preview` attribute). The regression
test verifies metadata extraction from a normal X video inside the wrapper.
Permalink ownership and duration-change suspension remain active.

Rebuilt Chrome and Firefox packages. The user must reload the unpacked extension
and refresh the X tab to replace the already-injected script. Installed-browser
verification of this fix remains pending because browser automation cannot open
extension-management URLs.

## Completion checks (October 13, 2026)

Added a cancellation regression: a restore that is stopped while settings are
loading must not attach controls or start playback afterward. Both browser
builds are included in GitHub CI. Local source/build checks are complete; the
installed Chrome/Firefox live-site matrix remains a release gate.
