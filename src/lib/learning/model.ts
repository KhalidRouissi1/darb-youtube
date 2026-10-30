import { z } from 'zod';
import { parseVideoUrl } from '../video/platforms';
import type { Course } from '../../types/course';
import { getCurrentSession, calculateCourseProgress } from '../utils/courses';

export const videoReferenceSchema = z
  .object({
    videoId: z.string().min(1).max(100),
    videoUrl: z.string().url().max(2048),
    title: z.string().trim().min(1).max(500),
    thumbnailUrl: z.string().url().optional(),
  })
  .superRefine((item, ctx) => {
    const identity = parseVideoUrl(item.videoUrl);
    if (
      !identity ||
      identity.platform !== 'youtube' ||
      identity.videoId !== item.videoId
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Only matching YouTube watch URLs are accepted.',
      });
    if (item.thumbnailUrl && new URL(item.thumbnailUrl).protocol !== 'https:')
      ctx.addIssue({ code: 'custom', message: 'Use HTTPS thumbnails.' });
  });
export type VideoReference = z.infer<typeof videoReferenceSchema>;
const selectionSchema = z.object({
  id: z.string(),
  revision: z.number().int().nonnegative(),
  items: z.array(videoReferenceSchema).max(100),
});
export const playlistSchema = z
  .object({
    id: z.string(),
    title: z.string().trim().min(1).max(200),
    items: z.array(videoReferenceSchema).min(1).max(100),
    cursorId: z.string(),
    completedVideoIds: z.array(z.string().min(1).max(100)).max(100).default([]),
    revision: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((p, ctx) => {
    if (
      new Set(p.completedVideoIds).size !== p.completedVideoIds.length ||
      p.completedVideoIds.some((id) => !p.items.some((v) => v.videoId === id))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Completed videos must belong to this playlist.',
      });
    if (
      new Set(p.items.map((v) => v.videoId)).size !== p.items.length ||
      !p.items.some((v) => v.videoId === p.cursorId)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Playlist must have unique videos and a valid current item.',
      });
  });
export type Playlist = z.infer<typeof playlistSchema>;
const proposalSchema = z.object({
  id: z.string(),
  revision: z.number().int().nonnegative().default(0),
  kind: z.enum(['playlist', 'playback']),
  title: z.string().max(200),
  items: z.array(videoReferenceSchema).max(100),
  selectionId: z.string(),
  selectionRevision: z.number().int().nonnegative(),
  courseId: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected']),
  resultId: z.string().optional(),
  expiresAt: z.number(),
  idempotencyKey: z.string().min(1).max(200),
});
export type Proposal = z.infer<typeof proposalSchema>;
const connectionSchema = z.object({
  profileId: z.string(),
  token: z.string(),
  enabled: z.boolean(),
  courseIds: z.array(z.string()).max(1000),
  playlistIds: z.array(z.string()).max(1000),
  allowDrafts: z.boolean(),
  allowPlayback: z.boolean(),
});
export const learningStateSchema = z.object({
  version: z.literal(1),
  selection: selectionSchema,
  playlists: z.array(playlistSchema).max(500),
  proposals: z.array(proposalSchema).max(100),
  connection: connectionSchema,
  history: z
    .array(z.object({ at: z.string(), action: z.string().max(200) }))
    .max(50),
});
export type LearningState = z.infer<typeof learningStateSchema>;
export const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string().datetime(),
  courses: z.array(z.unknown()).max(1000),
  playlists: z.array(playlistSchema).max(500),
});
export function initialLearningState(): LearningState {
  return {
    version: 1,
    selection: { id: crypto.randomUUID(), revision: 0, items: [] },
    playlists: [],
    proposals: [],
    connection: {
      profileId: crypto.randomUUID(),
      token: crypto.randomUUID() + crypto.randomUUID(),
      enabled: false,
      courseIds: [],
      playlistIds: [],
      allowDrafts: false,
      allowPlayback: false,
    },
    history: [],
  };
}
export function uniqueVideos(input: unknown): VideoReference[] {
  const videos = z.array(videoReferenceSchema).min(1).max(100).parse(input);
  if (new Set(videos.map((v) => v.videoId)).size !== videos.length)
    throw new Error('Remove repeated videos before saving.');
  return videos;
}
export function createPlaylist(
  title: string,
  items: unknown,
  now = new Date().toISOString(),
): Playlist {
  const videos = uniqueVideos(items);
  return playlistSchema.parse({
    id: crypto.randomUUID(),
    title,
    items: videos,
    cursorId: videos[0]!.videoId,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });
}
export function editPlaylist(
  previous: Playlist,
  title: string,
  items: unknown,
  revision: number,
): Playlist {
  if (previous.revision !== revision)
    throw new Error('This playlist changed. Reload it before saving.');
  const videos = uniqueVideos(items);
  return playlistSchema.parse({
    ...previous,
    title,
    items: videos,
    completedVideoIds: previous.completedVideoIds.filter((id) =>
      videos.some((v) => v.videoId === id),
    ),
    cursorId: videos.some((v) => v.videoId === previous.cursorId)
      ? previous.cursorId
      : videos[
          Math.min(
            previous.items.findIndex((v) => v.videoId === previous.cursorId),
            videos.length - 1,
          )
        ]!.videoId,
    revision: revision + 1,
    updatedAt: new Date().toISOString(),
  });
}
export function courseForVideo(
  courses: Course[],
  videoId: string,
): Course | undefined {
  return courses.find(
    (c) => (c.platform ?? 'youtube') === 'youtube' && c.videoId === videoId,
  );
}
export function nextSession(courses: Course[], courseId: string) {
  const course = courses.find((c) => c.id === courseId);
  if (!course) throw new Error('Course is unavailable or not shared.');
  const session = getCurrentSession(course);
  return {
    courseId: course.id,
    title: course.title,
    completed: course.completed,
    session,
    remainingSeconds: Math.max(
      0,
      session.endSeconds - (session.resumeSeconds ?? session.startSeconds),
    ),
  };
}

export function playlistVideoCompleted(
  playlist: Playlist,
  courses: Course[],
  videoId: string,
) {
  return (
    playlist.completedVideoIds.includes(videoId) ||
    courses.some(
      (course) =>
        (course.platform ?? 'youtube') === 'youtube' &&
        course.videoId === videoId &&
        (course.completed || course.sessions.at(-1)?.completed === true),
    )
  );
}
export function recordPlaylistVideoCompletion(
  playlist: Playlist,
  videoId: string,
) {
  if (!playlist.items.some((v) => v.videoId === videoId))
    throw new Error('Video is not in this playlist.');
  if (playlist.completedVideoIds.includes(videoId)) return;
  playlist.completedVideoIds.push(videoId);
  playlist.revision++;
  playlist.updatedAt = new Date().toISOString();
}

/** Only prepared courses contribute durations; unknown videos never count as zero. */
export function playlistSummary(playlist: Playlist, courses: Course[]) {
  const prepared = playlist.items.map((video) =>
    courseForVideo(courses, video.videoId),
  );
  return {
    knownSeconds: prepared.reduce(
      (total, course) => total + (course?.durationSeconds ?? 0),
      0,
    ),
    unknownVideos: prepared.filter((course) => !course).length,
    completedVideos: playlist.items.filter((v) =>
      playlistVideoCompleted(playlist, courses, v.videoId),
    ).length,
    videoCount: playlist.items.length,
  };
}

export function courseSummary(course: Course) {
  return {
    id: course.id,
    title: course.title,
    platform: course.platform ?? 'youtube',
    completed: course.completed,
    revision: course.updatedAt,
    progress: calculateCourseProgress(course),
  };
}
export const nextSessionRequestSchema = z
  .object({
    courseId: z.string().optional(),
    playlistId: z.string().optional(),
  })
  .refine(
    (value) => Boolean(value.courseId) !== Boolean(value.playlistId),
    'Choose exactly one course or playlist.',
  );
