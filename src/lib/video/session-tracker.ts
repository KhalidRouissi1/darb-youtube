import { browser } from 'wxt/browser';
import { adapterForPage } from '@/lib/platforms/adapter';
import { getSettings } from '@/lib/storage/repository';
import { parseVideoUrl, sameVideo } from './platforms';
import { hasReachedSessionEnd } from '@/lib/video/playback';
import {
  removeCompletionOverlay,
  showCompletionOverlay,
} from '@/lib/video/completion-overlay';
import type {
  ContentActionResponse,
  SessionCompletionResponse,
} from '@/lib/messaging/messages';

let restoreGeneration = 0;
let controller: AbortController | null = null;
let player: HTMLVideoElement | null = null;
let saveCheckpoint: (() => Promise<void>) | null = null;
export function trackedPlayer(): HTMLVideoElement | null {
  return player;
}
export async function stopSessionTracking(): Promise<void> {
  restoreGeneration += 1;
  let pending: Promise<void> | undefined;
  try {
    pending = saveCheckpoint?.();
  } catch {
    /* No valid player remains. */
  }
  controller?.abort();
  controller = null;
  player = null;
  saveCheckpoint = null;
  removeCompletionOverlay();
  await pending?.catch(() => undefined);
}
export async function restoreSessionTracking(
  options: { attemptPlayback?: boolean; activationId?: string } = {},
): Promise<void> {
  const stopping = stopSessionTracking();
  const generation = restoreGeneration;
  await stopping;
  if (generation !== restoreGeneration) return;
  controller = new AbortController();
  const signal = controller.signal;
  const response = await browser.runtime.sendMessage<
    { type: 'GET_TAB_ACTIVATION' },
    ContentActionResponse
  >({ type: 'GET_TAB_ACTIVATION' });
  if (signal.aborted) return;
  if (!response?.ok || !response.playback) {
    if (options.activationId)
      throw new Error(
        response && !response.ok
          ? response.error
          : 'No active session belongs to this tab.',
      );
    return;
  }
  const playback = response.playback;
  if (options.activationId && playback.activationId !== options.activationId)
    throw new Error('This session is no longer active.');
  const identity = parseVideoUrl(window.location.href);
  const adapter = adapterForPage();
  if (!identity || !adapter || !sameVideo(playback, identity))
    throw new Error('Open the saved video to resume this course.');
  const video = await adapter.waitForPlayer(signal);
  if (signal.aborted) return;
  player = video;
  const deadline = Date.now() + 30000;
  while (
    !signal.aborted &&
    (adapter.isAd() || video.readyState < 1 || !Number.isFinite(video.duration))
  ) {
    if (Date.now() > deadline)
      throw new Error('Wait for the recorded video to load, then retry.');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  signal.throwIfAborted();
  if (video.duration < playback.endSeconds - 1)
    throw new Error(
      'The video duration changed. Recreate or repair this course.',
    );
  const settings = await getSettings();
  if (signal.aborted) return;
  let terminal = false;
  let sequence = playback.reportSequence;
  let savedAt = 0;
  let suspended = false;
  let contentPosition = playback.lastKnownSeconds;
  const contentDuration = video.duration;
  const matches = () => {
    const current = parseVideoUrl(window.location.href);
    return (
      !!current &&
      sameVideo(playback, current) &&
      video.isConnected &&
      adapter.findPlayer() === video
    );
  };
  const report = async (force = false) => {
    if (
      terminal ||
      signal.aborted ||
      suspended ||
      adapter.isAd() ||
      !matches() ||
      Math.abs(video.duration - contentDuration) > 1
    )
      return;
    if (!force && Date.now() - savedAt < 5000) return;
    savedAt = Date.now();
    await browser.runtime.sendMessage({
      type: 'REPORT_SESSION_POSITION',
      courseId: playback.courseId,
      sessionId: playback.sessionId,
      activationId: playback.activationId,
      seconds: Math.max(
        playback.startSeconds,
        Math.min(video.currentTime, playback.endSeconds),
      ),
      sequence: ++sequence,
    });
  };
  const finish = async () => {
    if (
      terminal ||
      signal.aborted ||
      suspended ||
      adapter.isAd() ||
      !matches() ||
      Math.abs(video.duration - contentDuration) > 1
    )
      return;
    terminal = true;
    detach();
    if (settings.autoPauseAtSessionEnd) video.pause();
    if (!settings.autoMarkSessionsComplete) {
      await browser.runtime.sendMessage({
        type: 'REPORT_SESSION_POSITION',
        courseId: playback.courseId,
        sessionId: playback.sessionId,
        activationId: playback.activationId,
        seconds: Math.max(playback.startSeconds, playback.endSeconds - 1),
        sequence: ++sequence,
      });
      await browser.runtime.sendMessage({
        type: 'RELEASE_SESSION',
        activationId: playback.activationId,
      });
      return;
    }
    const completion = await browser.runtime.sendMessage<
      {
        type: 'SESSION_REACHED_END';
        courseId: string;
        sessionId: string;
        activationId: string;
      },
      SessionCompletionResponse
    >({
      type: 'SESSION_REACHED_END',
      courseId: playback.courseId,
      sessionId: playback.sessionId,
      activationId: playback.activationId,
    });
    if (!signal.aborted && completion?.ok && settings.showCompletionOverlay)
      showCompletionOverlay(completion);
  };
  const tick = () => {
    try {
      if (!matches()) {
        void stopSessionTracking();
        return;
      }
      if (
        adapter.isAd() ||
        Math.abs(video.duration - contentDuration) > 1 ||
        !Number.isFinite(video.duration)
      ) {
        suspended = true;
        return;
      }
      if (suspended) {
        if (
          video.readyState < 1 ||
          !Number.isFinite(video.duration) ||
          Math.abs(video.duration - contentDuration) > 1
        )
          return;
        video.currentTime = contentPosition;
        suspended = false;
        return;
      }
      if (terminal || signal.aborted) return;
      contentPosition = video.currentTime;
      if (video.currentTime < playback.startSeconds - 2) {
        video.currentTime = playback.startSeconds;
        return;
      }
      void report().catch(() => undefined);
      if (hasReachedSessionEnd(video.currentTime, playback.endSeconds))
        void finish().catch(() => undefined);
    } catch {
      void stopSessionTracking();
    }
  };
  const forceSave = () => {
    void report(true).catch(() => undefined);
  };
  const visibility = () => {
    if (document.visibilityState === 'hidden') forceSave();
  };
  const target = Math.max(
    playback.startSeconds,
    Math.min(playback.lastKnownSeconds, playback.endSeconds - 1),
  );
  try {
    if (Math.abs(video.currentTime - target) > 0.25) video.currentTime = target;
  } catch {
    throw new Error('This video cannot seek yet. Press Play and retry.');
  }
  // Wait for the requested position before accepting progress, preventing load-time zeroes.
  if (Math.abs(video.currentTime - target) > 2)
    throw new Error('Unable to resume this video. Press Play and retry.');
  video.addEventListener('timeupdate', tick);
  video.addEventListener('seeked', tick);
  video.addEventListener('pause', forceSave);
  video.addEventListener('ended', tick);
  document.addEventListener('visibilitychange', visibility);
  const timer = window.setInterval(tick, 500);
  function detach() {
    video.removeEventListener('timeupdate', tick);
    video.removeEventListener('seeked', tick);
    video.removeEventListener('pause', forceSave);
    video.removeEventListener('ended', tick);
    document.removeEventListener('visibilitychange', visibility);
    window.clearInterval(timer);
  }
  saveCheckpoint = () => report(true);
  signal.addEventListener('abort', detach, { once: true });
  if (options.attemptPlayback) {
    try {
      await video.play();
    } catch {
      if (!signal.aborted) showPlayNotice(video, signal);
    }
  }
}
function showPlayNotice(video: HTMLVideoElement, signal: AbortSignal) {
  const notice = document.createElement('div');
  notice.textContent =
    'Darb resumed your session. Press Play on the video to continue.';
  notice.style.cssText =
    'position:fixed;bottom:24px;right:24px;z-index:2147483647;max-width:320px;padding:16px;border-radius:12px;background:#f97316;color:white;font:14px sans-serif;';
  document.body.append(notice);
  const remove = () => notice.remove();
  video.addEventListener('play', remove, { once: true, signal });
  signal.addEventListener('abort', remove, { once: true });
}
