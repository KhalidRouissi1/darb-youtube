# Darb Privacy Policy

Last updated: October 12, 2026

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

This data is stored in `chrome.storage.local` inside the user's browser profile.

## Data Darb does not handle

- YouTube transcripts
- General browsing history outside the videos selected for Darb courses
- Account credentials
- Analytics or telemetry
- Advertising identifiers
- Notes, messages, or personal profile information

Darb does not download, copy, or rehost videos. It opens the original
platform page and controls its HTML5 player only for the active learning session.

## Sharing and transfer

Darb does not upload courses, settings, or progress to the developer or to
external servers. It
does not sell user data, transfer user data to third parties, use data for
purposes unrelated to its single purpose, use data for advertising, or use
data to determine creditworthiness or for lending purposes. No developer or
third party can read the locally stored course data through Darb.

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

Deleting a course removes its local plan and progress. **Reset all local data**
in Settings removes every Darb storage key.
