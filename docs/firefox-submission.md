# Firefox Add-ons submission sheet

Use this sheet when submitting Darb 0.1.0 to addons.mozilla.org (AMO).

## Files

- Extension package: `.output/darb-0.1.0-firefox.zip`
- Reviewer source package: `.output/darb-0.1.0-sources.zip`

If WXT produces a platform suffix in either filename, use the generated file
whose name contains `firefox` for the extension and `sources` for the reviewer
source upload.

## Listing information

### Name

Darb

### Suggested URL slug

`darb-youtube-course-tracker`

### Summary

Turn long YouTube videos into focused daily sessions, resume exactly where you
stopped, and track course progress locally.

### Description

Darb turns long educational YouTube videos into courses you can finish.

Choose how long you want to study each day. Darb creates a sequence of focused
sessions, opens each one at the correct timestamp, remembers incomplete
progress, and shows what to study next.

Features:

- Split long YouTube videos into timed learning sessions
- Resume an incomplete session from its saved checkpoint
- Pause and complete sessions at their planned boundaries
- Track completed sessions, watched time, and remaining time
- Open the full course dashboard from any website
- Store all course data locally in Firefox
- Use Darb without an account, analytics, advertising, or a backend

Darb does not download or rehost videos. Playback remains on YouTube.

### Categories

1. Photos, Music & Videos
2. Other

### Support website

https://github.com/KhalidRouissi1/darb-youtube/issues

### Homepage

https://github.com/KhalidRouissi1/darb-youtube

### License

MIT License

### Privacy policy

https://github.com/KhalidRouissi1/darb-youtube/blob/main/docs/privacy.md

### Payment and external requirements

- Experimental: No
- Requires payment: No
- Requires non-free services, software, or hardware: No
- Firefox for Android: Do not select for version 0.1.0

## Data disclosure

The manifest declares:

```json
"data_collection_permissions": {
  "required": ["none"]
}
```

Darb stores YouTube course metadata, timestamps, settings, and progress only in
the user's local Firefox profile. It does not transmit data outside Firefox.

## Notes for reviewers

Darb is a local-only YouTube learning-session manager. No account, credentials,
or paid service is required.

Test flow:

1. Install the extension in Firefox 140 or newer.
2. Open a standard public `https://www.youtube.com/watch?v=...` video.
3. Select the Darb toolbar button.
4. Choose a session duration and create a course.
5. Open the dashboard or start a session.
6. The extension opens the selected session timestamp and stores progress in
   browser local storage.

Permissions:

- `storage`: stores courses, settings, checkpoints, and progress locally.
- `activeTab`: reads the current YouTube tab after the user selects Darb.
- YouTube content-script match: reads video metadata and controls playback only
  on YouTube.
- `notifications` is optional and requested only when enabled in settings.

The submitted JavaScript and CSS are generated from TypeScript, React, and
Tailwind source using WXT/Vite. Upload the accompanying source archive. Exact
build instructions are in `FIREFOX_REVIEW.md`; dependency versions are pinned
by `package-lock.json`.

There is no remote code, telemetry, analytics, advertising, or data
transmission.
