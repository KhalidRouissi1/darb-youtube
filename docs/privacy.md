# Privacy

Darb is designed to work without an account or server.

## Data stored locally

- YouTube video ID, URL, title, thumbnail, and channel name
- Session timestamps and completion dates
- Current course progress
- Active session timestamp used for restart recovery
- User settings

This data is stored in `chrome.storage.local` inside the user's browser profile.

## Data Darb does not collect

- YouTube transcripts
- Browsing history outside YouTube
- Account credentials
- Analytics or telemetry
- Advertising identifiers
- Notes, messages, or personal profile information

Darb does not download, copy, or rehost YouTube videos. It opens the normal
YouTube page and controls its HTML5 player only for the active learning session.

Deleting a course removes its local plan and progress. **Reset all local data**
in Settings removes every Darb storage key.
