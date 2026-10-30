# Darb learning workspace

## Install the development build

Build with `npm ci` and `npm run build`. In Chrome/Brave/Edge open your extension
manager, enable Developer mode, choose Load unpacked, and select
`.output/chrome-mv3` inside this repository. Reload the extension and refresh any
already-open video pages after an update. Do not select the ZIP or the older
`chrome-mv3-dev` directory. Firefox packages use `npm run zip:firefox`;
permanent installation requires a Mozilla-signed package.

## Organize material

1. Open the Darb dashboard and choose Library. Existing material starts in Inbox.
2. Choose New folder. Set its parent to build a nested structure.
3. Open an item's inspector to move it or edit its tags. Dragging an item onto
   a folder is an alternative. Use the folder menu to rename, move, reorder or delete.
4. Use checkboxes to move or replace tags on several items together.
5. Choose list, table or cards. Search titles, tags and note text; combine filters
   for folder, type, progress, platform and topic. Folder filters include descendants.
   Views and filters are saved locally.

Deleting a folder sends its contents to Inbox. Courses and progress are preserved.
Today and Continue keep using the existing session tracker.

## Notes and timestamps

Each saved video has a **Video notes** section in the dashboard and in the Darb
popup when that video is open. Type a note and press **Add note**; the title is
optional. Saved notes appear below with Edit and Delete actions. Use **Video
notes** beside Continue learning to jump to the section on a long course page.
Save your note before closing the popup; unsaved text is not automatically saved.
For a new video, create its course first. If you have multiple plans for one
video, the popup lets you choose the plan whose notes you want to edit.

You can also choose New note in Library. Attach a course to
make timestamps such as `02:30` and `01:12:05` clickable. Clicking a timestamp
opens or reuses the course's owned video tab through Darb's session controller.
It does not mark earlier sessions complete. The selected session changes to the
session containing the timestamp; its saved checkpoint is retained until normal
playback tracking updates it.

Notes support headings, bold text, inline code, and internal references such as
`[[course:ID]]`, `[[playlist:ID]]` and `[[note:ID]]`. The linked-material picker
avoids typing IDs. Raw HTML is displayed as text. Notes are local and excluded
from current assistant exports and MCP access, even for a shared course.

## Graph

Graph connects prepared playlist courses, linked notes, shared topic tags,
manual related-material links and optional folders. It shows saved relationships,
not an estimate of what you understand. Select a node to inspect it. Use Focus
for its neighborhood or Whole workspace for an overview; toggle node types,
zoom, pan, drag nodes and reset layout. Keyboard users can open nodes with
Enter/Space or use the connection list.

For responsiveness, at most 300 nodes and 3,000 drawn edges are shown at once;
the connection list shows up to 500 edges. Large graphs show a truncation notice.
Use filters or Focus to explore a smaller area. Positions are saved locally.

## Data and limitations

Workspace state is separate from course progress. There is no cloud sync,
telemetry, automatic knowledge inference, full Markdown engine or note export in
this release. A simultaneous change in another dashboard can produce a revision
conflict: the latest workspace reloads and you can retry. Reset all local data
also deletes notes, folders, links and layout. There is no workspace backup UI yet.

These features require the newer workspace build. Browser-store versions may be older; check the extension version before following this guide.

## Automatic note time and floating mode

When you add a note with its video open, Darb captures the actual player position
at Save. Capture current time lets you pin a moment earlier. Click the saved
note's time button or body to return to it. No saved checkpoint is substituted
for a live timestamp. If no matching video is open, the note can still save
without a timestamp. Existing untimestamped notes are kept; edit one and choose
Capture current time to attach a timestamp deliberately.

In the extension popup, turn Floating note mode on. A Darb notes bubble appears
on supported video pages; expand it, type, and save without reopening the popup.
Saved timed notes seek the current player when clicked. Turn the popup switch off
to remove the bubble. Drafts in the bubble survive same-tab video navigation for
the lifetime of that page, but unsaved drafts do not survive a page reload.

For bulk organization, select items, pick a folder, then press Move. A confirmation
names the destination. Playlists can be renamed in Library's inspector or with
Rename / edit playlist in Playlists. The editor is beside that playlist.
