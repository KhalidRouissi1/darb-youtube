import { browser } from 'wxt/browser';
import { z } from 'zod';
import { courseRepository } from '@/lib/storage/repository';
import { readLearning } from '@/lib/learning/repository';
import {
  descendants,
  initialWorkspace,
  libraryItems,
  tagsSchema,
  workspaceSchema,
  type Workspace,
} from './model';
const WORKSPACE_KEY = 'darb:workspace';
const actionSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('read') }),
  z.object({
    op: z.literal('folder.save'),
    revision: z.number().int(),
    id: z.string().optional(),
    name: z.string().trim().min(1).max(100),
    parentId: z.string().nullable(),
    order: z.number().int().nonnegative().optional(),
  }),
  z.object({
    op: z.literal('folder.remove'),
    revision: z.number().int(),
    id: z.string(),
  }),
  z.object({
    op: z.literal('folder.reorder'),
    revision: z.number().int(),
    ids: z.array(z.string()).max(500),
    parentId: z.string().nullable(),
  }),
  z.object({
    op: z.literal('items.update'),
    revision: z.number().int(),
    ids: z.array(z.string()).min(1).max(1000),
    folderId: z.string().nullable().optional(),
    tags: tagsSchema.optional(),
  }),
  z.object({
    op: z.literal('note.save'),
    revision: z.number().int(),
    id: z.string().optional(),
    title: z.string().trim().min(1).max(200),
    body: z.string().max(100_000),
    courseId: z.string().nullable(),
    seconds: z.number().finite().nonnegative().optional(),
    linkedIds: z.array(z.string()).max(100),
  }),
  z.object({
    op: z.literal('note.remove'),
    revision: z.number().int(),
    id: z.string(),
  }),
  z.object({
    op: z.literal('link.add'),
    revision: z.number().int(),
    source: z.string(),
    target: z.string(),
  }),
  z.object({
    op: z.literal('link.remove'),
    revision: z.number().int(),
    source: z.string(),
    target: z.string(),
  }),
  z.object({
    op: z.literal('preferences'),
    revision: z.number().int(),
    patch: workspaceSchema.shape.preferences.partial(),
  }),
]);
export async function readWorkspace(): Promise<Workspace> {
  const saved = await browser.storage.local.get(WORKSPACE_KEY);
  return saved[WORKSPACE_KEY] === undefined
    ? initialWorkspace()
    : workspaceSchema.parse(saved[WORKSPACE_KEY]);
}
export async function workspaceAction(input: unknown) {
  const action = actionSchema.parse(input);
  const state = await readWorkspace();
  if (action.op === 'read') return state;
  if (action.revision !== state.revision)
    throw new Error(
      'Your workspace changed in another tab. Review the latest version and try again.',
    );
  const courses = await courseRepository.getCourses();
  const learning = await readLearning();
  const catalog = libraryItems(courses, learning.playlists, state);
  const ids = new Set(catalog.map((i) => i.id));
  const validItem = (id: string) => {
    if (!ids.has(id)) throw new Error('This item no longer exists.');
  };
  const validFolder = (id: string | null | undefined) => {
    if (id && !state.folders.some((f) => f.id === id))
      throw new Error('Folder no longer exists.');
  };
  switch (action.op) {
    case 'folder.save': {
      validFolder(action.parentId);
      const existing = action.id
        ? state.folders.find((f) => f.id === action.id)
        : undefined;
      if (action.id && !existing) throw new Error('Folder no longer exists.');
      if (
        existing &&
        action.parentId &&
        descendants(state.folders, existing.id).has(action.parentId)
      )
        throw new Error(
          'A folder cannot be moved inside itself or its children.',
        );
      const saved = {
        id: existing?.id ?? crypto.randomUUID(),
        name: action.name,
        parentId: action.parentId,
        order: action.order ?? existing?.order ?? state.folders.length,
      };
      state.folders = existing
        ? state.folders.map((f) => (f.id === saved.id ? saved : f))
        : [...state.folders, saved];
      break;
    }
    case 'folder.remove': {
      validFolder(action.id);
      const removed = descendants(state.folders, action.id);
      state.folders = state.folders.filter((f) => !removed.has(f.id));
      for (const m of Object.values(state.metadata))
        if (m.folderId && removed.has(m.folderId)) m.folderId = null;
      if (removed.has(state.preferences.folderId))
        state.preferences.folderId = 'inbox';
      break;
    }
    case 'folder.reorder': {
      const siblings = state.folders.filter(
        (f) => f.parentId === action.parentId,
      );
      if (
        new Set(action.ids).size !== siblings.length ||
        action.ids.length !== siblings.length ||
        siblings.some((f) => !action.ids.includes(f.id))
      )
        throw new Error('Folder order changed. Try again.');
      for (const f of siblings) f.order = action.ids.indexOf(f.id);
      break;
    }
    case 'items.update': {
      validFolder(action.folderId);
      for (const id of action.ids) validItem(id);
      for (const id of action.ids) {
        const previous = state.metadata[id];
        state.metadata[id] = {
          folderId:
            action.folderId === undefined
              ? (previous?.folderId ?? null)
              : action.folderId,
          tags: action.tags ?? previous?.tags ?? [],
          updatedAt: new Date().toISOString(),
        };
      }
      break;
    }
    case 'note.save': {
      const now = new Date().toISOString();
      const previous = state.notes.find((n) => n.id === action.id);
      if (action.id && !previous) throw new Error('Note no longer exists.');
      if (action.courseId && !courses.some((c) => c.id === action.courseId))
        throw new Error('Linked course no longer exists.');
      const seconds =
        action.seconds ??
        (previous?.courseId === action.courseId
          ? previous?.seconds
          : undefined);
      const linkedCourse = courses.find((c) => c.id === action.courseId);
      if (
        seconds !== undefined &&
        (!linkedCourse || seconds >= linkedCourse.durationSeconds)
      )
        throw new Error('The note timestamp is outside this video.');
      for (const id of action.linkedIds) validItem(id);
      const id = previous?.id ?? crypto.randomUUID();
      const note = {
        id,
        title: action.title,
        body: action.body,
        courseId: action.courseId,
        ...(seconds !== undefined ? { seconds } : {}),
        linkedIds: [
          ...new Set(action.linkedIds.filter((key) => key !== `note:${id}`)),
        ],
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
      state.notes = previous
        ? state.notes.map((n) => (n.id === id ? note : n))
        : [note, ...state.notes];
      break;
    }
    case 'note.remove':
      state.notes = state.notes.filter((n) => n.id !== action.id);
      delete state.metadata[`note:${action.id}`];
      state.links = state.links.filter(
        (l) =>
          l.source !== `note:${action.id}` && l.target !== `note:${action.id}`,
      );
      for (const n of state.notes)
        n.linkedIds = n.linkedIds.filter((key) => key !== `note:${action.id}`);
      break;
    case 'link.add':
      validItem(action.source);
      validItem(action.target);
      if (action.source === action.target)
        throw new Error('Choose two different items.');
      if (
        !state.links.some(
          (l) =>
            (l.source === action.source && l.target === action.target) ||
            (l.target === action.source && l.source === action.target),
        )
      )
        state.links.push({ source: action.source, target: action.target });
      break;
    case 'link.remove':
      state.links = state.links.filter(
        (l) =>
          !(
            (l.source === action.source && l.target === action.target) ||
            (l.target === action.source && l.source === action.target)
          ),
      );
      break;
    case 'preferences':
      if (
        action.patch.folderId &&
        !['all', 'inbox'].includes(action.patch.folderId)
      )
        validFolder(action.patch.folderId);
      state.preferences = workspaceSchema.shape.preferences.parse({
        ...state.preferences,
        ...Object.fromEntries(
          Object.entries(action.patch).filter(
            ([, value]) => value !== undefined,
          ),
        ),
      });
      break;
  }
  state.revision++;
  await browser.storage.local.set({
    [WORKSPACE_KEY]: workspaceSchema.parse(state),
  });
  return state;
}
