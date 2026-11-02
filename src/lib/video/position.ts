import { adapterForPage } from '@/lib/platforms/adapter';
import { parseVideoUrl } from './platforms';
export function readVideoPosition(expected?: {
  videoId: string;
  platform?: string;
}) {
  const identity = parseVideoUrl(window.location.href);
  const adapter = adapterForPage();
  const player = adapter?.findPlayer();
  if (
    !identity ||
    !adapter ||
    !player ||
    player.seeking ||
    adapter.isAd() ||
    !Number.isFinite(player.currentTime) ||
    !Number.isFinite(player.duration) ||
    player.duration <= 0
  )
    throw new Error(
      'Wait for the recorded video to load before taking a note.',
    );
  if (
    expected &&
    (expected.videoId !== identity.videoId ||
      (expected.platform ?? 'youtube') !== identity.platform)
  )
    throw new Error(
      'This tab has changed videos. Reopen Darb on the current video.',
    );
  return {
    ...identity,
    ended: player.ended,
    seconds: Math.min(Math.max(0, player.currentTime), player.duration),
    durationSeconds: player.duration,
  };
}
