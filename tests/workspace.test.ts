import { beforeEach, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { workspaceAction, readWorkspace } from '@/lib/workspace/repository';
import {
  initialWorkspace,
  libraryItems,
  filterLibrary,
  buildGraph,
} from '@/lib/workspace/model';
import { createCourse } from '@/lib/utils/courses';
import { createPlaylist, initialLearningState } from '@/lib/learning/model';
import { writeLearning } from '@/lib/learning/repository';
import {
  courseRepository,
  getActivePlayback,
  resetAllData,
  saveActivePlayback,
} from '@/lib/storage/repository';
const video = {
  videoId: 'abcdefghijk',
  videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  title: 'JavaScript course',
  durationSeconds: 8000,
};
async function run(action: Record<string, unknown>) {
  return workspaceAction({
    ...action,
    revision: (await readWorkspace()).revision,
  });
}
beforeEach(async () => {
  await browser.storage.local.clear();
});
it('starts existing courses in Inbox without rewriting their checkpoints', async () => {
  const c = createCourse(video, 15);
  c.currentSessionIndex = 7;
  c.sessions[7]!.resumeSeconds = 6500;
  await courseRepository.saveCourse(c);
  const before = await courseRepository.getCourses();
  const w = await workspaceAction({ op: 'read' });
  expect(w).toEqual(initialWorkspace());
  const items = libraryItems(before, [], w);
  w.preferences.folderId = 'inbox';
  expect(filterLibrary(items, w).map((i) => i.id)).toEqual([`course:${c.id}`]);
  expect(await courseRepository.getCourses()).toEqual(before);
});
it('moves and tags material without altering playback or course progress', async () => {
  const c = createCourse(video, 15);
  c.currentSessionIndex = 7;
  c.sessions[7]!.resumeSeconds = 6500;
  await courseRepository.saveCourse(c);
  await saveActivePlayback({
    platform: 'youtube',
    activationId: 'active',
    tabId: 7,
    status: 'active',
    courseId: c.id,
    sessionId: c.sessions[7]!.id,
    videoId: c.videoId,
    startSeconds: 6300,
    endSeconds: 7200,
    lastKnownSeconds: 6500,
    reportSequence: 4,
    startedAt: new Date().toISOString(),
  });
  const before = await courseRepository.getCourses();
  const active = await getActivePlayback();
  let w = await run({ op: 'folder.save', name: 'Programming', parentId: null });
  w = await run({
    op: 'items.update',
    ids: [`course:${c.id}`],
    folderId: w.folders[0]!.id,
    tags: ['JavaScript', 'javascript', 'Beginner'],
  });
  expect(w.metadata[`course:${c.id}`]?.tags).toEqual([
    'javascript',
    'beginner',
  ]);
  expect(await courseRepository.getCourses()).toEqual(before);
  expect(await getActivePlayback()).toEqual(active);
});
it('rejects cycles and moves recursively deleted folder contents to Inbox', async () => {
  const c = createCourse(video, 15);
  await courseRepository.saveCourse(c);
  let w = await run({ op: 'folder.save', name: 'Parent', parentId: null });
  const parent = w.folders[0]!;
  w = await run({ op: 'folder.save', name: 'Child', parentId: parent.id });
  const child = w.folders[1]!;
  await expect(
    run({
      op: 'folder.save',
      id: parent.id,
      name: 'Parent',
      parentId: child.id,
    }),
  ).rejects.toThrow(/inside itself/);
  await run({
    op: 'items.update',
    ids: [`course:${c.id}`],
    folderId: child.id,
  });
  w = await run({ op: 'folder.remove', id: parent.id });
  expect(w.folders).toHaveLength(0);
  expect(w.metadata[`course:${c.id}`]?.folderId).toBeNull();
  expect((await courseRepository.getCourse(c.id))?.sessions).toEqual(
    c.sessions,
  );
});
it('preserves independent saved view preferences and rejects stale edits', async () => {
  await run({ op: 'preferences', patch: { view: 'table', kind: 'note' } });
  const stale = (await readWorkspace()).revision;
  const w = await run({
    op: 'preferences',
    patch: { search: 'specific idea' },
  });
  expect(w.preferences).toMatchObject({
    view: 'table',
    kind: 'note',
    search: 'specific idea',
  });
  await expect(
    workspaceAction({
      op: 'preferences',
      revision: stale,
      patch: { view: 'cards' },
    }),
  ).rejects.toThrow(/another tab/);
});
it('keeps one folder per item, matches descendant folders, tags and note body search', async () => {
  let w = await run({
    op: 'note.save',
    title: 'A concept',
    body: 'An important closure example',
    courseId: null,
    linkedIds: [],
  });
  const n = w.notes[0]!;
  w = await run({ op: 'folder.save', name: 'Programming', parentId: null });
  const p = w.folders[0]!;
  w = await run({ op: 'folder.save', name: 'JavaScript', parentId: p.id });
  w = await run({
    op: 'items.update',
    ids: [`note:${n.id}`],
    folderId: w.folders[1]!.id,
    tags: ['language'],
  });
  w = await run({
    op: 'preferences',
    patch: { folderId: p.id, tag: 'language', search: 'closure' },
  });
  expect(filterLibrary(libraryItems([], [], w), w)).toHaveLength(1);
  await expect(
    run({ op: 'items.update', ids: ['course:unknown'], folderId: null }),
  ).rejects.toThrow(/no longer exists/);
});
it('derives graph edges from explicit relationships and omits broken targets', async () => {
  const c = createCourse(video, 15);
  await courseRepository.saveCourse(c);
  const p = createPlaylist('Path', [video]);
  const l = initialLearningState();
  l.playlists = [p];
  await writeLearning(l);
  let w = await run({
    op: 'note.save',
    title: 'Closures',
    body: `See [[course:${c.id}]] and [[course:missing]]`,
    courseId: c.id,
    linkedIds: [],
  });
  w = await run({
    op: 'items.update',
    ids: [`course:${c.id}`, `note:${w.notes[0]!.id}`],
    tags: ['JavaScript'],
  });
  const graph = buildGraph(libraryItems([c], [p], w), w, [c], [p]);
  expect(graph.edges).toContainEqual({
    source: `playlist:${p.id}`,
    target: `course:${c.id}`,
    kind: 'contains',
  });
  expect(graph.edges.filter((e) => e.kind === 'note')).toHaveLength(1);
  expect(graph.nodes.some((n) => n.id === 'topic:javascript')).toBe(true);
  expect(graph.edges.some((e) => e.target === 'course:missing')).toBe(false);
});
it('deduplicates manual connections and preserves progress when deleting notes', async () => {
  const c = createCourse(video, 15);
  await courseRepository.saveCourse(c);
  let w = await run({
    op: 'note.save',
    title: 'Idea',
    body: '02:30 something useful',
    courseId: c.id,
    linkedIds: [],
  });
  const noteId = `note:${w.notes[0]!.id}`;
  await run({ op: 'link.add', source: noteId, target: `course:${c.id}` });
  w = await run({ op: 'link.add', source: `course:${c.id}`, target: noteId });
  expect(w.links).toHaveLength(1);
  await run({ op: 'note.remove', id: w.notes[0]!.id });
  expect((await readWorkspace()).links).toHaveLength(0);
  expect(await courseRepository.getCourse(c.id)).toEqual(c);
});
it('stores graph positions separately and reset removes the whole workspace', async () => {
  await run({
    op: 'preferences',
    patch: { positions: { 'course:a': { x: 100, y: 200 } } },
  });
  expect((await readWorkspace()).preferences.positions['course:a']).toEqual({
    x: 100,
    y: 200,
  });
  await resetAllData();
  expect(await readWorkspace()).toEqual(initialWorkspace());
});

it('uses playback activity rather than playlist edits for library progress status', () => {
  const playlist = createPlaylist('Edited path', [video]);
  playlist.revision = 3;
  const course = createCourse(video, 15);
  expect(
    libraryItems([course], [playlist], initialWorkspace()).find(
      (i) => i.kind === 'playlist',
    )?.status,
  ).toBe('not-started');
  course.currentSessionIndex = 7;
  course.sessions[7]!.resumeSeconds = 6500;
  expect(
    libraryItems([course], [playlist], initialWorkspace()).find(
      (i) => i.kind === 'playlist',
    )?.status,
  ).toBe('in-progress');
});
