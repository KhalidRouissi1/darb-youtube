export type VideoPlatform = 'youtube' | 'x' | 'facebook';
export interface VideoMetadata {
  /** Absent only in legacy YouTube callers. Persisted courses always include it. */
  platform?: VideoPlatform;
  videoId: string;
  videoUrl: string;
  title: string;
  thumbnailUrl?: string | undefined;
  channelName?: string | undefined;
  durationSeconds: number;
}
export interface ActivePlayback {
  platform?: VideoPlatform;
  activationId: string;
  tabId: number;
  status: 'pending' | 'active';
  courseId: string;
  sessionId: string;
  videoId: string;
  startSeconds: number;
  endSeconds: number;
  lastKnownSeconds: number;
  reportSequence: number;
  startedAt: string;
}
