import { z } from 'zod';
import type { Course } from '@/types/course';
import type { Playlist } from '@/lib/learning/model';
import { courseForVideo, playlistVideoCompleted } from '@/lib/learning/model';
import { calculateCourseProgress, getCourseStatus } from '@/lib/utils/courses';
const id = z.string().min(1).max(200);
export const tagsSchema = z
  .array(z.string().trim().min(1).max(60))
  .max(30)
  .transform((tags) => [...new Set(tags.map((t) => t.toLocaleLowerCase()))]);
const folderSchema = z.object({
  id,
  name: z.string().trim().min(1).max(100),
  parentId: id.nullable(),
  order: z.number().int().nonnegative(),
});
const noteSchema = z.object({
  id,
  title: z.string().trim().min(1).max(200),
  body: z.string().max(100_000),
  courseId: id.nullable(),
  seconds: z.number().finite().nonnegative().optional(),
  linkedIds: z.array(id).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
const preferencesSchema = z.object({
  view: z.enum(['list', 'table', 'cards']),
  sort: z.enum(['studied', 'added', 'title']),
  folderId: z.string(),
  kind: z.enum(['all', 'course', 'playlist', 'note']),
  status: z.enum(['all', 'not-started', 'in-progress', 'completed']),
  platform: z.enum(['all', 'youtube', 'x', 'facebook']),
  tag: z.string().max(60),
  search: z.string().max(500),
  positions: z.record(
    z.string(),
    z.object({
      x: z.number().finite().min(-10000).max(10000),
      y: z.number().finite().min(-10000).max(10000),
    }),
  ),
});
export const workspaceSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  folders: z.array(folderSchema).max(500),
  notes: z.array(noteSchema).max(1000),
  metadata: z.record(
    z.string(),
    z.object({
      folderId: id.nullable(),
      tags: tagsSchema,
      updatedAt: z.string().datetime(),
    }),
  ),
  links: z.array(z.object({ source: id, target: id })).max(5000),
  preferences: preferencesSchema,
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type Folder = z.infer<typeof folderSchema>;
export type Note = z.infer<typeof noteSchema>;
export type LibraryItem = {
  id: string;
  entityId: string;
  kind: 'course' | 'playlist' | 'note';
  title: string;
  platform: string;
  createdAt: string;
  updatedAt: string;
  progress: number | null;
  status: string;
  duration: number | null;
  thumbnailUrl?: string | undefined;
};
export const initialWorkspace = (): Workspace => ({
  version: 1,
  revision: 0,
  folders: [],
  notes: [],
  metadata: {},
  links: [],
  preferences: {
    view: 'list',
    sort: 'studied',
    folderId: 'all',
    kind: 'all',
    status: 'all',
    platform: 'all',
    tag: '',
    search: '',
    positions: {},
  },
});
function courseStatus(course: Course) {
  const status = getCourseStatus(course);
  return status === 'not-started' &&
    (course.currentSessionIndex > 0 ||
      course.sessions.some(
        (s) => (s.resumeSeconds ?? s.startSeconds) > s.startSeconds,
      ))
    ? 'in-progress'
    : status;
}
export function libraryItems(
  courses: Course[],
  playlists: Playlist[],
  workspace: Workspace,
): LibraryItem[] {
  return [
    ...courses.map((c) => ({
      id: `course:${c.id}`,
      entityId: c.id,
      kind: 'course' as const,
      title: c.title,
      platform: c.platform ?? 'youtube',
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      progress: calculateCourseProgress(c).percentage,
      status: courseStatus(c),
      duration: c.durationSeconds,
      thumbnailUrl: c.thumbnailUrl,
    })),
    ...playlists.map((p) => ({
      id: `playlist:${p.id}`,
      entityId: p.id,
      kind: 'playlist' as const,
      title: p.title,
      platform: 'youtube',
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      progress: Math.round(
        (p.items.filter((v) => playlistVideoCompleted(p, courses, v.videoId))
          .length /
          p.items.length) *
          100,
      ),
      status: p.items.every((v) =>
        playlistVideoCompleted(p, courses, v.videoId),
      )
        ? 'completed'
        : p.completedVideoIds.length > 0 ||
            p.items.some((v) => {
              const course = courseForVideo(courses, v.videoId);
              return course && courseStatus(course) !== 'not-started';
            })
          ? 'in-progress'
          : 'not-started',
      duration: p.items.every((v) => courseForVideo(courses, v.videoId))
        ? p.items.reduce(
            (sum, v) =>
              sum + courseForVideo(courses, v.videoId)!.durationSeconds,
            0,
          )
        : null,
    })),
    ...workspace.notes.map((n) => ({
      id: `note:${n.id}`,
      entityId: n.id,
      kind: 'note' as const,
      title: n.title,
      platform: 'local',
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      progress: null,
      status: 'note',
      duration: null,
    })),
  ];
}
export function descendants(folders: Folder[], id: string): Set<string> {
  const result = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of folders)
      if (f.parentId && result.has(f.parentId) && !result.has(f.id)) {
        result.add(f.id);
        changed = true;
      }
  }
  return result;
}
export function folderTrail(folders: Folder[], id: string): Folder[] {
  const path: Folder[] = [];
  let current = folders.find((f) => f.id === id);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    path.unshift(current);
    seen.add(current.id);
    current = folders.find((f) => f.id === current!.parentId);
  }
  return path;
}
export function filterLibrary(
  items: LibraryItem[],
  workspace: Workspace,
): LibraryItem[] {
  const p = workspace.preferences;
  const folderIds = descendants(workspace.folders, p.folderId);
  return items
    .filter((i) => {
      const m = workspace.metadata[i.id];
      return (
        (p.folderId === 'all' ||
          (p.folderId === 'inbox'
            ? !m?.folderId
            : !!m?.folderId && folderIds.has(m.folderId))) &&
        (p.kind === 'all' || i.kind === p.kind) &&
        (p.status === 'all' || i.status === p.status) &&
        (p.platform === 'all' || i.platform === p.platform) &&
        (!p.tag || m?.tags.includes(p.tag)) &&
        (!p.search ||
          `${i.title} ${m?.tags.join(' ') ?? ''} ${i.kind === 'note' ? (workspace.notes.find((n) => n.id === i.entityId)?.body ?? '') : ''}`
            .toLocaleLowerCase()
            .includes(p.search.toLocaleLowerCase()))
      );
    })
    .sort((a, b) =>
      p.sort === 'title'
        ? a.title.localeCompare(b.title)
        : p.sort === 'added'
          ? b.createdAt.localeCompare(a.createdAt)
          : b.updatedAt.localeCompare(a.updatedAt),
    );
}
export type GraphNode = {
  id: string;
  title: string;
  kind: LibraryItem['kind'] | 'topic' | 'folder';
};
export type GraphEdge = {
  source: string;
  target: string;
  kind: 'contains' | 'topic' | 'note' | 'related' | 'folder';
};
export function buildGraph(
  items: LibraryItem[],
  workspace: Workspace,
  courses: Course[],
  playlists: Playlist[],
) {
  const nodes: GraphNode[] = items.map((i) => ({
    id: i.id,
    title: i.title,
    kind: i.kind,
  }));
  const edges: GraphEdge[] = [];
  const edgeIds = new Set<string>();
  const ids = new Set(nodes.map((n) => n.id));
  const add = (source: string, target: string, kind: GraphEdge['kind']) => {
    const key = JSON.stringify([source, target, kind]);
    if (
      source !== target &&
      ids.has(source) &&
      ids.has(target) &&
      !edgeIds.has(key)
    ) {
      edgeIds.add(key);
      edges.push({ source, target, kind });
    }
  };
  for (const f of workspace.folders) {
    const node = {
      id: `folder:${f.id}`,
      title: f.name,
      kind: 'folder' as const,
    };
    nodes.push(node);
    ids.add(node.id);
  }
  for (const f of workspace.folders)
    if (f.parentId) add(`folder:${f.parentId}`, `folder:${f.id}`, 'folder');
  for (const item of items) {
    const meta = workspace.metadata[item.id];
    if (meta?.folderId) add(`folder:${meta.folderId}`, item.id, 'folder');
    for (const tag of meta?.tags ?? []) {
      const key = `topic:${tag}`;
      if (!ids.has(key)) {
        ids.add(key);
        nodes.push({ id: key, title: tag, kind: 'topic' });
      }
      add(item.id, key, 'topic');
    }
  }
  for (const p of playlists)
    for (const v of p.items) {
      const c = courseForVideo(courses, v.videoId);
      if (c) add(`playlist:${p.id}`, `course:${c.id}`, 'contains');
    }
  for (const n of workspace.notes) {
    for (const match of n.body.matchAll(
      /\[\[((?:course|playlist|note):[^\]]+)\]\]/g,
    ))
      add(`note:${n.id}`, match[1]!, 'note');
    for (const target of n.linkedIds) add(`note:${n.id}`, target, 'note');
    if (n.courseId) add(`note:${n.id}`, `course:${n.courseId}`, 'note');
  }
  for (const l of workspace.links) add(l.source, l.target, 'related');
  return { nodes, edges };
}
