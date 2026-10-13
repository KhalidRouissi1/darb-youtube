# Architecture

Darb is a local-first Manifest V3 extension built with WXT, React,
TypeScript, Tailwind CSS, Zustand, and Zod.

## Runtime components

### Popup

The popup queries the active tab and requests metadata from the selected platform content
script. It generates sessions with pure utilities, validates the course, and
sends it to the background worker for validated persistence.

### Dashboard

The dashboard reads courses through a Zustand store backed by the same
repository. Chrome Storage change events refresh the UI when playback completes
in another tab. Course mutations are validated before persistence.

### Content script

The YouTube content script is static. X/Facebook scripts are dynamically
registered after optional host access is granted. `src/lib/platforms/adapter.ts`
resolves platform players and metadata. `src/lib/video` owns common tracking,
overlays, URL identity, permissions, and script registration. YouTube metadata
fallbacks remain under `src/lib/youtube`. DOM code does not run in the worker.

### Background service worker

The worker opens dashboard and video tabs, establishes the active playback
record, marks sessions complete, advances to the next incomplete session, and
sends optional notifications.

## Course creation flow

```text
Supported video tab
  → popup requests metadata
  → Zod validates metadata
  → session generator creates non-overlapping ranges
  → repository validates and stores the course
  → dashboard reacts to Chrome Storage changes
```

## Playback flow

```text
Continue Learning
  → background selects a tab and establishes one owned activation
  → matching tab is reused, or the canonical page opens
  → content script seeks after verifying the correct player
  → content script restores the active session
  → timeupdate reports a session checkpoint through the background worker
  → session end pauses playback
  → background completes the session and releases the tab owner
  → Completion overlay and dashboard show updated progress
```

## Reliability

- Courses, settings, and active playback use separate storage keys.
- Every stored value is parsed with Zod when read.
- Each session stores its own resume checkpoint. The active playback record
  only grants one tab temporary ownership of boundary controls.
- Position reports include an activation ID and sequence number, so stale tabs
  and out-of-order writes cannot overwrite a newer session.
- The background worker serializes persistent mutations. Popup, dashboard, and
  content scripts send intents rather than rewriting course data directly.
- Navigation/player changes are detected through a bounded polling interval,
  `popstate`, and YouTube's `yt-navigate-finish` event. Old tracker listeners are
  aborted when the player or identity changes.
- Completing a session is idempotent and detaches the tracker before progress
  is changed.
- Opening an already completed session does not alter its completion state.
- Manual incomplete actions are explicit.

## Permission policy

The extension requests storage, active-tab access, and scripting for packaged
script injection. YouTube is the only static content-script host. X and Facebook
hosts are optional; enable buttons request the selected platform only. The
background synchronizes registrations and stops revoked-platform activations.
Notifications remain optional.

Persisted course identity is `(platform, videoId)`. Storage version 3 defaults
legacy records to YouTube, preserves durable session checkpoints and the
original recovery backup, and clears transient activation records. Every video
URL is validated against supported platform hosts/routes and its identity.

See [multi-platform QA](multi-platform-qa.md) for evidence and release gates.
