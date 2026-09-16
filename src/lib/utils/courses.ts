import type {
  Course,
  CourseProgress,
  CourseSession,
  CourseStatus,
} from '@/types/course';
import type { YouTubeVideoMetadata } from '@/types/youtube';

interface GenerateSessionsInput {
  courseId: string;
  durationSeconds: number;
  sessionLengthMinutes: number;
  idFactory?: () => string;
}

export function generateSessions({
  courseId,
  durationSeconds,
  sessionLengthMinutes,
  idFactory = () => crypto.randomUUID(),
}: GenerateSessionsInput): CourseSession[] {
  if (!courseId.trim()) {
    throw new Error('A course ID is required.');
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('Video duration must be greater than zero.');
  }

  if (
    !Number.isFinite(sessionLengthMinutes) ||
    sessionLengthMinutes <= 0 ||
    sessionLengthMinutes > 720
  ) {
    throw new Error('Session duration must be between 1 and 720 minutes.');
  }

  const sessionLengthSeconds = Math.round(sessionLengthMinutes * 60);
  const sessionCount = Math.ceil(durationSeconds / sessionLengthSeconds);

  return Array.from({ length: sessionCount }, (_, index) => {
    const startSeconds = index * sessionLengthSeconds;
    const endSeconds = Math.min(
      durationSeconds,
      startSeconds + sessionLengthSeconds,
    );

    return {
      id: idFactory(),
      courseId,
      index,
      title: `Session ${index + 1}`,
      startSeconds,
      endSeconds,
      completed: false,
    };
  });
}

export function createCourse(
  video: YouTubeVideoMetadata,
  sessionLengthMinutes: number,
  options: {
    id?: string;
    now?: string;
    sessionIdFactory?: () => string;
  } = {},
): Course {
  const id = options.id ?? crypto.randomUUID();
  const now = options.now ?? new Date().toISOString();
  const sessions = generateSessions({
    courseId: id,
    durationSeconds: video.durationSeconds,
    sessionLengthMinutes,
    ...(options.sessionIdFactory
      ? { idFactory: options.sessionIdFactory }
      : {}),
  });

  return {
    id,
    videoId: video.videoId,
    videoUrl: video.videoUrl,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    ...(video.channelName ? { channelName: video.channelName } : {}),
    durationSeconds: video.durationSeconds,
    sessionLengthMinutes,
    sessions,
    currentSessionIndex: 0,
    completed: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function rebuildCourseFromVideo(
  course: Course,
  video: YouTubeVideoMetadata,
  now = new Date().toISOString(),
): Course {
  const rebuilt = createCourse(video, course.sessionLengthMinutes, {
    id: course.id,
    now,
  });

  return {
    ...rebuilt,
    createdAt: course.createdAt,
  };
}

export function calculateCourseProgress(course: Course): CourseProgress {
  const completedSessions = course.sessions.filter(
    (session) => session.completed,
  );
  const watchedSeconds = completedSessions.reduce(
    (total, session) => total + (session.endSeconds - session.startSeconds),
    0,
  );
  const totalSessions = course.sessions.length;

  return {
    completedSessions: completedSessions.length,
    totalSessions,
    percentage:
      totalSessions === 0
        ? 0
        : Math.round((completedSessions.length / totalSessions) * 100),
    watchedSeconds,
    remainingSeconds: Math.max(0, course.durationSeconds - watchedSeconds),
  };
}

export function findNextIncompleteSessionIndex(
  sessions: CourseSession[],
): number | null {
  const session = [...sessions]
    .sort((first, second) => first.index - second.index)
    .find((candidate) => !candidate.completed);

  return session?.index ?? null;
}

export function setSessionCompletion(
  course: Course,
  sessionId: string,
  completed: boolean,
  now = new Date().toISOString(),
): Course {
  let changed = false;
  const sessions = course.sessions.map((session) => {
    if (session.id !== sessionId || session.completed === completed) {
      return session;
    }

    changed = true;

    if (completed) {
      return {
        ...session,
        completed: true,
        completedAt: now,
      };
    }

    const { completedAt: _completedAt, ...remaining } = session;
    return {
      ...remaining,
      completed: false,
    };
  });

  if (!changed) {
    return course;
  }

  const nextIndex = findNextIncompleteSessionIndex(sessions);

  return {
    ...course,
    sessions,
    currentSessionIndex:
      nextIndex ?? Math.max(0, course.sessions.length - 1),
    completed: nextIndex === null,
    updatedAt: now,
  };
}

export function selectCourseSession(
  course: Course,
  sessionId: string,
  now = new Date().toISOString(),
): Course {
  const session = course.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) {
    throw new Error('The requested session no longer exists.');
  }

  if (course.currentSessionIndex === session.index) {
    return course;
  }

  return {
    ...course,
    currentSessionIndex: session.index,
    updatedAt: now,
  };
}

export function completeSessionAndAdvance(
  course: Course,
  sessionId: string,
  now = new Date().toISOString(),
): { course: Course; nextSession: CourseSession | null } {
  const currentSession = course.sessions.find(
    (candidate) => candidate.id === sessionId,
  );
  if (!currentSession) {
    throw new Error('The requested session no longer exists.');
  }

  const completedCourse = setSessionCompletion(course, sessionId, true, now);
  const nextSession = [...completedCourse.sessions]
    .sort((first, second) => first.index - second.index)
    .find(
      (candidate) =>
        candidate.index > currentSession.index && !candidate.completed,
    ) ?? null;
  const currentSessionIndex = nextSession?.index ?? currentSession.index;

  return {
    course:
      completedCourse.currentSessionIndex === currentSessionIndex
        ? completedCourse
        : {
            ...completedCourse,
            currentSessionIndex,
            updatedAt: now,
          },
    nextSession,
  };
}

export function getCourseStatus(course: Course): CourseStatus {
  if (course.completed) {
    return 'completed';
  }

  if (course.sessions.some((session) => session.completed)) {
    return 'in-progress';
  }

  return 'not-started';
}

export function findDuplicateCourses(
  courses: Course[],
  videoId: string,
): Course[] {
  return courses.filter((course) => course.videoId === videoId);
}

export function getCurrentSession(course: Course): CourseSession {
  const indexedSession = course.sessions[course.currentSessionIndex];

  if (indexedSession && !indexedSession.completed) {
    return indexedSession;
  }

  const nextIncompleteIndex = findNextIncompleteSessionIndex(course.sessions);

  if (nextIncompleteIndex !== null) {
    const nextSession = course.sessions.find(
      (session) => session.index === nextIncompleteIndex,
    );

    if (nextSession) {
      return nextSession;
    }
  }

  if (indexedSession) {
    return indexedSession;
  }

  const firstSession = course.sessions[0];
  if (!firstSession) {
    throw new Error('Course does not contain any sessions.');
  }

  return firstSession;
}
