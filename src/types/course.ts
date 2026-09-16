export type CourseStatus = 'not-started' | 'in-progress' | 'completed';

export interface CourseSession {
  id: string;
  courseId: string;
  index: number;
  title: string;
  startSeconds: number;
  endSeconds: number;
  /** Last durable position inside this session. Omitted means startSeconds. */
  resumeSeconds?: number | undefined;
  completed: boolean;
  completedAt?: string | undefined;
}

export interface Course {
  id: string;
  videoId: string;
  videoUrl: string;
  title: string;
  thumbnailUrl: string;
  channelName?: string | undefined;
  durationSeconds: number;
  sessionLengthMinutes: number;
  sessions: CourseSession[];
  currentSessionIndex: number;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CourseProgress {
  completedSessions: number;
  totalSessions: number;
  percentage: number;
  watchedSeconds: number;
  remainingSeconds: number;
}
