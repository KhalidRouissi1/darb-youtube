import {
  initialLearningState,
  createPlaylist,
} from '../../src/lib/learning/model';
import { createCourse } from '../../src/lib/utils/courses';
import { initialWorkspace } from '../../src/lib/workspace/model';
import { DEFAULT_SETTINGS } from '../../src/lib/settings/defaults';
import { workspaceAction } from '../../src/lib/workspace/repository';
import { learningAction } from '../../src/lib/learning/actions';
const first = {
  platform: 'youtube' as const,
  videoId: 'abcdefghijk',
  videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  title: 'JavaScript fundamentals: from variables to functions',
  durationSeconds: 3600,
};
const second = {
  platform: 'youtube' as const,
  videoId: 'lmnopqrstuv',
  videoUrl: 'https://www.youtube.com/watch?v=lmnopqrstuv',
  title: 'Build a useful app with what you learned',
  durationSeconds: 1800,
};
export const sampleCourses = [
  createCourse(first, 15),
  createCourse(second, 15),
];
const learning = initialLearningState();
learning.playlists = [
  createPlaylist('From first line to first project', [first, second]),
];
const workspace = initialWorkspace();
workspace.folders = [
  { id: 'folder-js', name: 'JavaScript', parentId: null, order: 0 },
];
workspace.notes = [
  {
    id: 'note-example',
    title: 'How closures retain a value',
    body: 'The function keeps access to its outer variables. Revisit the example.',
    courseId: sampleCourses[0]!.id,
    seconds: 192,
    linkedIds: [`course:${sampleCourses[0]!.id}`],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
const data: Record<string, unknown> = {
  'coursora:storage-version': 3,
  'coursora:courses': sampleCourses,
  'coursora:settings': DEFAULT_SETTINGS,
  'darb:workspace': workspace,
  'darb:learning': learning,
};
const listeners = new Set<
  (changes: Record<string, unknown>, area: string) => void
>();
const updated = () => {
  for (const fn of listeners)
    fn({ 'darb:workspace': {}, 'darb:learning': {} }, 'local');
};
export const browser = {
  runtime: {
    id: 'preview',
    getURL: (path: string) => path,
    sendMessage: async (message: {
      type: string;
      action?: Record<string, unknown>;
    }) => {
      try {
        if (message.type === 'DARB_WORKSPACE')
          return { ok: true, data: await workspaceAction(message.action) };
        if (message.type === 'DARB_LEARNING')
          return { ok: true, data: await learningAction(message.action) };
        if (message.type === 'DARB_NOTE_MODE') {
          if (message.action?.enabled !== undefined)
            data['darb:note-mode'] = message.action.enabled;
          return { ok: true, enabled: data['darb:note-mode'] === true };
        }
        return {
          ok: false,
          error:
            'Sample preview only. Test playback in the installed extension.',
        };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    },
  },
  storage: {
    local: {
      get: async (keys?: string | string[]) => {
        const names =
          typeof keys === 'string' ? [keys] : (keys ?? Object.keys(data));
        return Object.fromEntries(names.map((key) => [key, data[key]]));
      },
      set: async (values: Record<string, unknown>) => {
        Object.assign(data, values);
        updated();
      },
      remove: async (keys: string | string[]) => {
        for (const key of typeof keys === 'string' ? [keys] : keys)
          delete data[key];
        updated();
      },
    },
    onChanged: {
      addListener: (
        fn: (changes: Record<string, unknown>, area: string) => void,
      ) => listeners.add(fn),
      removeListener: (
        fn: (changes: Record<string, unknown>, area: string) => void,
      ) => listeners.delete(fn),
    },
  },
  tabs: {
    query: async () => [{ id: 7, url: first.videoUrl, active: true }],
    create: async () => undefined,
    sendMessage: async (_id: number, message: { type: string }) =>
      message.type === 'GET_VIDEO_CONTEXT'
        ? { ok: true, url: first.videoUrl }
        : message.type === 'GET_VIDEO_METADATA'
          ? { ok: true, video: first }
          : message.type === 'GET_VIDEO_POSITION'
            ? { ok: true, position: { ...first, seconds: 192 } }
            : { ok: true },
    onUpdated: {
      addListener: () => undefined,
      removeListener: () => undefined,
    },
    onActivated: {
      addListener: () => undefined,
      removeListener: () => undefined,
    },
  },
  permissions: { contains: async () => false, request: async () => false },
};
