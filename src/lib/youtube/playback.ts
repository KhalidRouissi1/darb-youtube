import type { ActivePlayback } from '@/types/youtube';

export function resolveResumeSeconds(
  playback: ActivePlayback,
  currentSeconds: number,
): number {
  const currentIsInsideSession =
    currentSeconds >= playback.startSeconds - 2 &&
    currentSeconds <= playback.endSeconds + 2;

  if (currentIsInsideSession) {
    return currentSeconds;
  }

  return Math.max(
    playback.startSeconds,
    Math.min(playback.lastKnownSeconds, playback.endSeconds - 1),
  );
}

export function hasReachedSessionEnd(
  currentSeconds: number,
  endSeconds: number,
): boolean {
  return currentSeconds >= endSeconds - 0.25;
}
