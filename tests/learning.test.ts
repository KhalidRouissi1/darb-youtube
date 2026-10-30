import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { learningAction, liveMcpAction } from '@/lib/learning/actions';
import {
  createPlaylist,
  editPlaylist,
  nextSession,
  videoReferenceSchema,
  playlistSummary,
  recordPlaylistVideoCompletion,
  playlistSchema,
} from '@/lib/learning/model';
import { readLearning, writeLearning } from '@/lib/learning/repository';
import { workspaceAction } from '@/lib/workspace/repository';
import { courseRepository } from '@/lib/storage/repository';
import { createCourse } from '@/lib/utils/courses';
const a = {
  videoId: 'abcdefghijk',
  videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  title: 'First lecture',
};
const b = {
  videoId: 'lmnopqrstuv',
  videoUrl: 'https://www.youtube.com/watch?v=lmnopqrstuv',
  title: 'Next lecture',
};
const call = (tool: string, args: Record<string, unknown> = {}) =>
  liveMcpAction({ tool, args });
beforeEach(async () => {
  await browser.storage.local.clear();
});
async function shared() {
  await learningAction({ op: 'selection.toggle', video: a });
  await learningAction({ op: 'selection.toggle', video: b });
  await learningAction({ op: 'connection.update', allowDrafts: true });
  return readLearning();
}
async function preview(key = 'key') {
  const s = await readLearning();
  return call('darb_preview_playlist', {
    title: 'Learning path',
    videoIds: [...s.selection.items].reverse().map((v) => v.videoId),
    selectionId: s.selection.id,
    selectionRevision: s.selection.revision,
    idempotencyKey: key,
  });
}
describe('local playlists', () => {
  it('validates identities, duplicate videos and unknown durations', () => {
    expect(() =>
      videoReferenceSchema.parse({ ...a, videoId: b.videoId }),
    ).toThrow();
    expect(() => createPlaylist('Path', [a, a])).toThrow();
    expect(createPlaylist('Path', [a]).items[0]).not.toHaveProperty(
      'durationSeconds',
    );
  });
  it('preserves cursor on reorder and chooses a neighbor when removed', () => {
    let p = createPlaylist('Path', [a, b]);
    p.cursorId = b.videoId;
    p = editPlaylist(p, 'Path', [b, a], 0);
    expect(p.cursorId).toBe(b.videoId);
    expect(editPlaylist(p, 'Path', [a], 1).cursorId).toBe(a.videoId);
    expect(() => editPlaylist(p, 'Path', [a], 0)).toThrow(/changed/);
  });
  it('deduplicates selections and rejects stale saves', async () => {
    await learningAction({ op: 'selection.toggle', video: a });
    const s = await readLearning();
    await learningAction({ op: 'selection.toggle', video: b });
    await expect(
      learningAction({
        op: 'selection.save',
        title: 'Path',
        items: [a],
        revision: s.selection.revision,
      }),
    ).rejects.toThrow(/changed/);
    expect((await readLearning()).playlists).toHaveLength(0);
  });
  it('editing and deleting a playlist retains eighth-session course progress', async () => {
    const c = createCourse({ ...a, durationSeconds: 8000 }, 15);
    c.currentSessionIndex = 7;
    c.sessions[7]!.resumeSeconds = 6500;
    await courseRepository.saveCourse(c);
    const p = createPlaylist('Path', [a, b]);
    const s = await readLearning();
    s.playlists = [p];
    await writeLearning(s);
    await learningAction({
      op: 'playlist.edit',
      id: p.id,
      title: 'Changed',
      items: [b, a],
      revision: 0,
    });
    await learningAction({ op: 'playlist.remove', id: p.id });
    const stored = await courseRepository.getCourse(c.id);
    expect(stored?.currentSessionIndex).toBe(7);
    expect(nextSession([stored!], c.id).remainingSeconds).toBe(700);
  });
  it('excludes private workspace notes from snapshots and live assistant results', async () => {
    const c = createCourse({ ...a, durationSeconds: 8000 }, 15);
    await courseRepository.saveCourse(c);
    await workspaceAction({
      op: 'note.save',
      revision: 0,
      title: 'Private thought',
      body: 'secret-workspace-note',
      courseId: c.id,
      linkedIds: [],
    });
    const snapshot = await learningAction({
      op: 'snapshot',
      courseIds: [c.id],
      playlistIds: [],
    });
    await learningAction({ op: 'connection.update', courseIds: [c.id] });
    const results = [
      snapshot,
      await call('darb_list_courses'),
      await call('darb_get_course', { courseId: c.id }),
    ];
    expect(JSON.stringify(results)).not.toContain('secret-workspace-note');
    expect(JSON.stringify(results)).not.toContain('Private thought');
    expect(JSON.stringify(results)).toContain(c.id);
  });
  it('exports only explicit choices and never pairing secrets', async () => {
    const s = await shared();
    const snap = await learningAction({
      op: 'snapshot',
      courseIds: [],
      playlistIds: [],
    });
    expect(snap).toMatchObject({ courses: [], playlists: [] });
    expect(JSON.stringify(snap)).not.toContain(s.connection.token);
  });
});
describe('assistant scopes and approvals', () => {
  it('denies all tools until live access is enabled', async () => {
    await expect(call('darb_list_courses')).rejects.toThrow(/disconnected/);
  });
  it('never returns unshared course data', async () => {
    const c = createCourse({ ...a, durationSeconds: 8000 }, 15);
    await courseRepository.saveCourse(c);
    await learningAction({ op: 'connection.update' });
    expect(await call('darb_list_courses')).toMatchObject({
      data: { courses: [] },
    });
    await expect(call('darb_get_course', { courseId: c.id })).rejects.toThrow(
      /not shared/,
    );
  });
  it('requires separate draft access', async () => {
    await learningAction({ op: 'connection.update' });
    await expect(call('darb_get_selection')).rejects.toThrow(/not enabled/);
  });
  it('requires user approval and saves exactly once', async () => {
    await shared();
    await preview();
    await preview();
    let s = await readLearning();
    expect(s.playlists).toHaveLength(0);
    expect(s.proposals).toHaveLength(1);
    const p = s.proposals[0]!;
    await call('darb_request_playlist_save', { previewId: p.id });
    expect((await readLearning()).playlists).toHaveLength(0);
    await learningAction({ op: 'proposal.approve', id: p.id, revision: 0 });
    await expect(
      learningAction({ op: 'proposal.approve', id: p.id, revision: 0 }),
    ).rejects.toThrow();
    s = await readLearning();
    expect(s.playlists).toHaveLength(1);
    expect(s.playlists[0]?.items.map((v) => v.videoId)).toEqual([
      b.videoId,
      a.videoId,
    ]);
  });
  it('rejects key reuse with different contents or action', async () => {
    await shared();
    await preview();
    const s = await readLearning();
    await expect(
      call('darb_preview_playlist', {
        title: 'Changed',
        videoIds: [a.videoId],
        selectionId: s.selection.id,
        selectionRevision: s.selection.revision,
        idempotencyKey: 'key',
      }),
    ).rejects.toThrow(/different request/);
  });
  it('invalidates approvals on selection changes, expiry and revocation', async () => {
    await shared();
    await preview();
    let s = await readLearning();
    const p = s.proposals[0]!;
    await learningAction({ op: 'selection.toggle', video: a });
    await expect(
      learningAction({ op: 'proposal.approve', id: p.id, revision: 0 }),
    ).rejects.toThrow(/changed/);
    await preview('fresh');
    s = await readLearning();
    s.proposals[0]!.expiresAt = 0;
    await writeLearning(s);
    await expect(
      learningAction({
        op: 'proposal.approve',
        id: s.proposals[0]!.id,
        revision: 0,
      }),
    ).rejects.toThrow(/expired/);
    const token = s.connection.token;
    await learningAction({ op: 'connection.disconnect' });
    expect((await readLearning()).connection.token).not.toBe(token);
    await expect(call('darb_get_selection')).rejects.toThrow(/disconnected/);
  });
  it('supports human edits and rejects approval of a stale review', async () => {
    await shared();
    await preview();
    const p = (await readLearning()).proposals[0]!;
    await learningAction({
      op: 'proposal.edit',
      id: p.id,
      revision: 0,
      title: 'Edited',
      items: [a],
    });
    await expect(
      learningAction({ op: 'proposal.approve', id: p.id, revision: 0 }),
    ).rejects.toThrow();
    await learningAction({ op: 'proposal.approve', id: p.id, revision: 1 });
    expect((await readLearning()).playlists[0]).toMatchObject({
      title: 'Edited',
      items: [a],
    });
  });
  it('only queues playback and cannot mark sessions complete', async () => {
    const c = createCourse({ ...a, durationSeconds: 8000 }, 15);
    await courseRepository.saveCourse(c);
    await learningAction({
      op: 'connection.update',
      courseIds: [c.id],
      allowPlayback: true,
    });
    await call('darb_open_session', { courseId: c.id, idempotencyKey: 'play' });
    expect((await courseRepository.getCourse(c.id))?.completed).toBe(false);
    expect((await readLearning()).proposals[0]?.status).toBe('pending');
    await expect(
      call('darb_mark_completed', { courseId: c.id }),
    ).rejects.toThrow(/Unknown/);
  });
});

it('saves a reviewed subset with its draft identity and rejects retries', async () => {
  await shared();
  const state = await readLearning();
  const input = {
    op: 'selection.save',
    id: state.selection.id,
    revision: state.selection.revision,
    title: 'Reviewed path',
    items: [b],
  };
  await learningAction(input);
  const saved = await readLearning();
  expect(saved.selection.items).toEqual([]);
  expect(saved.playlists[0]?.items).toEqual([b]);
  await expect(learningAction(input)).rejects.toThrow(/changed/);
  expect((await readLearning()).playlists).toHaveLength(1);
});

it('reports partial playlist duration explicitly', () => {
  const c = createCourse({ ...a, durationSeconds: 3600 }, 15);
  expect(playlistSummary(createPlaylist('Mixed', [a, b]), [c])).toMatchObject({
    knownSeconds: 3600,
    unknownVideos: 1,
    completedVideos: 0,
    videoCount: 2,
  });
});

it('persists completed playlist videos without requiring all study sessions or a prepared course', async () => {
  const p = createPlaylist('Path', [a, b]);
  recordPlaylistVideoCompletion(p, a.videoId);
  recordPlaylistVideoCompletion(p, a.videoId);
  const state = await readLearning();
  state.playlists = [p];
  await writeLearning(state);
  const saved = (await readLearning()).playlists[0]!;
  expect(saved.completedVideoIds).toEqual([a.videoId]);
  expect(playlistSummary(saved, []).completedVideos).toBe(1);
  expect(
    editPlaylist(saved, 'Reordered', [b, a], saved.revision).completedVideoIds,
  ).toEqual([a.videoId]);
  expect(
    editPlaylist(saved, 'Removed', [b], saved.revision).completedVideoIds,
  ).toEqual([]);
});
it('recovers a legacy video-end completion even when earlier study sessions remain unfinished or another duplicate course exists', () => {
  const completedEnd = createCourse({ ...a, durationSeconds: 3600 }, 15);
  completedEnd.sessions.at(-1)!.completed = true;
  const duplicate = createCourse({ ...a, durationSeconds: 3600 }, 15);
  const p = createPlaylist('Path', [a, b]);
  const { completedVideoIds: _ids, ...legacy } = p;
  const migrated = playlistSchema.parse(legacy);
  expect(migrated.completedVideoIds).toEqual([]);
  expect(
    playlistSummary(migrated, [duplicate, completedEnd]).completedVideos,
  ).toBe(1);
  expect(completedEnd.completed).toBe(false);
  expect(completedEnd.sessions[0]!.completed).toBe(false);
});
