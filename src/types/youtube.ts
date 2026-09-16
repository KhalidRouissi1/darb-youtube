export interface YouTubeVideoMetadata {
  videoId: string;
  videoUrl: string;
  title: string;
  thumbnailUrl: string;
  channelName?: string | undefined;
  durationSeconds: number;
}

export interface ActivePlayback {
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
