# Darb Privacy Policy

Last updated: October 29, 2026

Darb is designed to work without an account or server.

## Data Darb handles

To provide its course-planning and progress-tracking features, Darb handles
the following categories of data:

- **Web history:** the URL of a YouTube, X, or Facebook video that the user explicitly turns
  into a Darb course
- **User activity:** playback position, session completion, and course
  progress for that course
- **Website content:** the video's title, thumbnail, channel name, duration,
  and video identifier

Darb uses this data only to provide its user-facing functionality.

## Data stored locally

- Platform and video ID, URL, title, optional thumbnail, and channel name
- Session timestamps and completion dates
- Current course progress
- Active session timestamp used for restart recovery
- User settings
- Local playlists and selection drafts
- Folders, tags, notes with optional video timestamps and explicit links between learning material
- Your floating note-mode preference (off by default)
- Library filters, view preferences and graph positions
- Optional assistant grants, pairing key, expiring proposals and a short local action history

This data is stored in `chrome.storage.local` inside the user's browser profile.

## Data Darb does not handle

- YouTube transcripts
- General browsing history outside the videos selected for Darb courses
- Account credentials
- Analytics or telemetry
- Advertising identifiers
- Personal communications or account profile information

Darb does not download, copy, or rehost videos. It opens the original
platform page and controls its HTML5 player only for the active learning session.

## Sharing and transfer

Darb does not upload courses, settings, or progress to the developer and has
no hosted backend, telemetry, advertising, data sales, or lending use.

Sharing with an assistant is optional and disabled by default. An explicit
snapshot export includes only the courses and playlists you select. Workspace
notes, folders, tags and graph positions are excluded from snapshots and MCP
responses, including notes linked to a shared course. Enabling
the optional local MCP companion allows the connected client to read the
courses/playlists you explicitly share. Selection-draft access and playback
requests have separate controls. Each proposed playlist save and playback
request requires your approval in Darb. You may disconnect and revoke access
at any time. Revocation does not erase data already received by the client.

The companion communicates locally using native messaging and a private Unix
socket. Data returned to an assistant may subsequently be transmitted to its
model provider under that provider's privacy policy. Local communication does
not imply that the assistant's processing stays on your device. Keep pairing
files secret and export files private unless you deliberately share them.
Firefox requests optional data consent for live access to selected URLs, video
metadata, and learning activity. Declining consent leaves ordinary local course
features available. No assistant access is required to use Darb.

## Floating video notes

When enabled in the popup, note mode displays a bubble on supported video pages.
It reads the current player's timestamp when you save a note. The page bridge
can read/save notes only for the current top-level video, after platform access
and the note-mode preference are checked. It cannot read your whole workspace.
Disable note mode in the popup to remove the bubble. Notes remain stored locally;
notes and timestamps are excluded from current assistant exports/MCP responses.

## Platform access and external resources

YouTube access supports the existing learning features. X and Facebook access
is optional and is requested only when the user enables that platform. Access
can be removed through Darb Settings or the browser's extension controls.
Removing access stops playback tracking for that platform; locally saved
courses remain available until deleted.

Videos play on their original websites under the user's normal access rights.
Darb can display remote thumbnails supplied by those websites. Loading a
thumbnail contacts its image host, which receives the normal network request
(including the user's IP address); Darb suppresses the page referrer for those
images. Original platforms and image hosts have their own privacy policies.
Darb sends no course progress or account credentials with thumbnail requests.

## Retention and deletion

Deleting a course removes its local plan and progress. Deleting a playlist
keeps individual courses and their checkpoints. Deleting a folder moves its
contents to Inbox; it does not delete the material or reset progress. Deleting a
note removes that note and its links. **Reset all local data**
in Settings removes every Darb storage key.
