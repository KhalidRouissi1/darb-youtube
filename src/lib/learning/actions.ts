import { browser } from 'wxt/browser';
import { z } from 'zod';
import { courseRepository } from '../storage/repository';
import { readLearning, writeLearning } from './repository';
import {
  createPlaylist,
  editPlaylist,
  nextSession,
  courseSummary,
  nextSessionRequestSchema,
  uniqueVideos,
  videoReferenceSchema,
} from './model';

const operationSchema = z
  .object({
    op: z.enum([
      'read',
      'selection.toggle',
      'selection.cancel',
      'selection.save',
      'playlist.edit',
      'playlist.remove',
      'playlist.cursor',
      'connection.update',
      'connection.disconnect',
      'history.clear',
      'proposal.edit',
      'proposal.approve',
      'proposal.reject',
      'snapshot',
    ]),
    video: videoReferenceSchema.optional(),
    title: z.string().max(200).optional(),
    items: z.array(videoReferenceSchema).max(100).optional(),
    id: z.string().max(200).optional(),
    revision: z.number().int().nonnegative().optional(),
    videoId: z.string().optional(),
    courseIds: z.array(z.string()).max(1000).optional(),
    playlistIds: z.array(z.string()).max(1000).optional(),
    allowDrafts: z.boolean().optional(),
    allowPlayback: z.boolean().optional(),
  })
  .strict();
export async function learningAction(input: unknown) {
  const action = operationSchema.parse(input);
  const state = await readLearning();
  const courses = await courseRepository.getCourses();
  let result: unknown = state;
  const playlist = state.playlists.find((p) => p.id === action.id);
  switch (action.op) {
    case 'read': {
      const existing = await browser.storage.local.get('darb:learning');
      if (!existing['darb:learning']) await writeLearning(state);
      return state;
    }
    case 'selection.toggle': {
      if (!action.video) throw new Error('Choose a valid video.');
      const index = state.selection.items.findIndex(
        (v) => v.videoId === action.video!.videoId,
      );
      if (index >= 0) state.selection.items.splice(index, 1);
      else {
        if (state.selection.items.length >= 100)
          throw new Error('A selection supports up to 100 videos.');
        state.selection.items.push(action.video);
      }
      state.selection.revision++;
      break;
    }
    case 'selection.cancel':
      state.selection = { id: crypto.randomUUID(), revision: 0, items: [] };
      break;
    case 'selection.save': {
      if (
        action.id !== state.selection.id ||
        action.revision !== state.selection.revision
      )
        throw new Error('Selection changed. Review it again.');
      const items = uniqueVideos(action.items);
      if (
        items.length > state.selection.items.length ||
        items.some(
          (v) => !state.selection.items.some((s) => s.videoId === v.videoId),
        )
      )
        throw new Error('Review the current selection before saving.');
      const created = createPlaylist(action.title ?? '', items);
      state.playlists.unshift(created);
      state.selection = { id: crypto.randomUUID(), revision: 0, items: [] };
      result = created;
      break;
    }
    case 'playlist.edit': {
      if (!playlist) throw new Error('Playlist is unavailable.');
      const updated = editPlaylist(
        playlist,
        action.title ?? playlist.title,
        action.items,
        action.revision ?? -1,
      );
      state.playlists = state.playlists.map((p) =>
        p.id === updated.id ? updated : p,
      );
      result = updated;
      break;
    }
    case 'playlist.remove':
      state.playlists = state.playlists.filter((p) => p.id !== action.id);
      break;
    case 'playlist.cursor':
      if (
        !playlist ||
        !playlist.items.some((v) => v.videoId === action.videoId)
      )
        throw new Error('Video is not in this playlist.');
      else {
        playlist.cursorId = action.videoId!;
        playlist.revision++;
      }
      break;
    case 'connection.update': {
      state.connection = {
        ...state.connection,
        enabled: true,
        courseIds: (action.courseIds ?? []).filter((id) =>
          courses.some((c) => c.id === id),
        ),
        playlistIds: (action.playlistIds ?? []).filter((id) =>
          state.playlists.some((p) => p.id === id),
        ),
        allowDrafts: action.allowDrafts ?? false,
        allowPlayback: action.allowPlayback ?? false,
      };
      // Changing grants invalidates every outstanding approval.
      state.proposals = state.proposals.filter((p) => p.status !== 'pending');
      break;
    }
    case 'connection.disconnect':
      state.connection = {
        ...state.connection,
        enabled: false,
        token: crypto.randomUUID() + crypto.randomUUID(),
      };
      state.proposals = [];
      break;
    case 'history.clear':
      state.history = [];
      break;
    case 'snapshot':
      return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        courses: courses.filter((c) => action.courseIds?.includes(c.id)),
        playlists: state.playlists.filter((p) =>
          action.playlistIds?.includes(p.id),
        ),
      };
    case 'proposal.edit': {
      const proposal = state.proposals.find((p) => p.id === action.id);
      if (
        !proposal ||
        proposal.kind !== 'playlist' ||
        proposal.status !== 'pending' ||
        proposal.expiresAt < Date.now() ||
        proposal.revision !== action.revision ||
        !state.connection.enabled ||
        !state.connection.allowDrafts ||
        proposal.selectionId !== state.selection.id ||
        proposal.selectionRevision !== state.selection.revision
      )
        throw new Error('Request changed or expired.');
      const items = uniqueVideos(action.items);
      if (
        items.some(
          (v) => !state.selection.items.some((s) => s.videoId === v.videoId),
        )
      )
        throw new Error('Video is outside the current selection.');
      proposal.items = items;
      proposal.title = z.string().trim().min(1).max(200).parse(action.title);
      proposal.revision++;
      result = proposal;
      break;
    }
    case 'proposal.approve': {
      const proposal = state.proposals.find((p) => p.id === action.id);
      if (
        !state.connection.enabled ||
        !proposal ||
        proposal.status !== 'pending' ||
        proposal.revision !== action.revision ||
        proposal.expiresAt < Date.now()
      )
        throw new Error('This request expired or is no longer available.');
      if (proposal.kind === 'playback') {
        if (
          !state.connection.allowPlayback ||
          !proposal.courseId ||
          !state.connection.courseIds.includes(proposal.courseId)
        )
          throw new Error('Playback access was removed.');
        proposal.status = 'approved';
        result = { playbackCourseId: proposal.courseId };
        break;
      }
      if (
        !state.connection.allowDrafts ||
        proposal.selectionId !== state.selection.id ||
        proposal.selectionRevision !== state.selection.revision
      )
        throw new Error('Selection or access changed. Ask for a new preview.');
      const created = createPlaylist(proposal.title, proposal.items);
      state.playlists.unshift(created);
      proposal.status = 'approved';
      proposal.resultId = created.id;
      result = created;
      break;
    }
    case 'proposal.reject': {
      const proposal = state.proposals.find((p) => p.id === action.id);
      if (proposal) proposal.status = 'rejected';
      break;
    }
  }
  if (action.op !== 'history.clear')
    state.history = [
      { at: new Date().toISOString(), action: action.op },
      ...state.history,
    ].slice(0, 50);
  await writeLearning(state);
  return result;
}

const mcpInputSchema = z
  .object({
    tool: z.string().max(100),
    args: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export async function liveMcpAction(input: unknown) {
  const { tool, args } = mcpInputSchema.parse(input);
  const state = await readLearning();
  if (!state.connection.enabled)
    throw new Error('Assistant access is disconnected.');
  const courses = (await courseRepository.getCourses()).filter((c) =>
    state.connection.courseIds.includes(c.id),
  );
  const playlists = state.playlists.filter((p) =>
    state.connection.playlistIds.includes(p.id),
  );
  const provenance = {
    mode: 'live',
    observedAt: new Date().toISOString(),
    profileId: state.connection.profileId,
  };
  let data: unknown;
  switch (tool) {
    case 'darb_list_courses': {
      const { offset, limit } = z
        .object({
          offset: z.number().int().min(0).default(0),
          limit: z.number().int().min(1).max(100).default(20),
        })
        .parse(args);
      data = {
        courses: courses.slice(offset, offset + limit).map(courseSummary),
        nextOffset:
          offset + limit < Math.max(courses.length, playlists.length)
            ? offset + limit
            : null,
        playlists: playlists.slice(offset, offset + limit),
      };
      break;
    }
    case 'darb_get_course': {
      data = courses.find((c) => c.id === args.courseId);
      if (!data) throw new Error('Course is unavailable or not shared.');
      break;
    }
    case 'darb_get_next_session': {
      nextSessionRequestSchema.parse(args);
      const playlist = playlists.find((p) => p.id === args.playlistId);
      if (args.playlistId !== undefined && !playlist)
        throw new Error('Playlist is unavailable or not shared.');
      const courseId = playlist
        ? courses.find(
            (c) =>
              c.videoId === playlist.cursorId &&
              (c.platform ?? 'youtube') === 'youtube',
          )?.id
        : args.courseId;
      if (typeof courseId !== 'string')
        throw new Error(
          'Prepare and share this playlist video as a course first.',
        );
      data = nextSession(courses, courseId);
      break;
    }
    case 'darb_preview_study_plan': {
      const parsed = z
        .object({
          courseIds: z.array(z.string()).min(1).max(50),
          minutes: z.number().positive().max(720),
        })
        .parse(args);
      let remaining = parsed.minutes * 60;
      data = parsed.courseIds
        .map((id) => nextSession(courses, id))
        .filter((item) => !item.completed)
        .flatMap((item) => {
          if (remaining <= 0) return [];
          const seconds = Math.min(remaining, item.remainingSeconds);
          remaining -= seconds;
          return [
            {
              ...item,
              plannedSeconds: seconds,
              endsMidSession: seconds < item.remainingSeconds,
            },
          ];
        });
      break;
    }
    case 'darb_get_selection':
      if (!state.connection.allowDrafts)
        throw new Error('Selection access is not enabled.');
      else data = state.selection;
      break;
    case 'darb_preview_playlist': {
      if (!state.connection.allowDrafts)
        throw new Error('Playlist drafting access is not enabled.');
      const parsed = z
        .object({
          title: z.string().min(1).max(200),
          videoIds: z.array(z.string()).min(1).max(100),
          selectionId: z.string(),
          selectionRevision: z.number().int().nonnegative(),
          idempotencyKey: z.string().min(1).max(200),
        })
        .parse(args);
      const existing = state.proposals.find(
        (p) => p.idempotencyKey === parsed.idempotencyKey,
      );
      if (existing) {
        if (
          existing.kind !== 'playlist' ||
          existing.title !== parsed.title ||
          existing.selectionId !== parsed.selectionId ||
          existing.selectionRevision !== parsed.selectionRevision ||
          existing.items.map((v) => v.videoId).join(',') !==
            parsed.videoIds.join(',')
        )
          throw new Error(
            'Idempotency key already used for a different request.',
          );
        if (existing.expiresAt < Date.now())
          throw new Error('Request expired. Use a new idempotency key.');
        data = existing;
        break;
      }
      if (
        parsed.selectionId !== state.selection.id ||
        parsed.selectionRevision !== state.selection.revision
      )
        throw new Error('Selection changed. Read it again.');
      const items = parsed.videoIds.map((id) => {
        const item = state.selection.items.find((v) => v.videoId === id);
        if (!item) throw new Error('Video is outside the shared selection.');
        return item;
      });
      uniqueVideos(items);
      const proposal = {
        id: crypto.randomUUID(),
        revision: 0,
        kind: 'playlist' as const,
        title: parsed.title,
        items,
        selectionId: state.selection.id,
        selectionRevision: state.selection.revision,
        status: 'pending' as const,
        expiresAt: Date.now() + 15 * 60_000,
        idempotencyKey: parsed.idempotencyKey,
      };
      state.proposals = [proposal, ...state.proposals].slice(0, 100);
      await writeLearning(state);
      data = proposal;
      break;
    }
    case 'darb_request_playlist_save': {
      const proposal = state.proposals.find((p) => p.id === args.previewId);
      if (
        !state.connection.allowDrafts ||
        !proposal ||
        proposal.kind !== 'playlist' ||
        proposal.expiresAt < Date.now() ||
        proposal.selectionId !== state.selection.id ||
        proposal.selectionRevision !== state.selection.revision
      )
        throw new Error('Preview expired or access/selection changed.');
      data = {
        requestId: proposal.id,
        status: proposal.status,
        playlistId: proposal.resultId,
        instruction: 'Review and approve this request in Darb → Assistant.',
      };
      break;
    }
    case 'darb_open_session': {
      if (
        !state.connection.allowPlayback ||
        typeof args.courseId !== 'string' ||
        !courses.some((c) => c.id === args.courseId)
      )
        throw new Error('Playback access is not enabled for this course.');
      const key = z.string().min(1).max(200).parse(args.idempotencyKey);
      const existing = state.proposals.find((p) => p.idempotencyKey === key);
      if (existing) {
        if (existing.kind !== 'playback' || existing.courseId !== args.courseId)
          throw new Error(
            'Idempotency key already used for a different request.',
          );
        if (existing.expiresAt < Date.now())
          throw new Error('Request expired. Use a new idempotency key.');
        data = { requestId: existing.id, status: existing.status };
        break;
      }
      const proposal = {
        id: crypto.randomUUID(),
        revision: 0,
        kind: 'playback' as const,
        title: courses.find((c) => c.id === args.courseId)!.title,
        items: [],
        selectionId: state.selection.id,
        selectionRevision: state.selection.revision,
        courseId: args.courseId,
        status: 'pending' as const,
        expiresAt: Date.now() + 60_000,
        idempotencyKey: key,
      };
      state.proposals = [proposal, ...state.proposals].slice(0, 100);
      await writeLearning(state);
      data = {
        requestId: proposal.id,
        status: 'pending',
        instruction:
          'Approve playback in Darb → Assistant. It will not run automatically.',
      };
      break;
    }
    default:
      throw new Error('Unknown Darb tool.');
  }
  return { ...provenance, data };
}
