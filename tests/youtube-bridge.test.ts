import { createPlaylist, initialLearningState } from '@/lib/learning/model';
import { readLearning, writeLearning } from '@/lib/learning/repository';
import { invokeListener } from './runtime-listener';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { browser, type Browser } from 'wxt/browser';
import background from '@/entrypoints/background';
import { startVideoBridge } from '@/lib/video/content-bridge';
import { stopSessionTracking } from '@/lib/video/session-tracker';
import { createCourse } from '@/lib/utils/courses';
import {
  clearActivePlayback,
  courseRepository,
  getActivePlayback,
} from '@/lib/storage/repository';

type Handler = (
  message: unknown,
  sender: Browser.runtime.MessageSender,
) => Promise<unknown>;
const watch = 'https://www.youtube.com/watch?v=qv9PWcc7FJY';
let dom: JSDOM;
let player: HTMLVideoElement;
let backgroundHandler: Handler;
let contentHandler: Handler;
const sender = {
  url: 'https://www.youtube.com/',
  frameId: 0,
  tab: { id: 7 },
} as Browser.runtime.MessageSender;
const ui = () => ({ url: browser.runtime.getURL('/popup.html') });
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.useFakeTimers();
  await browser.storage.local.clear();
  dom = new JSDOM(
    '<title>Standalone course - YouTube</title><div id="movie_player"><video class="html5-main-video"></video></div>',
    { url: watch },
  );
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    AbortController: dom.window.AbortController,
  }))
    vi.stubGlobal(key, value);
  player = document.querySelector('video')!;
  Object.defineProperty(player, 'duration', {
    configurable: true,
    value: 3600,
  });
  Object.defineProperty(player, 'readyState', { configurable: true, value: 4 });
  player.play = vi.fn(async () => undefined);
  player.pause = vi.fn();
  const listeners: Handler[] = [];
  vi.spyOn(browser.runtime.onMessage, 'addListener').mockImplementation(
    (listener) => {
      listeners.push((message, sender) =>
        invokeListener(listener, message, sender),
      );
    },
  );
  vi.spyOn(browser.scripting, 'getRegisteredContentScripts').mockImplementation(
    async () => [],
  );
  vi.spyOn(browser.permissions, 'contains').mockImplementation(
    async () => false,
  );
  vi.spyOn(browser.tabs, 'get').mockImplementation(async () => ({
    id: 7,
    url: window.location.href,
    status: 'complete',
  }));
  vi.spyOn(browser.tabs, 'update').mockImplementation(async () => ({
    id: 7,
    url: watch,
    status: 'complete',
  }));
  vi.spyOn(browser.permissions.onAdded, 'addListener').mockImplementation(
    () => undefined,
  );
  vi.spyOn(browser.permissions.onRemoved, 'addListener').mockImplementation(
    () => undefined,
  );
  background.main();
  backgroundHandler = listeners[0]!;
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async (message) =>
    backgroundHandler(message, sender),
  );
  startVideoBridge();
  contentHandler = listeners[1]!;
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(
    async (_id, message) => contentHandler(message, ui()),
  );
  // Let the bridge's initial recovery (no active session yet) settle.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
});
afterEach(async () => {
  window.dispatchEvent(new dom.window.Event('pagehide'));
  await stopSessionTracking();
  Reflect.deleteProperty(globalThis, '__darbVideoBridge');
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  dom.window.close();
});
it('reads a standalone video through the real bridge and background access check after home-to-watch navigation', async () => {
  const result = await contentHandler({ type: 'GET_VIDEO_METADATA' }, ui());
  expect(result).toMatchObject({
    ok: true,
    video: {
      platform: 'youtube',
      videoId: 'qv9PWcc7FJY',
      title: 'Standalone course',
      durationSeconds: 3600,
    },
  });
});
it('creates, activates and tracks the standalone course using the real message chain', async () => {
  const course = createCourse(
    {
      platform: 'youtube',
      videoId: 'qv9PWcc7FJY',
      videoUrl: watch,
      title: 'Standalone course',
      durationSeconds: 3600,
    },
    15,
  );
  expect(
    await backgroundHandler({ type: 'CREATE_COURSE', course }, ui()),
  ).toMatchObject({ ok: true });
  expect(
    await backgroundHandler(
      { type: 'OPEN_SESSION', courseId: course.id, sourceTabId: 7 },
      ui(),
    ),
  ).toMatchObject({ ok: true });
  expect(await getActivePlayback()).toMatchObject({
    courseId: course.id,
    tabId: 7,
  });
  expect(player.play).toHaveBeenCalled();
  player.currentTime = 150;
  player.dispatchEvent(new dom.window.Event('timeupdate'));
  await vi.advanceTimersByTimeAsync(1);
  expect(
    (await courseRepository.getCourse(course.id))?.sessions[0]!.resumeSeconds,
  ).toBe(150);
});
it('preserves the actual access rejection instead of falsely reporting disabled permissions', async () => {
  vi.spyOn(browser.tabs, 'get').mockImplementation(async () => ({
    id: 7,
    url: 'https://example.com/',
  }));
  expect(
    await contentHandler({ type: 'GET_VIDEO_METADATA' }, ui()),
  ).toMatchObject({
    ok: false,
    error: 'This page cannot perform that action.',
  });
});

it('prefers the mounted watch title and ignores stale social metadata from an earlier video', async () => {
  const old = document.createElement('meta');
  old.setAttribute('property', 'og:title');
  old.content = 'Old video';
  document.head.append(old);
  const thumbnail = document.createElement('meta');
  thumbnail.setAttribute('property', 'og:image');
  thumbnail.content = 'https://example.com/old.jpg';
  document.head.append(thumbnail);
  const watchPage = document.createElement('ytd-watch-flexy');
  watchPage.setAttribute('video-id', 'qv9PWcc7FJY');
  const metadata = document.createElement('ytd-watch-metadata');
  const heading = document.createElement('h1');
  const text = document.createElement('yt-formatted-string');
  text.textContent = 'Current video title';
  heading.append(text);
  metadata.append(heading);
  watchPage.append(metadata);
  document.body.append(watchPage);
  const result = await contentHandler({ type: 'GET_VIDEO_METADATA' }, ui());
  expect(result).toMatchObject({
    ok: true,
    video: {
      title: 'Current video title',
      thumbnailUrl: 'https://i.ytimg.com/vi/qv9PWcc7FJY/hqdefault.jpg',
    },
  });
});
it('retries a failed final-session completion and persists the completed course', async () => {
  const course = createCourse(
    {
      platform: 'youtube',
      videoId: 'qv9PWcc7FJY',
      videoUrl: watch,
      title: 'Short course',
      durationSeconds: 3600,
    },
    60,
  );
  await backgroundHandler({ type: 'CREATE_COURSE', course }, ui());
  await backgroundHandler(
    { type: 'OPEN_SESSION', courseId: course.id, sourceTabId: 7 },
    ui(),
  );
  let fails = true;
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async (raw) => {
    if (
      (raw as unknown as { type: string }).type === 'SESSION_REACHED_END' &&
      fails
    ) {
      fails = false;
      return { ok: false, error: 'Transient failure' };
    }
    return backgroundHandler(raw, sender);
  });
  player.currentTime = 3600;
  player.dispatchEvent(new dom.window.Event('ended'));
  await vi.advanceTimersByTimeAsync(1100);
  expect((await courseRepository.getCourse(course.id))?.completed).toBe(true);
});

it('saves completion and automatically opens the next playlist video in the same tab, then stops at the last video', async () => {
  const first = createCourse(
    {
      platform: 'youtube',
      videoId: 'qv9PWcc7FJY',
      videoUrl: watch,
      title: 'First course',
      durationSeconds: 3600,
    },
    60,
  );
  const second = createCourse(
    {
      platform: 'youtube',
      videoId: 'lmnopqrstuv',
      videoUrl: 'https://www.youtube.com/watch?v=lmnopqrstuv',
      title: 'Second course',
      durationSeconds: 3600,
    },
    60,
  );
  await courseRepository.saveCourse(first);
  await courseRepository.saveCourse(second);
  const state = initialLearningState();
  const playlist = createPlaylist('Path', [first, second]);
  state.playlists = [playlist];
  await writeLearning(state);
  vi.spyOn(browser.tabs, 'update').mockImplementation(async (_id, changes) => {
    if (changes.url) dom.reconfigure({ url: changes.url });
    return { id: 7, url: window.location.href, status: 'complete' };
  });
  const create = vi.spyOn(browser.tabs, 'create');
  await backgroundHandler(
    { type: 'OPEN_SESSION', courseId: first.id, sourceTabId: 7 },
    ui(),
  );
  expect((await getActivePlayback())?.playlistId).toBe(playlist.id);
  await vi.advanceTimersByTimeAsync(1000);
  const controls = document.getElementById(
    'darb-playlist-controls',
  )!.shadowRoot!;
  expect(controls.textContent).toContain('Up next: Second course');
  expect(controls.querySelector('.next')?.textContent).toContain('Next video');
  player.currentTime = 3600;
  player.dispatchEvent(new dom.window.Event('ended'));
  await vi.advanceTimersByTimeAsync(1);
  expect((await courseRepository.getCourse(first.id))?.completed).toBe(true);
  expect(document.getElementById('coursora-completion-overlay')).toBeNull();
  expect(await getActivePlayback()).toMatchObject({
    courseId: second.id,
    tabId: 7,
    playlistId: playlist.id,
  });
  expect((await readLearning()).playlists[0]?.cursorId).toBe(second.videoId);
  expect(create).not.toHaveBeenCalled();
  // Let navigation recovery settle before finishing the second video.
  await vi.advanceTimersByTimeAsync(1100);
  player.currentTime = 3600;
  player.dispatchEvent(new dom.window.Event('ended'));
  await vi.advanceTimersByTimeAsync(1100);
  expect((await courseRepository.getCourse(second.id))?.completed).toBe(true);
  expect(
    document
      .getElementById('coursora-completion-overlay')!
      .shadowRoot!.querySelector('h2')?.textContent,
  ).toBe('Playlist completed!');
  const completed = document.getElementById(
    'darb-playlist-controls',
  )!.shadowRoot!;
  expect(completed.textContent).toContain('Every video is completed.');
  expect(completed.querySelector('.next')).toBeNull();
});

it('allows the visible Next video control before completion without falsely completing skipped videos', async () => {
  const first = createCourse(
    {
      videoId: 'qv9PWcc7FJY',
      videoUrl: watch,
      title: 'First',
      durationSeconds: 3600,
    },
    60,
  );
  const second = createCourse(
    {
      videoId: 'lmnopqrstuv',
      videoUrl: 'https://www.youtube.com/watch?v=lmnopqrstuv',
      title: 'Second',
      durationSeconds: 3600,
    },
    60,
  );
  await courseRepository.saveCourse(first);
  await courseRepository.saveCourse(second);
  const state = initialLearningState();
  state.playlists = [createPlaylist('Path', [first, second])];
  await writeLearning(state);
  vi.spyOn(browser.tabs, 'update').mockImplementation(async (_id, changes) => {
    if (changes.url) dom.reconfigure({ url: changes.url });
    return { id: 7, url: window.location.href, status: 'complete' };
  });
  await vi.advanceTimersByTimeAsync(1100);
  const next = document
    .getElementById('darb-playlist-controls')!
    .shadowRoot!.querySelector<HTMLButtonElement>('.next')!;
  expect(next).not.toBeNull();
  next.click();
  await vi.advanceTimersByTimeAsync(10);
  expect((await getActivePlayback())?.courseId).toBe(second.id);
  expect((await courseRepository.getCourse(first.id))?.completed).toBe(false);
  expect((await readLearning()).playlists[0]?.cursorId).toBe(second.videoId);
  expect(
    await backgroundHandler(
      {
        type: 'DARB_NEXT_PLAYLIST',
        playlistId: state.playlists[0]!.id,
        videoId: first.videoId,
      },
      sender,
    ),
  ).toMatchObject({ ok: false });
});

async function preparedPlaylist(minutes = 60) {
  const first = createCourse(
    {
      videoId: 'qv9PWcc7FJY',
      videoUrl: watch,
      title: 'First',
      durationSeconds: 3600,
    },
    minutes,
  );
  const second = createCourse(
    {
      videoId: 'lmnopqrstuv',
      videoUrl: 'https://www.youtube.com/watch?v=lmnopqrstuv',
      title: 'Second',
      durationSeconds: 3600,
    },
    60,
  );
  await courseRepository.saveCourse(first);
  await courseRepository.saveCourse(second);
  const state = initialLearningState();
  const playlist = createPlaylist('Path', [first, second]);
  state.playlists = [playlist];
  await writeLearning(state);
  vi.spyOn(browser.tabs, 'update').mockImplementation(async (_id, changes) => {
    if (changes.url) dom.reconfigure({ url: changes.url });
    return { id: 7, url: window.location.href, status: 'complete' };
  });
  await backgroundHandler(
    { type: 'OPEN_SESSION', courseId: first.id, sourceTabId: 7 },
    ui(),
  );
  await vi.advanceTimersByTimeAsync(1000);
  return { first, second, playlist };
}
it('keeps session breaks within the current video instead of skipping to the next playlist item', async () => {
  const { first } = await preparedPlaylist(30);
  player.currentTime = 1800;
  player.dispatchEvent(new dom.window.Event('timeupdate'));
  await vi.advanceTimersByTimeAsync(1);
  expect(window.location.href).toBe(watch);
  expect(
    (await courseRepository.getCourse(first.id))?.sessions[0]?.completed,
  ).toBe(true);
  const overlay = document.getElementById(
    'coursora-completion-overlay',
  )!.shadowRoot!;
  expect(overlay.querySelector('.next')?.textContent).toBe(
    'Continue to next session',
  );
});
it('retains saved completion and shows a manual retry when automatic next-video navigation fails', async () => {
  const { first, second } = await preparedPlaylist();
  let attempts = 0;
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async (raw) => {
    if (
      (raw as unknown as { type: string }).type === 'DARB_CONTINUE_PLAYLIST' &&
      ++attempts === 1
    )
      return { ok: false, error: 'Temporary navigation failure' };
    return backgroundHandler(raw, sender);
  });
  player.currentTime = 3600;
  player.dispatchEvent(new dom.window.Event('ended'));
  await vi.advanceTimersByTimeAsync(1);
  expect((await courseRepository.getCourse(first.id))?.completed).toBe(true);
  const overlay = document.getElementById(
    'coursora-completion-overlay',
  )!.shadowRoot!;
  expect(overlay.querySelector('.error')?.textContent).toContain(
    'Temporary navigation failure',
  );
  overlay.querySelector<HTMLButtonElement>('.next')!.click();
  await vi.advanceTimersByTimeAsync(1);
  expect((await getActivePlayback())?.courseId).toBe(second.id);
  expect(attempts).toBe(2);
});

it('counts and saves a naturally ended playlist video with no active course tracker, and auto-advances once', async () => {
  const { first, second, playlist } = await preparedPlaylist();
  await stopSessionTracking();
  await clearActivePlayback();
  await courseRepository.deleteCourse(first.id);
  Object.defineProperty(player, 'ended', {
    configurable: true,
    get: () => player.currentTime >= player.duration,
  });
  const navigate = vi.mocked(browser.tabs.update);
  navigate.mockClear();
  player.currentTime = 3600;
  player.dispatchEvent(new dom.window.Event('ended'));
  player.dispatchEvent(new dom.window.Event('ended'));
  await vi.advanceTimersByTimeAsync(1100);
  const saved = (await readLearning()).playlists.find(
    (p) => p.id === playlist.id,
  )!;
  expect(saved.completedVideoIds).toEqual([first.videoId]);
  expect(saved.cursorId).toBe(second.videoId);
  expect((await getActivePlayback())?.courseId).toBe(second.id);
  expect(
    navigate.mock.calls.filter(([, changes]) => !!changes.url),
  ).toHaveLength(1);
  expect(
    document.getElementById('darb-playlist-controls')!.shadowRoot!.textContent,
  ).toContain('1 completed');
});
it('deduplicates natural video-end and session-end completion, and shows 2 completed at the playlist end', async () => {
  const { first, second, playlist } = await preparedPlaylist();
  Object.defineProperty(player, 'ended', {
    configurable: true,
    get: () => player.currentTime >= player.duration,
  });
  const navigate = vi.mocked(browser.tabs.update);
  navigate.mockClear();
  player.currentTime = 3600;
  player.dispatchEvent(new dom.window.Event('ended'));
  await vi.advanceTimersByTimeAsync(1100);
  expect((await readLearning()).playlists[0]!.completedVideoIds).toEqual([
    first.videoId,
  ]);
  expect(
    navigate.mock.calls.filter(([, changes]) => !!changes.url),
  ).toHaveLength(1);
  player.currentTime = 3600;
  player.dispatchEvent(new dom.window.Event('ended'));
  await vi.advanceTimersByTimeAsync(1100);
  const saved = (await readLearning()).playlists.find(
    (p) => p.id === playlist.id,
  )!;
  expect(saved.completedVideoIds).toEqual([first.videoId, second.videoId]);
  const text = document.getElementById('darb-playlist-controls')!.shadowRoot!
    .textContent;
  expect(text).toContain('2 completed');
  expect(text).toContain('Playlist completed');
  expect(
    navigate.mock.calls.filter(([, changes]) => !!changes.url),
  ).toHaveLength(1);
});
it('rejects a premature completion claim and keeps Next video from marking skipped items completed', async () => {
  const { first, playlist } = await preparedPlaylist();
  player.currentTime = 400;
  expect(
    await backgroundHandler(
      {
        type: 'DARB_PLAYLIST_VIDEO_ENDED',
        playlistId: playlist.id,
        videoId: first.videoId,
      },
      sender,
    ),
  ).toMatchObject({ ok: false });
  expect((await readLearning()).playlists[0]!.completedVideoIds).toEqual([]);
  expect(
    await backgroundHandler(
      {
        type: 'DARB_PLAYLIST_VIDEO_ENDED',
        playlistId: playlist.id,
        videoId: first.videoId,
      },
      ui(),
    ),
  ).toMatchObject({ ok: false });
});
