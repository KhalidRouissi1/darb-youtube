import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import {
  courseRepository,
  getActivePlayback,
  saveActivePlayback,
} from '@/lib/storage/repository';
import { createCourse } from '@/lib/utils/courses';
import { coursesSchema } from '@/lib/validation/schemas';

describe('course storage', () => {
  beforeEach(async () => {
    await browser.storage.local.clear();
  });

  it('serializes and restores validated courses', async () => {
    const course = createCourse(
      {
        videoId: 'stored-video',
        videoUrl: 'https://www.youtube.com/watch?v=stored-video',
        title: 'Stored course',
        thumbnailUrl:
          'https://i.ytimg.com/vi/stored-video/hqdefault.jpg',
        durationSeconds: 1200,
      },
      15,
      {
        id: 'stored-course',
        now: '2026-01-01T00:00:00.000Z',
      },
    );

    await courseRepository.saveCourse(course);
    const restored = await courseRepository.getCourse(course.id);

    expect(restored).toEqual(course);
    expect(coursesSchema.safeParse(await courseRepository.getCourses()).success)
      .toBe(true);
  });

  it('rejects corrupt stored data rather than failing silently', async () => {
    await browser.storage.local.set({
      'coursora:courses': [{ title: 'missing everything else' }],
    });

    await expect(courseRepository.getCourses()).rejects.toThrow(
      'Saved courses need recovery',
    );
  });

  it('restores an active session after an extension or browser restart', async () => {
    const playback = {
      activationId: 'activation-1',
      tabId: 1,
      status: 'active' as const,
      courseId: 'course-1',
      sessionId: 'session-1',
      videoId: 'stored-video',
      startSeconds: 900,
      endSeconds: 1800,
      lastKnownSeconds: 1234,
      reportSequence: 0,
      startedAt: '2026-01-01T00:00:00.000Z',
    };

    await saveActivePlayback(playback);

    expect(await getActivePlayback()).toEqual(playback);
  });

  it('migrates a legacy playback checkpoint into its session', async () => {
    const course = createCourse(
      {
        videoId: 'legacy-video',
        videoUrl: 'https://www.youtube.com/watch?v=legacy-video',
        title: 'Legacy course',
        thumbnailUrl: 'https://i.ytimg.com/vi/legacy-video/hqdefault.jpg',
        durationSeconds: 1800,
      },
      15,
      { id: 'legacy-course', now: '2026-01-01T00:00:00.000Z' },
    );
    await browser.storage.local.set({
      'coursora:courses': [course],
      'coursora:active-playback': {
        courseId: course.id,
        sessionId: course.sessions[1]?.id,
        videoId: course.videoId,
        startSeconds: 900,
        endSeconds: 1800,
        lastKnownSeconds: 1234,
        startedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    const migrated = await courseRepository.getCourse(course.id);

    expect(migrated?.sessions[1]?.resumeSeconds).toBe(1234);
    expect(await getActivePlayback()).toBeNull();
  });
});
