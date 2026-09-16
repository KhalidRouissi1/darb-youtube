import { describe, expect, it } from 'vitest';
import { generateSessions } from '@/lib/utils/courses';

const idFactory = (() => {
  let index = 0;
  return () => `session-${index++}`;
})();

describe('session generation', () => {
  it('creates one session for a one-minute video', () => {
    const sessions = generateSessions({
      courseId: 'course-1',
      durationSeconds: 60,
      sessionLengthMinutes: 15,
      idFactory,
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      startSeconds: 0,
      endSeconds: 60,
    });
  });

  it('creates one session when the video is shorter than the daily duration', () => {
    const sessions = generateSessions({
      courseId: 'course-1',
      durationSeconds: 600,
      sessionLengthMinutes: 30,
      idFactory,
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.endSeconds).toBe(600);
  });

  it('does not create an extra session for an exactly divisible duration', () => {
    const sessions = generateSessions({
      courseId: 'course-1',
      durationSeconds: 3600,
      sessionLengthMinutes: 30,
      idFactory,
    });

    expect(sessions).toHaveLength(2);
    expect(sessions[1]).toMatchObject({
      startSeconds: 1800,
      endSeconds: 3600,
    });
  });

  it('creates a shorter final session for a non-divisible duration', () => {
    const sessions = generateSessions({
      courseId: 'course-1',
      durationSeconds: 3665,
      sessionLengthMinutes: 30,
      idFactory,
    });

    expect(sessions).toHaveLength(3);
    expect(sessions[2]).toMatchObject({
      startSeconds: 3600,
      endSeconds: 3665,
    });
  });

  it('rejects invalid session durations', () => {
    expect(() =>
      generateSessions({
        courseId: 'course-1',
        durationSeconds: 600,
        sessionLengthMinutes: 0,
      }),
    ).toThrow('Session duration');
  });
});
