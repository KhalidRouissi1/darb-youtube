# QA report

## Baseline and automated verification

Run on 2026-09-17 with Node/npm from the repository workspace.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | Passed: 32 tests across 7 files |
| `npm run build` | Passed: Chrome Manifest V3 package generated |
| `npm run zip` | Passed: `.output/darb-0.1.0-chrome.zip` generated |
| Development profile launch | Passed: WXT built and opened its isolated Brave profile |
| `npm run zip:firefox` | Passed: extension and reviewer source ZIPs generated |
| Mozilla `web-ext lint` | Passed: 0 errors, 0 notices, 2 React runtime warnings |
| Firefox temporary install | Passed: packaged build installed and started in Firefox headless mode |

The two Mozilla warnings identify framework-managed `innerHTML` assignments in
the bundled React runtime. Darb's own completion overlay uses DOM creation APIs
and `textContent`; the reviewer source package documents the warnings.

The suite includes a legacy playback migration regression: the prior global
checkpoint is moved into its matching session and the unowned active record is
discarded.

## Live YouTube QA

Not yet tested in a dedicated browser profile. This is intentionally not marked
as passed. Before release, run the long-course, ad, tab-transfer, navigation,
fullscreen, and settings-combination checks in `implementation-plan.md` and
record the video URL, browser version, extension version, expected behavior,
and result here.
