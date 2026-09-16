import { z } from 'zod';

const isoDateSchema = z.string().datetime();

export const courseSessionSchema = z
  .object({
    id: z.string().min(1),
    courseId: z.string().min(1),
    index: z.number().int().nonnegative(),
    title: z.string().min(1),
    startSeconds: z.number().finite().nonnegative(),
    endSeconds: z.number().finite().positive(),
    resumeSeconds: z.number().finite().nonnegative().optional(),
    completed: z.boolean(),
    completedAt: isoDateSchema.optional(),
  })
  .superRefine((session, context) => {
    if (session.startSeconds >= session.endSeconds) {
      context.addIssue({
        code: 'custom',
        message: 'Session start time must be lower than its end time.',
        path: ['endSeconds'],
      });
    }
    if (
      session.resumeSeconds !== undefined &&
      (session.resumeSeconds < session.startSeconds ||
        session.resumeSeconds > session.endSeconds)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Session resume time must be inside the session.',
        path: ['resumeSeconds'],
      });
    }
  });

export const courseSchema = z
  .object({
    id: z.string().min(1),
    videoId: z.string().min(1),
    videoUrl: z.url(),
    title: z.string().min(1),
    thumbnailUrl: z.url(),
    channelName: z.string().min(1).optional(),
    durationSeconds: z.number().finite().positive(),
    sessionLengthMinutes: z.number().finite().positive(),
    sessions: z.array(courseSessionSchema).min(1),
    currentSessionIndex: z.number().int().nonnegative(),
    completed: z.boolean(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .superRefine((course, context) => {
    let previousEnd = 0;
    const expectedSessionSeconds = Math.round(
      course.sessionLengthMinutes * 60,
    );

    course.sessions.forEach((session, index) => {
      if (session.courseId !== course.id) {
        context.addIssue({
          code: 'custom',
          message: 'Session does not belong to its course.',
          path: ['sessions', index, 'courseId'],
        });
      }

      if (index === 0 && session.startSeconds !== 0) {
        context.addIssue({
          code: 'custom',
          message: 'The first session must start at zero.',
          path: ['sessions', index, 'startSeconds'],
        });
      }

      if (index > 0 && session.startSeconds !== previousEnd) {
        context.addIssue({
          code: 'custom',
          message: 'Course sessions must be contiguous and cannot overlap.',
          path: ['sessions', index, 'startSeconds'],
        });
      }

      const sessionDuration = session.endSeconds - session.startSeconds;
      const isFinalSession = index === course.sessions.length - 1;
      if (
        (!isFinalSession && sessionDuration !== expectedSessionSeconds) ||
        (isFinalSession && sessionDuration > expectedSessionSeconds)
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Session duration must match the daily duration except for the final session.',
          path: ['sessions', index, 'endSeconds'],
        });
      }

      previousEnd = session.endSeconds;
    });

    if (previousEnd !== course.durationSeconds) {
      context.addIssue({
        code: 'custom',
        message: 'The final session must end at the video duration.',
        path: ['sessions', course.sessions.length - 1, 'endSeconds'],
      });
    }

    const allSessionsCompleted = course.sessions.every(
      (session) => session.completed,
    );
    if (course.completed !== allSessionsCompleted) {
      context.addIssue({
        code: 'custom',
        message:
          'Course completion must match the completion state of all sessions.',
        path: ['completed'],
      });
    }

    if (course.currentSessionIndex >= course.sessions.length) {
      context.addIssue({
        code: 'custom',
        message: 'Current session index is outside the session list.',
        path: ['currentSessionIndex'],
      });
    }
  });

export const coursesSchema = z.array(courseSchema);

export const settingsSchema = z.object({
  defaultSessionLengthMinutes: z.number().finite().min(1).max(720),
  autoPauseAtSessionEnd: z.boolean(),
  autoMarkSessionsComplete: z.boolean(),
  showCompletionOverlay: z.boolean(),
  notificationsEnabled: z.boolean(),
  darkMode: z.boolean(),
});

export const activePlaybackSchema = z.object({
  activationId: z.string().min(1),
  tabId: z.number().int().nonnegative(),
  status: z.enum(['pending', 'active']),
  courseId: z.string().min(1),
  sessionId: z.string().min(1),
  videoId: z.string().min(1),
  startSeconds: z.number().finite().nonnegative(),
  endSeconds: z.number().finite().positive(),
  lastKnownSeconds: z.number().finite().nonnegative(),
  reportSequence: z.number().int().nonnegative(),
  startedAt: isoDateSchema,
}).superRefine((playback, context) => {
  if (
    playback.lastKnownSeconds < playback.startSeconds ||
    playback.lastKnownSeconds > playback.endSeconds
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Playback checkpoint must be inside the session.',
      path: ['lastKnownSeconds'],
    });
  }
});

export const videoMetadataSchema = z.object({
  videoId: z.string().min(1),
  videoUrl: z.url(),
  title: z.string().min(1),
  thumbnailUrl: z.url(),
  channelName: z.string().min(1).optional(),
  durationSeconds: z.number().finite().positive(),
});
