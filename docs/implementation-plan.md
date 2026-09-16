# Darb reliability and redesign implementation brief

## 1. Goal and scope

Make this open-source YouTube course extension reliable for everyday use with long videos, including a six-hour course. Improve the popup, dashboard, course detail, and YouTube overlay.

This is an implementation plan based on source inspection, not a report of reproduced browser bugs. No baseline tests or live browser tests were run while writing it.

Keep WXT, React, TypeScript, Zustand, Zod, and `chrome.storage.local`. Do not introduce UltraStorage, a server, accounts, cloud synchronization, AI, or playlist conversion. Do not rewrite the project from scratch. Preserve existing saved courses.

Implement the phases below in order. Finish and verify each phase before proceeding. Read any applicable AGENTS.md instructions first. Use the frontend-design skill for the visual redesign if available.

## 2. Findings that drive this work

| File | Observed behavior | Consequence to reproduce/test |
| --- | --- | --- |
| `src/entrypoints/background.ts` | Opening a session always sets `lastKnownSeconds` to its start. | Continue loses partial-session progress. |
| `src/lib/youtube/session-tracker.ts` | Completion does not detach timers/listeners; position writes continue. | A cleared active record can be recreated by stale events. |
| Same | Multiple asynchronous restore calls share one cleanup variable without cancellation. | Old initialization can attach a second tracker. |
| Same | Ad detection only guards initial setup; any `ended` event completes the session. | Ads can produce false progress or completion. |
| `src/types/youtube.ts` | Active playback has no tab owner or activation identifier. | Multiple tabs can act on the same global session. |
| `src/lib/storage/repository.ts` and `src/features/courses/course-store.ts` | Multiple contexts read and rewrite the entire course list. | Concurrent changes can overwrite each other. |
| `src/lib/youtube/playback.ts` | Any position inside the session is preferred over the saved checkpoint. | Explicit activation may keep an unintended timestamp. |
| `src/lib/utils/courses.ts` | “Watched” is calculated from completed session lengths. | Manual completion and skipped playback are presented as actual watch time. |
| `tests/playback.test.ts` | Tests exercise pure timestamp helpers. | Tracker lifecycle, browser messages, and actual extension behavior are untested. |

## 3. Product behavior to implement

These defaults settle ambiguous behavior; implement them consistently.

- **Continue:** open the first incomplete session at its saved checkpoint, or its start if none exists.
- **Open a particular session:** resume that session's checkpoint. A separate **Restart session** action starts at its beginning without erasing its completed status.
- **Review completed session:** start at its beginning; do not generate another completion notification or change its completion date.
- **Seeking:** preserve native YouTube seeking inside the session. Clamp seeks before its start back to the start. Seeking to/past its end counts as reaching the boundary, preserving the existing product behavior. Do not describe this as verified watch time.
- **One active tracked session:** starting another session transfers ownership. The old tab may keep playing normally, but loses extension tracking and boundary controls.
- **Boundary:** apply the settings table below exactly once per activation, then release tracking. Playing again after this is ordinary YouTube playback until another session is started.
- **Ads:** do not seek, pause, save positions, or complete a session based on ad playback. Resume tracking the course video after the ad.
- **Navigation:** leaving the tracked video releases ownership but retains the last checkpoint. Returning alone does not seize ownership from another tab; the user can press Continue.
- **Reload:** the owning tab can restore tracking after a reload when its identity still matches. After browser restart, preserve checkpoints but require Continue to establish a fresh owner; do not trust persisted tab IDs across browser sessions.
- **Failed activation:** show an actionable error and retain course/checkpoint data. Do not leave a permanently active phantom session.

| Auto-pause | Auto-complete | At the boundary |
| --- | --- | --- |
| On | On | Pause once, complete once, show completion overlay if enabled. |
| On | Off | Pause once, leave incomplete, optionally show “Session boundary reached” with an explicit Mark complete action. |
| Off | On | Complete once, let YouTube continue, show completion overlay if enabled. |
| Off | Off | Let YouTube continue, leave incomplete, release tracking. |

For incomplete sessions stopped at their boundary, clamp the persisted resume checkpoint to just before the end so Continue does not instantly terminate without playback. A one-second margin is sufficient for normal sessions.

## 4. Phase A — establish the baseline

1. Read package scripts, README, architecture documentation, current storage tests, and all relevant runtime code.
2. Run `npm run typecheck`, `npm test`, and `npm run build`. Record existing failures separately from new failures.
3. Load the unpacked production extension in a dedicated browser test profile. Do not reset the user's browser or extension data.
4. Find a currently playable public YouTube course around six hours long. Record its URL, title, duration, browser version, and extension version in a QA report. Find a second shorter video for navigation tests.
5. Reproduce the findings above where possible. For each failure record steps, expected/actual behavior, and relevant errors. Never claim a live scenario passed based only on mocked tests.

Deliverable: a short baseline section in `docs/qa-report.md`.

## 5. Phase B — give storage one writer and preserve checkpoints

Primary files: `src/lib/storage/repository.ts`, `src/lib/storage/keys.ts`, `src/lib/validation/schemas.ts`, `src/types/course.ts`, `src/types/youtube.ts`, `src/lib/messaging/messages.ts`, `src/entrypoints/background.ts`, `src/features/courses/course-store.ts`, popup and settings callers.

### Data and migration

- Add an optional per-session `resumeSeconds` field to the course session type/schema. Missing means session start. Validate finite bounds against that session's start/end.
- Add a unique `activationId`, owning `tabId`, and explicit activation status (`pending` or `active`) to active playback. Retain course/session/video identity. Use a monotonic report sequence to reject out-of-order position updates within an activation.
- Keep checkpoints durable independently of the active owner. Releasing ownership must not remove a course's checkpoint.
- Add a storage schema version and an idempotent migration. Preserve existing course IDs, session IDs, completion dates, settings, and valid progress. Import a valid legacy `lastKnownSeconds` into its matching session checkpoint, then discard the ownerless legacy active record.
- Back up legacy data before migration. Do not silently delete malformed data or reset everything because one entry fails validation. Expose a useful recovery error while retaining the raw data.
- Validate session indices, unique session IDs, course/session relationships, active-record identity, and checkpoint bounds. Enforce the same 1–720 minute input limits at the utility and schema layers.

### Single-writer operations

- Move persistent mutations behind background commands: create/repair/delete course, set completion, save settings, reset data, start/stop session, report position, and reach boundary.
- Popup, dashboard, content scripts, and Zustand may read/subscribe to storage; they must not directly perform persistent mutations.
- Accept intent such as `{courseId, sessionId, completed}` rather than a stale full course from the dashboard. The worker rereads the current course before changing it.
- Process storage mutations through a shared promise queue in the worker. A failed command must not poison the queue. Read/check/write must happen inside the queue.
- Do not hold this queue while waiting for a tab to load, playback to start, or a content-script reply. Those operations can call back into the worker and deadlock.
- Validate every runtime payload with explicit schemas. Derive the sender tab from the browser-provided sender, not a claimed tab ID in the message. Position/boundary reports must match sender tab, activation ID, course, session, and video.
- Ignore late reports from a superseded owner. Make stop/completion retries idempotent. Return structured results and readable errors.
- Write related course/active updates together where practical, but do not assume multiple Chrome storage keys provide database transactions. On restoration, reconcile active state against current course/session data, including deletion and completion.
- Clear active ownership on browser startup and tab removal; retain checkpoints. Preserve active state across ordinary service-worker suspension and reconstruct decisions from storage.
- Completion notifications happen after durable progress writes. Notification failure must not turn a successful completion into a failed operation.

Tests: simultaneous completion changes preserve both sessions; a save following delete cannot resurrect a course; failed queued command does not block the next command; migration twice is harmless; legacy data survives; malformed data is retained; stale/foreign reports do nothing; partial progress survives ownership transfer and restart.

## 6. Phase C — make activation and tracking deterministic

Primary files: `src/entrypoints/background.ts`, `src/entrypoints/content.ts`, `src/lib/youtube/session-tracker.ts`, `src/lib/youtube/playback.ts`, `src/lib/youtube/navigation.ts`, message types.

### Activation handshake

1. Resolve the requested course/session/checkpoint through a serialized worker operation.
2. Reuse the current valid owner tab for the same video when possible, or an explicitly supplied eligible source tab; otherwise create a tab. Avoid broader permissions just to search every browser tab.
3. Persist a pending activation tied to the chosen tab before sending an activation command. Include activation ID and the authoritative target timestamp.
4. Content initialization must cancel any earlier initialization, verify current video identity, wait for the real content player, seek to the exact target, then attach one tracker.
5. Return success only after attachment. Report autoplay blocking separately: tracking can be ready while the user still needs to press Play.
6. Finalize only if the activation is still current. If a newer request won, discard the old result. On failure clear only that failed activation, never a newer one.
7. Reload recovery asks the worker for the sender tab's current activation. An unrelated tab cannot restore tracking just because its video ID matches.

### Tracker lifecycle

- Replace the unguarded module-global restore flow with a controller using an AbortController or generation token. Check cancellation after every awaited operation, including player waits and play attempts.
- Register cleanup before any later await can fail. Cleanup removes timers, observers, and media/document listeners. Distinguish detach from deleting durable progress.
- Handle navigation, owner change, deletion/reset, extension invalidation, and replacement of YouTube's video element. Do not keep a detached old video element as the player.
- Coalesce navigation events so one transition does not trigger overlapping restores. Use WXT content-context cleanup where supported.
- Check ad state and current video identity on every progress/end/seek path. An `ended` event alone is insufficient evidence of a session boundary.
- Preserve the last content checkpoint across mid-roll ads and revalidate the player after the ad finishes. Avoid a fixed 15-second timeout that treats ordinary long ads as fatal; use cancellable bounded loading waits and a visible waiting/retry state.
- Save position every five seconds while useful, plus a forced save on pause, seek completion, and visibility loss. Page closing is best effort: do not promise asynchronous unload writes always finish. Handle save rejection and show that progress could not be saved.
- Guard boundary processing with a terminal/in-flight state set before asynchronous work. Stop producing progress writes as soon as boundary processing begins.
- Complete/detach once. On persistence failure retain a recoverable error state and provide a bounded retry; never leave an unhandled promise rejection or an endless retry loop.
- Listen for relevant settings changes so the active session follows current settings.

Tests: overlapping restores attach one tracker; cancelled waits attach none; explicit target wins over an unrelated current timestamp; old owner loses control; ad end never completes; player replacement reattaches once; pause forces a checkpoint; completion leaves no writers; autoplay denial reports ready-but-paused; worker/message failures are recoverable.

## 7. Phase D — stabilize metadata and course operations

Primary files: `src/lib/youtube/metadata.ts`, `src/lib/youtube/selectors.ts`, popup, course utilities, background course commands.

- Use one shared URL parser with exact `youtube.com`/subdomain matching and explicit supported routes. Reject lookalike hosts such as `notyoutube.com`; eliminate substring checks in the popup.
- Course creation continues to support standard watch pages only. Give clear messages for unsupported routes, live streams without a finite duration, unavailable/private videos, and player errors.
- Capture video ID before metadata extraction and verify it again after awaited reads. Retry or abort if navigation changed the video. Avoid mixing old page title/duration with the new URL.
- Never accept ad duration as course duration. Prefer metadata verified against the current video ID; revalidate DOM fallbacks after navigation/ad transitions.
- Make duplicate creation deliberate and block repeated submit clicks. Send popup source-tab identity explicitly for validation/reuse, since popup messages do not automatically have `sender.tab`.
- Repairing a duration mismatch currently rebuilds sessions and loses completion. Preserve completion/checkpoints for unchanged ranges; explain and confirm any unavoidable progress reset before destructive repair. Do not arbitrarily map completion onto changed ranges.
- Check six-hour generation: 21,600 seconds / 30 minutes = exactly 12 contiguous sessions. Also test a duration with a shorter final session and invalid/tiny custom inputs.

## 8. Phase E — redesign around the learning task

Primary files: `src/entrypoints/popup/PopupApp.tsx`, `src/entrypoints/dashboard/DashboardApp.tsx`, `src/features/courses/CourseCard.tsx`, `src/features/courses/CourseDetail.tsx`, `src/features/settings/SettingsPanel.tsx`, `src/components/ui/*`, `src/styles/app.css`, `src/lib/youtube/completion-overlay.ts`.

Design direction: a calm, readable learning workspace with restrained color, clear type hierarchy, consistent spacing, and one obvious next action. Avoid tiny low-contrast labels and large decorative panels that bury the session controls.

- **Popup:** detected video title/thumbnail/duration, session length, resulting session count, one Create course action. Existing course shows Continue and View course first. Show loading, ready, save failure, and retry states distinctly.
- **Dashboard:** make the current course/Continue prominent; keep search and filters; show legible course titles and completion counts. Avoid full-page loading flashes on every checkpoint/storage update.
- **Course detail:** show Continue with its saved timestamp, a clear current-session indicator, readable timestamp ranges, and separate Resume/Restart/Mark complete actions. Make long session lists easy to scan without implementing unnecessary virtualization.
- **Progress wording:** rename “Watched” to “Completed content” if it remains based on completed ranges. Keep completion percentage based on completed session count, consistently labeled. Do not invent accurate watch-time tracking as part of this fix.
- **Overlay:** compact boundary/completion status, dismiss, next session, and optional manual completion. Respect the settings table. Handle fullscreen by mounting inside the fullscreen element when needed and responding to fullscreen changes. Keep native controls usable.
- **Shared states:** errors stay near their action, in-flight buttons cannot double-submit, keyboard focus is visible, controls have accessible names, light/dark themes use shared tokens, and reduced motion is respected.
- Inspect actual screenshots in popup dimensions and dashboard widths around 375, 768, and 1440 pixels. Verify long titles, empty/error states, keyboard navigation, and both themes. Do not approve appearance from source code alone.

## 9. Phase F — regression coverage and live QA

Keep existing tests. Add a DOM-capable test environment for controller tests and a packaged-extension browser harness with a persistent test profile. Add dependencies only when needed. Prefer deterministic fixtures for races and failures; live YouTube is a separate smoke test because ads, login state, and network behavior vary.

Suggested test groups:

- `tests/storage.test.ts`: migrations, checkpoint validation, corrupt-data retention.
- New background tests: serialized intent commands, owner validation, activation supersession, completion/retry, notification failure.
- New tracker tests: media event lifecycle, ads, cancellation, settings combinations, cleanup, player replacement.
- Existing playback/YouTube/session tests: explicit resume rules, strict hosts, six-hour/final-short-session cases.
- Browser tests: popup creation → dashboard → activation → checkpoint → reload → completion → next session; deletion and double-click behavior.

Live QA checklist for the packaged extension:

1. Create the selected long course and verify its actual duration/session ranges.
2. Start, pause midway, close/reopen using Continue, and confirm a sensible saved timestamp.
3. Reload while tracking; then restart the browser and Continue again.
4. Seek within the session, before its start, and beyond its end.
5. Verify all four pause/complete settings combinations.
6. Observe pre-roll/mid-roll ads when available; use simulated tests for unavailable ad scenarios and label those results accurately.
7. Open the same video in two tabs; transfer ownership; confirm the old tab cannot write progress or pause due to the extension.
8. Navigate via YouTube recommendations and browser Back; ensure tracking never controls the wrong video.
9. Mark complete/delete/reset from the dashboard while a session is running; confirm no stale state returns.
10. Check fullscreen, slow loading, unavailable video, autoplay blocking, and final course completion.
11. Complete a normal full-length learning session as a soak test; use near-boundary seeks for additional boundary cases. Do not claim the entire six-hour video was watched unless it was.
12. Run packaged smoke checks in Chrome and Brave when available; explicitly record any unavailable browser or blocked scenario.

Final commands: `npm run typecheck`, `npm test`, `npm run build`, `npm run zip`. Inspect the generated manifest and archive. Keep permissions minimal. Add CI for typecheck/tests/build if absent; do not rely on live YouTube tests as the sole CI gate.

## 10. Completion and handoff requirements

- All reproducible critical playback/data-loss bugs above have regression coverage and pass.
- No direct persistent writes remain in UI/content callers; worker ownership checks reject stale messages.
- Existing data migrates without silent loss; checkpoints survive restarts and course switching.
- Session boundaries act once; old trackers cannot recreate active state.
- Updated UI has been visually inspected and the core flow has been exercised in the packaged extension.
- Update `README.md`, `docs/architecture.md`, and privacy documentation to describe actual behavior and restart/save limitations. Fix the missing Code of Conduct link or supply the intended document; verify contributor setup works without a developer-specific browser path.
- Deliver a concise change summary, commands and results, QA video/browser details, screenshots, and remaining limitations. Mark each QA item Passed, Failed, or Not tested with a reason.
- Do not publish a release, submit to a browser store, or claim every possible YouTube bug is fixed as part of this implementation.

Suggested commit order: baseline/tests; storage migration and command ownership; activation/tracker fixes; metadata/course fixes; UI redesign; browser coverage and documentation.
