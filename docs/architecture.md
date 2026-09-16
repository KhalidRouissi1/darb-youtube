# Architecture

Darb is a local-first Manifest V3 extension built with WXT, React,
TypeScript, Tailwind CSS, Zustand, and Zod.

## Runtime components

### Popup

The popup queries the active tab and requests metadata from the YouTube content
script. It generates sessions with pure utilities, validates the course, and
saves it through the storage repository.

### Dashboard

The dashboard reads courses through a Zustand store backed by the same
repository. Chrome Storage change events refresh the UI when playback completes
in another tab. Course mutations are validated before persistence.

### Content script

The content script runs only on YouTube. YouTube selectors, metadata fallbacks,
SPA navigation detection, playback boundaries, and the completion overlay are
isolated under `src/lib/youtube`.

### Background service worker

The worker opens dashboard and YouTube tabs, establishes the active playback
record, marks sessions complete, advances to the next incomplete session, and
sends optional notifications.

## Course creation flow

```text
YouTube tab
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
  → YouTube opens with ?t=<start>s
  → content script restores the active session
  → timeupdate reports a session checkpoint through the background worker
  → session end pauses playback
  → background completes the session and releases the tab owner
  → YouTube overlay and dashboard show updated progress
```

## Reliability

- Courses, settings, and active playback use separate storage keys.
- Every stored value is parsed with Zod when read.
- Each session stores its own resume checkpoint. The active playback record
  only grants one tab temporary ownership of boundary controls.
- Position reports include an activation ID and sequence number, so stale tabs
  and out-of-order writes cannot overwrite a newer session.
- The background worker serializes persistent mutations. Popup, dashboard, and
  YouTube scripts send intents rather than rewriting course data directly.
- YouTube SPA changes are detected through `yt-navigate-finish`, `popstate`, a
  MutationObserver, and a URL fallback timer.
- Completing a session is idempotent and detaches the tracker before progress
  is changed.
- Opening an already completed session does not alter its completion state.
- Manual incomplete actions are explicit.

## Permission policy

The extension requests only local storage and temporary active-tab access.
YouTube is the sole content-script host. Notifications remain optional and are
requested in response to a settings action.
