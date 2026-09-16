import { browser } from 'wxt/browser';
import type { ContentActionResponse, SessionCompletionResponse } from '@/lib/messaging/messages';
import { getSettings } from '@/lib/storage/repository';
import { getVideoIdFromUrl, waitForVideoElement } from '@/lib/youtube/metadata';
import { hasReachedSessionEnd } from '@/lib/youtube/playback';
import { removeCompletionOverlay, showCompletionOverlay } from '@/lib/youtube/completion-overlay';

let controller: AbortController | null = null;

interface RestoreSessionTrackingOptions { attemptPlayback?: boolean; activationId?: string; }

export async function restoreSessionTracking(options: RestoreSessionTrackingOptions = {}): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  removeCompletionOverlay();
  const response = await browser.runtime.sendMessage<{ type: 'GET_TAB_ACTIVATION' }, ContentActionResponse>({ type: 'GET_TAB_ACTIVATION' });
  if (signal.aborted || !response?.ok || !response.playback) return;
  const playback = response.playback;
  if (options.activationId && playback.activationId !== options.activationId) return;
  if (playback.videoId !== getVideoIdFromUrl(window.location.href)) return;

  const video = await waitForVideoElement();
  if (signal.aborted) return;
  await waitForSessionVideo(video, playback.startSeconds, signal);
  if (signal.aborted) return;
  const settings = await getSettings();
  const autoPause = settings.autoPauseAtSessionEnd;
  const autoComplete = settings.autoMarkSessionsComplete;
  const showOverlay = settings.showCompletionOverlay;
  let terminal = false;
  let sequence = playback.reportSequence;
  let lastSavedAt = 0;

  const isAd = () => document.querySelector('#movie_player')?.classList.contains('ad-showing') === true;
  const detach = () => {
    video.removeEventListener('timeupdate', progress);
    video.removeEventListener('seeked', progress);
    video.removeEventListener('pause', forceSave);
    video.removeEventListener('ended', ended);
    document.removeEventListener('visibilitychange', visibility);
    window.clearInterval(timer);
  };
  const report = (force = false) => {
    if (terminal || signal.aborted || isAd()) return;
    const now = Date.now(); if (!force && now - lastSavedAt < 5000) return;
    lastSavedAt = now; sequence += 1;
    const seconds = Math.max(playback.startSeconds, Math.min(video.currentTime, playback.endSeconds));
    void browser.runtime.sendMessage({ type: 'REPORT_SESSION_POSITION', courseId: playback.courseId, sessionId: playback.sessionId, activationId: playback.activationId, seconds, sequence });
  };
  const finish = async () => {
    if (terminal || signal.aborted || isAd()) return;
    terminal = true; detach();
    if (autoPause) video.pause();
    if (!autoComplete) {
      // Persist just before the boundary so a later Continue has useful behavior.
      sequence += 1;
      await browser.runtime.sendMessage({ type: 'REPORT_SESSION_POSITION', courseId: playback.courseId, sessionId: playback.sessionId, activationId: playback.activationId, seconds: Math.max(playback.startSeconds, playback.endSeconds - 1), sequence });
      await browser.runtime.sendMessage({ type: 'RELEASE_SESSION', activationId: playback.activationId });
      return;
    }
    const completion = await browser.runtime.sendMessage<{ type: 'SESSION_REACHED_END'; courseId: string; sessionId: string; activationId: string }, SessionCompletionResponse>({ type: 'SESSION_REACHED_END', courseId: playback.courseId, sessionId: playback.sessionId, activationId: playback.activationId });
    if (completion?.ok && showOverlay) showCompletionOverlay(completion);
  };
  const progress = () => {
    if (terminal || signal.aborted || isAd() || getVideoIdFromUrl(window.location.href) !== playback.videoId) return;
    if (video.currentTime < playback.startSeconds - 2) { video.currentTime = playback.startSeconds; return; }
    report();
    if (hasReachedSessionEnd(video.currentTime, playback.endSeconds)) void finish();
  };
  const forceSave = () => report(true);
  const ended = () => { if (!isAd() && hasReachedSessionEnd(video.currentTime, playback.endSeconds)) void finish(); };
  const visibility = () => { if (document.visibilityState === 'hidden') forceSave(); };
  const target = Math.max(playback.startSeconds, Math.min(playback.lastKnownSeconds, playback.endSeconds - 1));
  if (Math.abs(video.currentTime - target) > 0.25) video.currentTime = target;
  video.addEventListener('timeupdate', progress);
  video.addEventListener('seeked', progress);
  video.addEventListener('pause', forceSave);
  video.addEventListener('ended', ended);
  document.addEventListener('visibilitychange', visibility);
  const timer = window.setInterval(progress, 500);
  signal.addEventListener('abort', detach, { once: true });
  if (options.attemptPlayback) { try { await video.play(); } catch { /* Browser autoplay policy requires a user press. */ } }
}

export async function stopSessionTracking(): Promise<void> {
  controller?.abort(); controller = null;
  const active = await browser.runtime.sendMessage<{ type: 'GET_TAB_ACTIVATION' }, ContentActionResponse>({ type: 'GET_TAB_ACTIVATION' });
  if (active?.ok && active.playback) await browser.runtime.sendMessage({ type: 'RELEASE_SESSION', activationId: active.playback.activationId });
}

async function waitForSessionVideo(video: HTMLVideoElement, startSeconds: number, signal: AbortSignal, timeoutMilliseconds = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline && !signal.aborted) {
    if (document.querySelector('#movie_player.ytp-error')) throw new Error('The YouTube player is showing an error. Refresh the tab and try again.');
    const ad = document.querySelector('#movie_player')?.classList.contains('ad-showing');
    if (!ad && video.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(video.duration) && video.duration > startSeconds) return;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  if (!signal.aborted) throw new Error('YouTube did not finish loading this part of the video. Refresh the tab and try again.');
}
