import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import * as repository from '@/lib/storage/repository';
import { DEFAULT_SETTINGS } from '@/lib/settings/defaults';
import {
  restoreSessionTracking,
  stopSessionTracking,
} from '@/lib/video/session-tracker';
import { createCourse } from '@/lib/utils/courses';
import type { ActivePlayback } from '@/types/video';
let dom: JSDOM;
let video: HTMLVideoElement;
let activation: ActivePlayback;
let reports: Record<string, unknown>[];
let finishCount: number;
let rejectPlay = false;
const course = createCourse(
  {
    platform: 'x',
    videoId: '123',
    videoUrl: 'https://x.com/u/status/123',
    title: 'Lecture',
    durationSeconds: 1800,
  },
  15,
);

beforeEach(async () => {
  vi.restoreAllMocks();
  await browser.storage.local.clear();
  dom = new JSDOM(
    '<article data-testid="tweet"><a href="/u/status/123"><time>Today</time></a><video></video></article>',
    { url: 'https://x.com/u/status/123' },
  );
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('AbortController', dom.window.AbortController);
  video = dom.window.document.querySelector('video')!;
  video.getBoundingClientRect = () => ({ width: 640, height: 360 }) as DOMRect;
  Object.defineProperty(video, 'duration', { configurable: true, value: 1800 });
  Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
  video.play = vi.fn(async () => {
    if (rejectPlay) throw new Error('Autoplay blocked');
  });
  video.pause = vi.fn();
  rejectPlay = false;
  activation = {
    platform: 'x',
    activationId: 'active-1',
    tabId: 1,
    status: 'active',
    courseId: course.id,
    sessionId: course.sessions[0]!.id,
    videoId: '123',
    startSeconds: 0,
    endSeconds: 900,
    lastKnownSeconds: 345,
    reportSequence: 0,
    startedAt: '2026-10-12T00:00:00.000Z',
  };
  reports = [];
  finishCount = 0;
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(
    async (message: unknown) => {
      const input = message as Record<string, unknown>;
      if (input.type === 'GET_TAB_ACTIVATION')
        return { ok: true, playback: activation };
      if (input.type === 'REPORT_SESSION_POSITION') {
        reports.push(input);
        return { ok: true };
      }
      if (input.type === 'SESSION_REACHED_END') {
        finishCount++;
        return {
          ok: true,
          course,
          nextSession: course.sessions[1],
          progress: { completedSessions: 1, totalSessions: 2, percentage: 50 },
        };
      }
      return { ok: true };
    },
  );
});
afterEach(async () => {
  await stopSessionTracking();
  dom.window.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function event(name: string) {
  video.dispatchEvent(new dom.window.Event(name));
}

describe('shared session playback', () => {
  it('does not attach controls when a pending restore is cancelled', async () => {
    let resolveSettings!: (value: typeof DEFAULT_SETTINGS) => void;
    const settings = vi.spyOn(repository, 'getSettings').mockImplementationOnce(() => new Promise(resolve => { resolveSettings = resolve; }));
    const pending = restoreSessionTracking({ attemptPlayback: true });
    await vi.waitFor(() => expect(settings).toHaveBeenCalled());
    await stopSessionTracking();
    resolveSettings(DEFAULT_SETTINGS);
    await pending;
    expect(video.play).not.toHaveBeenCalled();
    video.currentTime = 900;
    event('timeupdate');
    expect(finishCount).toBe(0);
    expect(reports).toEqual([]);
  });

  it('resumes the saved position and saves on pause', async () => {
    await restoreSessionTracking({
      attemptPlayback: true,
      activationId: activation.activationId,
    });
    expect(video.currentTime).toBe(345);
    expect(video.play).toHaveBeenCalledOnce();
    video.currentTime = 400;
    event('pause');
    await vi.waitFor(() => expect(reports.at(-1)?.seconds).toBe(400));
  });
  it('completes exactly once and pauses at the boundary', async () => {
    await restoreSessionTracking({ activationId: activation.activationId });
    video.currentTime = 900;
    event('timeupdate');
    event('ended');
    event('timeupdate');
    await vi.waitFor(() => expect(finishCount).toBe(1));
    expect(video.pause).toHaveBeenCalledOnce();
    expect(
      dom.window.document.getElementById('coursora-completion-overlay'),
    ).not.toBeNull();
  });
  it('never reports a different post after navigation', async () => {
    await restoreSessionTracking();
    reports.length = 0;
    dom.window.history.pushState({}, '', '/u/status/456');
    video.currentTime = 800;
    event('timeupdate');
    event('pause');
    expect(reports).toEqual([]);
    expect(finishCount).toBe(0);
  });
  it('detaches a replaced player', async () => {
    await restoreSessionTracking();
    reports.length = 0;
    video.remove();
    video.currentTime = 900;
    event('timeupdate');
    event('ended');
    expect(reports).toEqual([]);
    expect(finishCount).toBe(0);
  });
  it('rejects obsolete activation requests', async () => {
    await expect(
      restoreSessionTracking({ activationId: 'obsolete' }),
    ).rejects.toThrow('no longer active');
    expect(reports).toEqual([]);
  });
  it('retains the resume position and shows a Play notice when autoplay is blocked', async () => {
    rejectPlay = true;
    await restoreSessionTracking({ attemptPlayback: true });
    expect(video.currentTime).toBe(345);
    expect(dom.window.document.body.textContent).toContain('Press Play');
    event('play');
    expect(dom.window.document.body.textContent).not.toContain('Press Play');
  });
  it('rejects changed video duration instead of marking a wrong session', async () => {
    Object.defineProperty(video, 'duration', {
      configurable: true,
      value: 100,
    });
    await expect(
      restoreSessionTracking({ activationId: activation.activationId }),
    ).rejects.toThrow('duration changed');
    expect(finishCount).toBe(0);
  });
  it('cleans up listeners when stopped, without subsequent reports', async () => {
    await restoreSessionTracking();
    await stopSessionTracking();
    reports.length = 0;
    video.currentTime = 900;
    event('timeupdate');
    event('ended');
    event('pause');
    expect(reports).toEqual([]);
    expect(finishCount).toBe(0);
  });
});
