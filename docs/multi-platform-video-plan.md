# Darb: X and Facebook video support

Status: implemented as an experimental 0.2.0 development candidate.
See `multi-platform-qa.md` for completed checks and pending browser release gates.
Prepared: October 12, 2026.

## Goal

Let users turn supported YouTube, X, and Facebook videos into Darb courses:
choose a session length, track progress locally, pause at session boundaries,
and resume the correct session in the correct video.

Keep the existing course dashboard and learning behavior consistent across
platforms. Preserve existing YouTube courses and their checkpoints.

## Initial scope

- YouTube: preserve the current standard watch-page behavior.
- X: start with an individual post page containing a recorded video.
- Facebook: start with dedicated recorded-video pages that the user can access.
- Desktop Chrome and Firefox; verify Chromium derivatives where practical.
- A video shorter than the selected session length becomes one session.

Defer feeds, automatic selection among unrelated videos, live streams, Stories,
Reels, playlists, embedded players on third-party websites, downloads, and cloud
sync. Never bypass login or access restrictions. If a post contains multiple
videos, either support an explicit stable selection or explain that it is
unsupported; never silently choose the first video on the page.

Candidate X test URL supplied by the user:
https://x.com/hayatomaruu/status/2109373280041816140

Its contents have not been verified. Do not assume it is accessible or suitable.

## Current code and implementation constraints

The code currently ties platform behavior to YouTube in these places:

| File | Change required |
| --- | --- |
| `src/entrypoints/content.ts` | YouTube-only matching, metadata, navigation, and tracking |
| `src/entrypoints/popup/PopupApp.tsx` | YouTube-only URL checks, metadata type, and text |
| `src/entrypoints/background.ts` | YouTube tab matching and `t=` timestamp URLs |
| `src/types/course.ts` | Course has a video ID but no platform identity |
| `src/types/youtube.ts` | Shared activation state lives beside YouTube-specific metadata |
| `src/lib/validation/schemas.ts` | General URL validation; mandatory thumbnail |
| `src/lib/storage/repository.ts` | Duplicate lookup uses video ID alone |
| `src/lib/utils/courses.ts` | Course creation accepts YouTube-specific metadata |
| `src/lib/youtube/session-tracker.ts` | Shared timing mixed with YouTube identity and ad detection |
| `src/lib/youtube/navigation.ts` | YouTube-specific navigation observation |
| `src/features/courses/CourseCard.tsx` and `CourseDetail.tsx` | YouTube labels and thumbnail assumptions |
| `wxt.config.ts` | Permissions and platform configuration |

There are existing uncommitted changes in the workspace, including popup,
metadata, tests, package version, and manifest configuration. Inspect and
preserve them before implementation. Do not overwrite or roll them back as
part of this feature.

## Phase 1: verify feasibility on actual pages

Before designing selectors, inspect accessible X and Facebook video pages in
Chrome and Firefox. Use at least two recorded videos per platform, including
one long enough for multiple sessions. Use public pages and, where available,
pages viewed through the user's normal logged-in browser session.

Record evidence for each platform:

1. Can a content script identify the intended player without selecting an ad,
   preview, quoted post, or unrelated player?
2. Does the player expose finite duration and a usable seek range?
3. Can seeking, pausing, and reading playback position work reliably?
4. What changes when navigating within the site or replacing the player?
5. Which stable post/video identity and canonical page URL can be recovered?
6. Can title, author, and thumbnail be read safely from that page?
7. Does returning to the saved page resolve to the same video after a reload?
8. Does browser autoplay blocking require an explicit Play button?

Store sanitized observations and HTML fixtures for automated tests; exclude
cookies, account details, private content, and authentication tokens.

Gate: release a platform only after identity, seeking, and resume work in both
browsers. If Facebook fails this gate, ship X independently and leave Facebook
disabled. Do not claim universal support from one successful example.

## Phase 2: generalize identity and preserve stored courses

Add shared types in `src/types/video.ts`:

- `VideoPlatform = 'youtube' | 'x' | 'facebook'`.
- `VideoMetadata`: platform, stable video ID, canonical page URL, title,
  optional thumbnail URL, optional author/channel, and finite duration.
- Shared `ActivePlayback`: include platform and video ID alongside the
  existing course, session, tab, activation, and sequence fields.

Keep `videoId` and `videoUrl` field names where practical to reduce migration
risk. Define identity as `(platform, videoId)`. For a platform with several
videos per post, the ID must identify the selected video, not only its post.
Never persist temporary blob URLs or expiring media URLs as course identity.

Update course schemas and duplicate lookup to include platform. Validate
canonical URLs against exact allowed hosts, supported routes, and identity.
Do not allow lookalike domains, arbitrary redirects, or executable URL schemes.
Validate thumbnail URLs as HTTPS resources and provide a local placeholder
when no thumbnail is available.

Migration steps:

1. Back up legacy data using the repository's existing migration pattern.
2. Treat legacy courses without a platform as YouTube courses.
3. Preserve course/session IDs, completion state, dates, settings, and checkpoints.
4. Validate migrated records before committing them to storage.
5. Make migration idempotent and preserve a recoverable copy on failure.
6. Clear obsolete transient playback activations instead of reviving stale tabs.

Gate: legacy course fixtures load with identical progress, and IDs from different
platforms cannot collide in duplicate detection.

## Phase 3: introduce platform adapters

Create `src/lib/video/` for shared coordination and
`src/lib/platforms/{youtube,x,facebook}/` for site-specific behavior.
Move existing YouTube code incrementally; avoid rewriting its behavior.

Define a small adapter contract with:

- Parse a supported page URL into platform/video identity.
- Read metadata for the selected video.
- Resolve and verify the matching player, with cancellation and timeout.
- Build the canonical page URL; add a timestamp only when supported.
- Observe navigation and player replacement; return a cleanup function.
- Detect an advertisement or an unusable player where reliably possible.

Keep DOM/player methods in content-script code. Keep URL parsing and identity
utilities usable by the background worker without importing DOM code.

Shared tracking owns checkpoint timing, pause/completion, settings, and overlay
behavior. The adapter owns page identity, player selection, and site-specific
readiness. A shared tracker must not depend on YouTube selectors or events.

Gate: YouTube passes its current tests and browser smoke tests through the
adapter before adding another platform.

## Phase 4: opt-in access and video detection

Add optional host permissions for narrowly scoped X and Facebook domains.
Determine the exact patterns from Phase 1; do not request all website access.
Retain existing YouTube access and review existing `activeTab` behavior before
changing it. The manifest currently includes `activeTab` in local changes.

Use a platform enable control in Settings and a popup action such as
“Enable Darb on X”. Request permission directly from that user gesture.
Handle acceptance, denial, and revocation without affecting saved courses.

Prototype the permission/content-script setup with the installed WXT version:
choose optional-host-gated static scripts or supported dynamic registration
after verifying Chrome and Firefox behavior. Ensure the already-open page can
connect after permission is granted, using safe injection or a clear refresh
instruction. Avoid duplicate listeners after permission changes or restarts.

Update popup detection to choose the adapter for a supported URL. Preserve the
dashboard shortcut from unrelated websites. Distinguish “platform disabled”,
“unsupported page”, “no recorded video”, and “player unavailable”.

No remote executable scripts, undocumented backend APIs, or stored credentials
are needed for the initial implementation.

## Phase 5: resume and track safely

Replace YouTube-only tab matching with platform/video identity matching.
When continuing from a completion overlay, reuse its current tab. If the correct
video is already loaded, seek directly without navigating or refreshing.
When opening from the dashboard, prefer the tracked matching tab; otherwise
open the canonical video page and seek after the correct player is ready.
Do not overwrite an unrelated tab supplied by the popup.

For X and Facebook, seek through the player after load unless verified support
exists for timestamp URLs. Bound retries and timeouts. If seeking is currently
unavailable, offer Retry or explain the limitation instead of marking progress.
If autoplay is blocked, retain the activation/checkpoint and ask the user to
press Play.

Carry platform and video identity through activation and reports. Validate
sender tab, approved origin, activation ID, course, session, and monotonic
sequence before writing progress. Preserve background serialization and reject
stale reports from previous tabs, videos, or activations.

When the player is replaced, detach old listeners and resolve the matching
replacement. When navigation changes the video identity, stop tracking.
Avoid attaching to autoplay's next video or reporting advertisement time.
If ad/content identity cannot be distinguished safely, suspend tracking.
Complete once per activation and clean up timers, observers, and overlays.

## Phase 6: UI and disclosures

- Show platform labels on cards and course details.
- Use “Open on X”, “Open on Facebook”, and “Open on YouTube” as appropriate.
- Use “video” or “course” in shared copy; keep platform names in useful errors.
- Render a local placeholder if a thumbnail is absent or fails to load.
- Keep course creation usable for a one-session video.
- Update README, architecture notes, privacy policy, and store descriptions to
  reflect only the platforms actually released.
- Explain optional host access and local video/progress storage in store
  permission justifications. Document third-party thumbnail loading accurately.
- Verify Firefox data declarations and Chrome disclosures against the shipped
  behavior; local processing still needs appropriate disclosure.

## Tests and acceptance criteria

Automated tests:

- Legacy storage migration, repeat migration, and recovery from invalid records.
- Platform-aware duplicate detection and identity collisions.
- URL parsing, normalization, unsupported routes, and lookalike domains.
- Metadata extraction using sanitized page fixtures, including missing images.
- Wrong-player selection, replacement, navigation, and bounded readiness failure.
- Stale/foreign activation reports and out-of-order sequences.
- Resume checkpoint, final short session, pause, and exactly-once completion.
- Permission denial/revocation and content-script initialization lifecycle.

Manual tests on Chrome and Firefox for every released platform:

| Scenario | Expected result |
| --- | --- |
| Add an accessible recorded video | Correct identity, metadata, and duration |
| Leave halfway and return | Resume within two seconds of last saved checkpoint |
| Start session eight with earlier sessions unfinished | Continue from session eight |
| Reach boundary and press Continue | Same tab, correct next session, no unnecessary reload |
| Navigate to another video | Previous course receives no progress from it |
| Replace player / enter or exit fullscreen | Correct player remains tracked; no duplicate handlers |
| Pause, hide tab, then reload | Last acknowledged checkpoint remains durable |
| Browser restart | Courses persist; stale activations do not control unrelated tabs |
| Private/deleted video or login screen | Clear error; progress remains intact |
| Permission denied or revoked | Clear enable/access action; YouTube remains usable |
| Advertisement or live/unseekable video | No false progress or completion |
| Two tabs playing the same course | Only the owning activation writes progress |

Run `npm run typecheck`, `npm test`, `npm run build`, and
`npm run build:firefox`. Inspect generated manifests and install production
packages in both browsers; automated tests alone do not prove live-site support.

## Implementation and release order

1. Feasibility report with verified page examples and known limitations.
2. Shared identity/types and backward-compatible storage migration.
3. Adapter abstraction with YouTube regression evidence.
4. Optional access and X support, followed by browser QA.
5. Facebook support only after its feasibility and QA gates pass.
6. UI, privacy/store documentation, release notes, and versioned packages.

Keep each step reviewable. Do not bundle unrelated Chrome popup fixes or a
redesign into this feature. Choose the release version at implementation time
from the repository's then-current version. Publish only after the migration,
YouTube regression, and supported-platform browser checks pass.

## Technical references

- Browser playback and seeking:
  https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentTime
- Extension content scripts:
  https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts

Verify current optional-permission and content-script registration documentation
for Chrome, Firefox, and WXT during implementation. Platform page structures and
video availability are empirical dependencies, not stable API guarantees.
