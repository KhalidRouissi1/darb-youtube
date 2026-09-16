# QA report

## Baseline and automated verification

Run on 2026-09-15 with Node/npm from the repository workspace.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | Passed: 30 tests across 7 files |
| `npm run build` | Passed: Chrome Manifest V3 package generated |
| `npm run zip` | Passed: `.output/darb-0.1.0-chrome.zip` generated |
| Development profile launch | Passed: WXT built and opened its isolated Brave profile |

The suite includes a legacy playback migration regression: the prior global
checkpoint is moved into its matching session and the unowned active record is
discarded.

## Live YouTube QA

Not yet tested in a dedicated browser profile. This is intentionally not marked
as passed. Before release, run the long-course, ad, tab-transfer, navigation,
fullscreen, and settings-combination checks in `implementation-plan.md` and
record the video URL, browser version, extension version, expected behavior,
and result here.
