import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { courseRepository, getActivePlayback } from '@/lib/storage/repository';
import { createCourse, findDuplicateCourses } from '@/lib/utils/courses';
import { STORAGE_KEYS } from '@/lib/storage/keys';
const metadata = {
  videoId: '123',
  videoUrl: 'https://www.youtube.com/watch?v=123',
  title: 'Saved course',
  durationSeconds: 7200,
};
describe('platform storage migration', () => {
  beforeEach(async () => browser.storage.local.clear());
  it('migrates v2 without overwriting session eight or its saved checkpoint', async () => {
    const course = createCourse(metadata, 15);
    delete course.platform;
    course.currentSessionIndex = 7;
    course.sessions[7]!.resumeSeconds = 6400;
    await browser.storage.local.set({
      [STORAGE_KEYS.storageVersion]: 2,
      [STORAGE_KEYS.courses]: [course],
      [STORAGE_KEYS.activePlayback]: {
        courseId: course.id,
        sessionId: course.sessions[7]!.id,
        lastKnownSeconds: 6350,
      },
    });
    const migrated = await courseRepository.getCourse(course.id);
    expect(migrated).toEqual({ ...course, platform: 'youtube' });
    expect(await getActivePlayback()).toBeNull();
    expect(await courseRepository.getCourse(course.id)).toEqual(migrated);
  });
  it('preserves the original recovery backup across another migration', async () => {
    const original = { courses: ['original backup'] };
    await browser.storage.local.set({
      [STORAGE_KEYS.storageVersion]: 2,
      [STORAGE_KEYS.courses]: [createCourse(metadata, 15)],
      [STORAGE_KEYS.legacyBackup]: original,
    });
    await Promise.all([
      courseRepository.getCourses(),
      courseRepository.getCourses(),
      getActivePlayback(),
    ]);
    expect(
      (await browser.storage.local.get(STORAGE_KEYS.legacyBackup))[
        STORAGE_KEYS.legacyBackup
      ],
    ).toEqual(original);
  });
  it('separates courses by platform even with identical IDs', async () => {
    const youtube = createCourse(metadata, 15);
    const x = createCourse(
      { ...metadata, platform: 'x', videoUrl: 'https://x.com/u/status/123' },
      15,
    );
    const facebook = createCourse(
      {
        ...metadata,
        platform: 'facebook',
        videoUrl: 'https://www.facebook.com/watch/?v=123',
      },
      15,
    );
    for (const course of [youtube, x, facebook])
      await courseRepository.saveCourse(course);
    expect(await courseRepository.findByVideoId('123', 'x')).toEqual([x]);
    expect(await courseRepository.findByVideoId('123')).toEqual([youtube]);
    expect(
      findDuplicateCourses([youtube, x, facebook], '123', 'facebook'),
    ).toEqual([facebook]);
  });
  it('backs up corrupt data and leaves it recoverable', async () => {
    const corrupt = [{ title: 'damaged' }];
    await browser.storage.local.set({
      [STORAGE_KEYS.storageVersion]: 2,
      [STORAGE_KEYS.courses]: corrupt,
    });
    await expect(courseRepository.getCourses()).rejects.toThrow(
      'need recovery',
    );
    const values = await browser.storage.local.get([
      STORAGE_KEYS.courses,
      STORAGE_KEYS.legacyBackup,
      STORAGE_KEYS.storageVersion,
    ]);
    expect(values[STORAGE_KEYS.courses]).toEqual(corrupt);
    expect(
      (values[STORAGE_KEYS.legacyBackup] as { courses: unknown }).courses,
    ).toEqual(corrupt);
    expect(values[STORAGE_KEYS.storageVersion]).toBe(2);
  });
});
