import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS } from '@/lib/settings/defaults';
import { STORAGE_KEYS } from '@/lib/storage/keys';
import {
  activePlaybackSchema,
  courseSchema,
  coursesSchema,
  settingsSchema,
} from '@/lib/validation/schemas';
import type { Course } from '@/types/course';
import type { DarbSettings } from '@/types/settings';
import type { ActivePlayback } from '@/types/youtube';

const STORAGE_VERSION = 2;

export interface CourseRepository {
  getCourses(): Promise<Course[]>;
  getCourse(id: string): Promise<Course | null>;
  saveCourse(course: Course): Promise<void>;
  deleteCourse(id: string): Promise<void>;
  updateCourse(course: Course): Promise<void>;
  findByVideoId(videoId: string): Promise<Course[]>;
}

export class StorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StorageError';
  }
}

class ChromeCourseRepository implements CourseRepository {
  async getCourses(): Promise<Course[]> {
    try {
      await migrateStorage();
      const stored = await browser.storage.local.get(STORAGE_KEYS.courses);
      return coursesSchema.parse(stored[STORAGE_KEYS.courses] ?? []);
    } catch (error) {
      throw toStorageError('Unable to read saved courses.', error);
    }
  }

  async getCourse(id: string): Promise<Course | null> {
    const courses = await this.getCourses();
    return courses.find((course) => course.id === id) ?? null;
  }

  async saveCourse(course: Course): Promise<void> {
    const validatedCourse = courseSchema.parse(course);
    const courses = await this.getCourses();
    const index = courses.findIndex(
      (candidate) => candidate.id === validatedCourse.id,
    );

    if (index === -1) {
      courses.unshift(validatedCourse);
    } else {
      courses[index] = validatedCourse;
    }

    await writeCourses(courses);
  }

  async updateCourse(course: Course): Promise<void> {
    const courses = await this.getCourses();
    const exists = courses.some((candidate) => candidate.id === course.id);

    if (!exists) {
      throw new StorageError('The course no longer exists.');
    }

    await this.saveCourse(course);
  }

  async deleteCourse(id: string): Promise<void> {
    const courses = await this.getCourses();
    await writeCourses(courses.filter((course) => course.id !== id));
  }

  async findByVideoId(videoId: string): Promise<Course[]> {
    const courses = await this.getCourses();
    return courses.filter((course) => course.videoId === videoId);
  }
}

export const courseRepository: CourseRepository =
  new ChromeCourseRepository();

export async function getSettings(): Promise<DarbSettings> {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEYS.settings);
    const value = stored[STORAGE_KEYS.settings];

    if (value === undefined) {
      return DEFAULT_SETTINGS;
    }

    return settingsSchema.parse(value);
  } catch (error) {
    throw toStorageError('Unable to read settings.', error);
  }
}

export async function saveSettings(
  settings: DarbSettings,
): Promise<void> {
  try {
    const validatedSettings = settingsSchema.parse(settings);
    await browser.storage.local.set({
      [STORAGE_KEYS.settings]: validatedSettings,
    });
  } catch (error) {
    throw toStorageError('Unable to save settings.', error);
  }
}

export async function getActivePlayback(): Promise<ActivePlayback | null> {
  try {
    await migrateStorage();
    const stored = await browser.storage.local.get(
      STORAGE_KEYS.activePlayback,
    );
    const value = stored[STORAGE_KEYS.activePlayback];

    return value === undefined ? null : activePlaybackSchema.parse(value);
  } catch (error) {
    throw toStorageError('Unable to restore playback tracking.', error);
  }
}

async function migrateStorage(): Promise<void> {
  const stored = await browser.storage.local.get([
    STORAGE_KEYS.storageVersion,
    STORAGE_KEYS.courses,
    STORAGE_KEYS.activePlayback,
  ]);
  if (stored[STORAGE_KEYS.storageVersion] === STORAGE_VERSION) return;

  const legacyCourses = stored[STORAGE_KEYS.courses];
  const legacyPlayback = stored[STORAGE_KEYS.activePlayback] as
    | { courseId?: string; sessionId?: string; lastKnownSeconds?: number }
    | undefined;

  if (legacyCourses !== undefined) {
    // Keep the original value so a future recovery tool can inspect it.
    await browser.storage.local.set({ [STORAGE_KEYS.legacyBackup]: {
      courses: legacyCourses,
      activePlayback: stored[STORAGE_KEYS.activePlayback],
    }});
  }

  const parsed = coursesSchema.safeParse(legacyCourses ?? []);
  if (!parsed.success) {
    // Never overwrite unreadable user data. A surfaced read error is safer.
    throw toStorageError('Saved courses need recovery and were left untouched.', parsed.error);
  }

  const courses = parsed.data.map((course) => ({
    ...course,
    sessions: course.sessions.map((session) => {
      if (
        legacyPlayback?.courseId === course.id &&
        legacyPlayback.sessionId === session.id &&
        typeof legacyPlayback.lastKnownSeconds === 'number' &&
        legacyPlayback.lastKnownSeconds >= session.startSeconds &&
        legacyPlayback.lastKnownSeconds <= session.endSeconds
      ) {
        return { ...session, resumeSeconds: legacyPlayback.lastKnownSeconds };
      }
      return session;
    }),
  }));
  await browser.storage.local.set({
    [STORAGE_KEYS.courses]: courses,
    [STORAGE_KEYS.storageVersion]: STORAGE_VERSION,
  });
  // Legacy active records lacked a trustworthy tab owner.
  await browser.storage.local.remove(STORAGE_KEYS.activePlayback);
}

export async function saveActivePlayback(
  playback: ActivePlayback,
): Promise<void> {
  try {
    await migrateStorage();
    const validatedPlayback = activePlaybackSchema.parse(playback);
    await browser.storage.local.set({
      [STORAGE_KEYS.activePlayback]: validatedPlayback,
    });
  } catch (error) {
    throw toStorageError('Unable to save playback tracking.', error);
  }
}

export async function clearActivePlayback(): Promise<void> {
  try {
    await browser.storage.local.remove(STORAGE_KEYS.activePlayback);
  } catch (error) {
    throw toStorageError('Unable to clear playback tracking.', error);
  }
}

export async function resetAllData(): Promise<void> {
  try {
    await browser.storage.local.remove(Object.values(STORAGE_KEYS));
  } catch (error) {
    throw toStorageError('Unable to reset Darb data.', error);
  }
}

async function writeCourses(courses: Course[]): Promise<void> {
  try {
    const validatedCourses = coursesSchema.parse(courses);
    await browser.storage.local.set({
      [STORAGE_KEYS.courses]: validatedCourses,
    });
  } catch (error) {
    throw toStorageError('Unable to save course progress.', error);
  }
}

function toStorageError(message: string, error: unknown): StorageError {
  if (error instanceof StorageError) {
    return error;
  }

  return new StorageError(message, {
    cause: error,
  });
}
