import type { Course, CourseProgress, CourseSession } from '@/types/course';
import type { YouTubeVideoMetadata } from '@/types/youtube';
import type { DarbSettings } from '@/types/settings';

export type RuntimeMessage =
  | {
      type: 'PING';
    }
  | {
      type: 'OPEN_DASHBOARD';
      courseId?: string;
    }
  | {
      type: 'OPEN_SESSION';
      courseId: string;
      sessionId?: string;
      restart?: boolean;
      sourceTabId?: number;
    }
  | {
      type: 'CONTINUE_SESSION_IN_TAB';
      courseId: string;
      sessionId: string;
    }
  | {
      type: 'SESSION_REACHED_END';
      courseId: string;
      sessionId: string;
      activationId: string;
    }
  | {
      type: 'REPORT_SESSION_POSITION';
      courseId: string;
      sessionId: string;
      activationId: string;
      seconds: number;
      sequence: number;
    }
  | { type: 'CREATE_COURSE'; course: Course }
  | { type: 'REPAIR_COURSE'; course: Course }
  | { type: 'DELETE_COURSE'; courseId: string }
  | { type: 'SET_SESSION_COMPLETION'; courseId: string; sessionId: string; completed: boolean }
  | { type: 'SAVE_SETTINGS'; settings: DarbSettings }
  | { type: 'RESET_DATA' }
  | { type: 'GET_TAB_ACTIVATION' }
  | { type: 'RELEASE_SESSION'; activationId: string };

export type RuntimeMessageResponse =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

export type SessionCompletionResponse =
  | {
      ok: true;
      course: Course;
      nextSession: CourseSession | null;
      progress: CourseProgress;
    }
  | {
      ok: false;
      error: string;
    };

export type ContentMessage =
  | {
      type: 'GET_VIDEO_METADATA';
    }
  | {
      type: 'ACTIVATE_SESSION';
      activationId: string;
    };

export type ContentActionResponse =
  | { ok: true; playback?: import('@/types/youtube').ActivePlayback }
  | {
      ok: false;
      error: string;
    };

export type VideoMetadataResponse =
  | {
      ok: true;
      video: YouTubeVideoMetadata;
    }
  | {
      ok: false;
      code:
        | 'NOT_YOUTUBE_VIDEO'
        | 'VIDEO_UNAVAILABLE'
        | 'DURATION_UNAVAILABLE'
        | 'YOUTUBE_STRUCTURE_CHANGED';
      error: string;
    };

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }

  const type = value.type;

  if (type === 'PING') {
    return true;
  }

  if (type === 'OPEN_DASHBOARD') {
    return !('courseId' in value) || typeof value.courseId === 'string';
  }

  if (type === 'OPEN_SESSION') {
    return (
      'courseId' in value &&
      typeof value.courseId === 'string' &&
      (!('sessionId' in value) || typeof value.sessionId === 'string') &&
      (!('restart' in value) || typeof value.restart === 'boolean')
      && (!('sourceTabId' in value) || typeof value.sourceTabId === 'number')
    );
  }

  if (type === 'CONTINUE_SESSION_IN_TAB') {
    return (
      'courseId' in value &&
      typeof value.courseId === 'string' &&
      'sessionId' in value &&
      typeof value.sessionId === 'string'
    );
  }

  if (type === 'SESSION_REACHED_END') {
    return (
      'courseId' in value &&
      typeof value.courseId === 'string' &&
      'sessionId' in value &&
      typeof value.sessionId === 'string' &&
      'activationId' in value && typeof value.activationId === 'string'
  );
  }

  if (type === 'REPORT_SESSION_POSITION') {
    return 'courseId' in value && typeof value.courseId === 'string' &&
      'sessionId' in value && typeof value.sessionId === 'string' &&
      'activationId' in value && typeof value.activationId === 'string' &&
      'seconds' in value && typeof value.seconds === 'number' &&
      'sequence' in value && typeof value.sequence === 'number';
  }

  if (type === 'CREATE_COURSE' || type === 'REPAIR_COURSE') return 'course' in value;
  if (type === 'DELETE_COURSE') return 'courseId' in value && typeof value.courseId === 'string';
  if (type === 'SET_SESSION_COMPLETION') return 'courseId' in value && typeof value.courseId === 'string' && 'sessionId' in value && typeof value.sessionId === 'string' && 'completed' in value && typeof value.completed === 'boolean';
  if (type === 'SAVE_SETTINGS') return 'settings' in value;
  if (type === 'RESET_DATA' || type === 'GET_TAB_ACTIVATION') return true;
  if (type === 'RELEASE_SESSION') return 'activationId' in value && typeof value.activationId === 'string';

  return false;
}

export function isContentMessage(value: unknown): value is ContentMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }

  return (
    value.type === 'GET_VIDEO_METADATA' ||
    (value.type === 'ACTIVATE_SESSION' && 'activationId' in value && typeof value.activationId === 'string')
  );
}
