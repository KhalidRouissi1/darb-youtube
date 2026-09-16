import { describe, expect, it } from 'vitest';
import {
  calculateCourseProgress,
  completeSessionAndAdvance,
  createCourse,
  findDuplicateCourses,
  findNextIncompleteSessionIndex,
  getCourseStatus,
  getCurrentSession,
  rebuildCourseFromVideo,
  selectCourseSession,
  setSessionCompletion,
} from '@/lib/utils/courses';
import type { Course } from '@/types/course';

function makeCourse(): Course {
  return createCourse(
    {
      videoId: 'abc123',
      videoUrl: 'https://www.youtube.com/watch?v=abc123',
      title: 'Test course',
      thumbnailUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
      durationSeconds: 5400,
    },
    30,
    {
      id: 'course-1',
      now: '2026-01-01T00:00:00.000Z',
      sessionIdFactory: (() => {
        let index = 0;
        return () => `session-${index++}`;
      })(),
    },
  );
}

describe('course progress', () => {
  it('calculates completed percentage and remaining time', () => {
    const course = setSessionCompletion(
      makeCourse(),
      'session-0',
      true,
      '2026-01-02T00:00:00.000Z',
    );
    const progress = calculateCourseProgress(course);

    expect(progress.completedSessions).toBe(1);
    expect(progress.totalSessions).toBe(3);
    expect(progress.percentage).toBe(33);
    expect(progress.watchedSeconds).toBe(1800);
    expect(progress.remainingSeconds).toBe(3600);
  });

  it('finds the next incomplete session and completes the course', () => {
    let course = makeCourse();
    course = setSessionCompletion(course, 'session-1', true);

    expect(findNextIncompleteSessionIndex(course.sessions)).toBe(0);
    expect(course.currentSessionIndex).toBe(0);

    course = setSessionCompletion(course, 'session-0', true);
    expect(course.currentSessionIndex).toBe(2);

    course = setSessionCompletion(course, 'session-2', true);
    expect(course.completed).toBe(true);
    expect(getCourseStatus(course)).toBe('completed');
  });

  it('does not remove progress when a completed session is completed again', () => {
    const completed = setSessionCompletion(
      makeCourse(),
      'session-0',
      true,
      '2026-01-02T00:00:00.000Z',
    );
    const reopened = setSessionCompletion(
      completed,
      'session-0',
      true,
      '2026-01-03T00:00:00.000Z',
    );

    expect(reopened).toBe(completed);
    expect(reopened.sessions[0]?.completedAt).toBe(
      '2026-01-02T00:00:00.000Z',
    );
  });

  it('remembers a directly opened session', () => {
    const selected = selectCourseSession(makeCourse(), 'session-2');

    expect(selected.currentSessionIndex).toBe(2);
    expect(getCurrentSession(selected).id).toBe('session-2');
  });

  it('advances forward from the active session without returning to earlier gaps', () => {
    const course = createCourse(
      {
        videoId: 'long-video',
        videoUrl: 'https://www.youtube.com/watch?v=long-video',
        title: 'Long course',
        thumbnailUrl: 'https://i.ytimg.com/vi/long-video/hqdefault.jpg',
        durationSeconds: 18_000,
      },
      30,
      {
        id: 'long-course',
        sessionIdFactory: (() => {
          let index = 0;
          return () => `long-session-${index++}`;
        })(),
      },
    );

    const selected = selectCourseSession(course, 'long-session-7');
    const advancement = completeSessionAndAdvance(
      selected,
      'long-session-7',
    );

    expect(advancement.nextSession?.id).toBe('long-session-8');
    expect(advancement.course.currentSessionIndex).toBe(8);
    expect(advancement.course.sessions[0]?.completed).toBe(false);
  });

  it('finds duplicate videos without conflating distinct courses', () => {
    const first = makeCourse();
    const second = { ...makeCourse(), id: 'course-2' };
    const unrelated = {
      ...makeCourse(),
      id: 'course-3',
      videoId: 'different',
    };

    expect(
      findDuplicateCourses([first, second, unrelated], 'abc123'),
    ).toHaveLength(2);
  });

  it('repairs a course saved with the wrong video duration', () => {
    const incorrectlyCompleted = {
      ...setSessionCompletion(makeCourse(), 'session-0', true),
      durationSeconds: 1800,
      sessions: [
        {
          ...makeCourse().sessions[0]!,
          endSeconds: 1800,
          completed: true,
          completedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      currentSessionIndex: 0,
      completed: true,
    };

    const repaired = rebuildCourseFromVideo(incorrectlyCompleted, {
      videoId: 'abc123',
      videoUrl: 'https://www.youtube.com/watch?v=abc123',
      title: 'Eight hour course',
      thumbnailUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
      durationSeconds: 28800,
    });

    expect(repaired.sessions).toHaveLength(16);
    expect(repaired.completed).toBe(false);
    expect(repaired.sessions.every((session) => !session.completed)).toBe(
      true,
    );
    expect(repaired.createdAt).toBe(incorrectlyCompleted.createdAt);
  });
});
