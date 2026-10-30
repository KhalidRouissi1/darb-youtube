import { invokeListener } from './runtime-listener';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser, type Browser } from 'wxt/browser';
import background from '@/entrypoints/background';
import {
  courseRepository,
  getActivePlayback,
  saveActivePlayback,
  saveSettings,
  getSettings,
} from '@/lib/storage/repository';
import { createCourse } from '@/lib/utils/courses';
import type { Course } from '@/types/course';

type Handler = (
  message: unknown,
  sender: Browser.runtime.MessageSender,
) => Promise<unknown>;
let handle: Handler;
let notificationClick: (id: string) => void;
let course: Course;
const page = {
  tab: { id: 7 },
  frameId: 0,
  url: 'https://x.com/u/status/123',
} as Browser.runtime.MessageSender;
function ui(): Browser.runtime.MessageSender {
  return { url: browser.runtime.getURL('/dashboard.html') };
}
beforeEach(async () => {
  vi.restoreAllMocks();
  await browser.storage.local.clear();
  vi.spyOn(browser.runtime.onMessage, 'addListener').mockImplementation(
    (listener) => {
      handle = (message, sender) => invokeListener(listener, message, sender);
    },
  );
  vi.spyOn(browser.permissions, 'contains').mockImplementation(
    async () => true,
  );
  vi.spyOn(browser.scripting, 'getRegisteredContentScripts').mockImplementation(
    async () => [
      { id: 'darb-x', matches: ['https://x.com/*'] },
      { id: 'darb-facebook', matches: ['https://www.facebook.com/*'] },
    ],
  );
  vi.spyOn(browser.tabs, 'get').mockImplementation(async () => ({
    id: 7,
    status: 'complete',
    url: page.url,
  }));
  vi.spyOn(browser.tabs, 'update').mockImplementation(async () => ({
    id: 7,
    status: 'complete',
    url: page.url,
  }));
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async () => ({
    ok: true,
  }));
  vi.spyOn(browser.permissions.onAdded, 'addListener').mockImplementation(
    () => undefined,
  );
  vi.spyOn(browser.permissions.onRemoved, 'addListener').mockImplementation(
    () => undefined,
  );
  vi.spyOn(browser.notifications.onClicked, 'addListener').mockImplementation(
    (listener) => {
      notificationClick = listener;
    },
  );
  background.main();
  course = createCourse(
    {
      platform: 'x',
      videoId: '123',
      videoUrl: 'https://x.com/u/status/123',
      title: 'Lecture',
      durationSeconds: 7200,
    },
    15,
  );
  course.currentSessionIndex = 7;
  course.sessions[7]!.resumeSeconds = 6400;
  await courseRepository.saveCourse(course);
});
async function activate() {
  await saveActivePlayback({
    platform: 'x',
    activationId: 'a',
    tabId: 7,
    status: 'active',
    courseId: course.id,
    sessionId: course.sessions[7]!.id,
    videoId: '123',
    startSeconds: 6300,
    endSeconds: 7200,
    lastKnownSeconds: 6400,
    reportSequence: 10,
    startedAt: '2026-10-12T00:00:00.000Z',
  });
}
describe('platform background ownership and continuation', () => {
  it('continues session eight in the same tab without URL navigation', async () => {
    const create = vi.spyOn(browser.tabs, 'create');
    const result = await handle(
      {
        type: 'CONTINUE_SESSION_IN_TAB',
        courseId: course.id,
        sessionId: course.sessions[7]!.id,
      },
      page,
    );
    expect(result).toEqual({ ok: true });
    expect(create).not.toHaveBeenCalled();
    expect(browser.tabs.update).toHaveBeenCalledWith(7, { active: true });
    expect(await getActivePlayback()).toMatchObject({
      tabId: 7,
      platform: 'x',
      sessionId: course.sessions[7]!.id,
      lastKnownSeconds: 6400,
    });
  });
  it('reuses the owned matching tab when continuing from the dashboard', async () => {
    await activate();
    const create = vi.spyOn(browser.tabs, 'create');
    expect(
      await handle({ type: 'OPEN_SESSION', courseId: course.id }, ui()),
    ).toEqual({ ok: true });
    expect(create).not.toHaveBeenCalled();
    expect((await getActivePlayback())?.lastKnownSeconds).toBe(6400);
  });
  it('ignores old sequences and stale activation IDs', async () => {
    await activate();
    const report = {
      type: 'REPORT_SESSION_POSITION',
      courseId: course.id,
      sessionId: course.sessions[7]!.id,
      activationId: 'a',
      seconds: 6500,
      sequence: 9,
    };
    await handle(report, page);
    await handle({ ...report, sequence: 11, activationId: 'obsolete' }, page);
    expect(
      (await courseRepository.getCourse(course.id))?.sessions[7]!.resumeSeconds,
    ).toBe(6400);
    await handle({ ...report, sequence: 11 }, page);
    expect(
      (await courseRepository.getCourse(course.id))?.sessions[7]!.resumeSeconds,
    ).toBe(6500);
  });
  it('rejects reports from the wrong tab, origin, or frame', async () => {
    await activate();
    const report = {
      type: 'REPORT_SESSION_POSITION',
      courseId: course.id,
      sessionId: course.sessions[7]!.id,
      activationId: 'a',
      seconds: 6600,
      sequence: 11,
    };
    await handle(report, {
      ...page,
      tab: { id: 8 },
    } as Browser.runtime.MessageSender);
    expect(
      await handle(report, { ...page, url: 'https://example.com/' }),
    ).toMatchObject({ ok: false });
    expect(await handle(report, { ...page, frameId: 1 })).toMatchObject({
      ok: false,
    });
    expect(
      (await courseRepository.getCourse(course.id))?.sessions[7]!.resumeSeconds,
    ).toBe(6400);
  });
  it('prevents website senders from deleting courses', async () => {
    expect(
      await handle({ type: 'DELETE_COURSE', courseId: course.id }, page),
    ).toMatchObject({ ok: false });
    expect(await courseRepository.getCourse(course.id)).not.toBeNull();
  });
  it('clears ownership if activation fails', async () => {
    vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async () => ({
      ok: false,
      error: 'Video unavailable',
    }));
    const result = await handle(
      { type: 'OPEN_SESSION', courseId: course.id, sourceTabId: 7 },
      ui(),
    );
    expect(result).toMatchObject({ ok: false });
    expect(await getActivePlayback()).toBeNull();
  });
});

describe('learning message boundaries', () => {
  it('returns only the selection to a YouTube content script', async () => {
    const content = {
      url: 'https://www.youtube.com/results?search_query=course',
      frameId: 0,
      tab: { id: 7 },
    } as Browser.runtime.MessageSender;
    const result = (await handle(
      { type: 'DARB_LEARNING', action: { op: 'read' } },
      content,
    )) as { ok: boolean; data: Record<string, unknown> };
    expect(result.ok).toBe(true);
    expect(Object.keys(result.data)).toEqual(['selection']);
    expect(result.data).not.toHaveProperty('connection');
  });
  it('rejects assistant grants from website frames', async () => {
    const result = await handle(
      {
        type: 'DARB_LEARNING',
        action: { op: 'connection.update', allowDrafts: true },
      },
      page,
    );
    expect(result).toMatchObject({ ok: false });
  });
  it('rejects playlist writes from YouTube and subframes', async () => {
    const content = {
      url: 'https://www.youtube.com/',
      frameId: 0,
      tab: { id: 7 },
    } as Browser.runtime.MessageSender;
    expect(
      await handle(
        { type: 'DARB_LEARNING', action: { op: 'selection.save' } },
        content,
      ),
    ).toMatchObject({ ok: false });
    expect(
      await handle(
        { type: 'DARB_LEARNING', action: { op: 'read' } },
        { ...content, frameId: 1 },
      ),
    ).toMatchObject({ ok: false });
  });
});

describe('workspace boundaries and timestamp links', () => {
  it('does not expose notes or organization to content scripts', async () => {
    expect(
      await handle({ type: 'DARB_WORKSPACE', action: { op: 'read' } }, page),
    ).toMatchObject({ ok: false });
    const content = {
      ...page,
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
    };
    expect(
      await handle({ type: 'DARB_WORKSPACE', action: { op: 'read' } }, content),
    ).toMatchObject({ ok: false });
    expect(
      await handle({ type: 'DARB_WORKSPACE', action: { op: 'read' } }, ui()),
    ).toMatchObject({ ok: true, data: { notes: [], folders: [] } });
  });
  it('opens a timestamp in the owned tab without resetting checkpoints or completing sessions', async () => {
    await activate();
    const before = await courseRepository.getCourse(course.id);
    expect(
      await handle(
        { type: 'DARB_OPEN_TIMESTAMP', courseId: course.id, seconds: 6550 },
        ui(),
      ),
    ).toMatchObject({ ok: true });
    expect((await getActivePlayback())?.lastKnownSeconds).toBe(6550);
    expect((await courseRepository.getCourse(course.id))?.sessions).toEqual(
      before?.sessions,
    );
    expect(browser.tabs.update).toHaveBeenCalledWith(7, { active: true });
  });
  it('rejects invalid timestamps and website playback requests', async () => {
    expect(
      await handle(
        { type: 'DARB_OPEN_TIMESTAMP', courseId: course.id, seconds: 50 },
        page,
      ),
    ).toMatchObject({ ok: false });
    expect(
      await handle(
        { type: 'DARB_OPEN_TIMESTAMP', courseId: course.id, seconds: 9000 },
        ui(),
      ),
    ).toMatchObject({ ok: false });
    expect(
      await handle(
        { type: 'DARB_OPEN_TIMESTAMP', courseId: course.id, seconds: -1 },
        ui(),
      ),
    ).toMatchObject({ ok: false });
  });
});

describe('YouTube navigation access', () => {
  const watch = 'https://www.youtube.com/watch?v=qv9PWcc7FJY';
  const homeSender = {
    url: 'https://www.youtube.com/',
    frameId: 0,
    tab: { id: 7 },
  } as Browser.runtime.MessageSender;
  it('allows access after navigating from the home page to a standalone video', async () => {
    vi.spyOn(browser.tabs, 'get').mockImplementation(async () => ({
      id: 7,
      url: watch,
    }));
    expect(
      await handle({ type: 'CHECK_PLATFORM_ACCESS' }, homeSender),
    ).toMatchObject({ ok: true });
  });
  it('allows the bridge access check on a supported browse page without requiring a video', async () => {
    vi.spyOn(browser.tabs, 'get').mockImplementation(async () => ({
      id: 7,
      url: 'https://www.youtube.com/',
    }));
    expect(
      await handle({ type: 'CHECK_PLATFORM_ACCESS' }, homeSender),
    ).toMatchObject({ ok: true });
  });
  it('uses the live video identity for tracking after same-document navigation', async () => {
    const c = createCourse(
      {
        platform: 'youtube',
        videoId: 'qv9PWcc7FJY',
        videoUrl: watch,
        title: 'Standalone course',
        durationSeconds: 3600,
      },
      15,
    );
    await courseRepository.saveCourse(c);
    await saveActivePlayback({
      activationId: 'spa',
      tabId: 7,
      status: 'active',
      platform: 'youtube',
      courseId: c.id,
      sessionId: c.sessions[0]!.id,
      videoId: c.videoId,
      startSeconds: 0,
      endSeconds: 900,
      lastKnownSeconds: 0,
      reportSequence: 0,
      startedAt: new Date().toISOString(),
    });
    vi.spyOn(browser.tabs, 'get').mockImplementation(async () => ({
      id: 7,
      url: watch,
    }));
    expect(
      await handle({ type: 'GET_TAB_ACTIVATION' }, homeSender),
    ).toMatchObject({ ok: true });
    expect(
      await handle(
        {
          type: 'REPORT_SESSION_POSITION',
          courseId: c.id,
          sessionId: c.sessions[0]!.id,
          activationId: 'spa',
          seconds: 150,
          sequence: 1,
        },
        homeSender,
      ),
    ).toMatchObject({ ok: true });
    expect(
      (await courseRepository.getCourse(c.id))?.sessions[0]!.resumeSeconds,
    ).toBe(150);
    vi.spyOn(browser.tabs, 'get').mockImplementation(async () => ({
      id: 7,
      url: 'https://www.youtube.com/watch?v=anotherVideo',
    }));
    expect(
      await handle(
        {
          type: 'REPORT_SESSION_POSITION',
          courseId: c.id,
          sessionId: c.sessions[0]!.id,
          activationId: 'spa',
          seconds: 200,
          sequence: 2,
        },
        homeSender,
      ),
    ).toMatchObject({ ok: false });
    expect(
      (await courseRepository.getCourse(c.id))?.sessions[0]!.resumeSeconds,
    ).toBe(150);
  });
  it('rejects cross-origin, subframe and revoked platform access', async () => {
    vi.spyOn(browser.tabs, 'get').mockImplementation(async () => ({
      id: 7,
      url: 'https://example.com/',
    }));
    expect(
      await handle({ type: 'CHECK_PLATFORM_ACCESS' }, homeSender),
    ).toMatchObject({ ok: false });
    expect(
      await handle(
        { type: 'CHECK_PLATFORM_ACCESS' },
        { ...homeSender, frameId: 1 },
      ),
    ).toMatchObject({ ok: false });
    vi.spyOn(browser.tabs, 'get').mockImplementation(async () => ({
      id: 7,
      url: page.url,
    }));
    vi.spyOn(browser.permissions, 'contains').mockImplementation(
      async () => false,
    );
    expect(await handle({ type: 'CHECK_PLATFORM_ACCESS' }, page)).toMatchObject(
      { ok: false },
    );
  });
});

describe('floating-note boundaries', () => {
  it('limits content notes to the current video and requires the note-mode opt-in', async () => {
    expect(
      await handle({ type: 'DARB_VIDEO_NOTES', action: { op: 'read' } }, page),
    ).toMatchObject({ ok: false });
    await handle({ type: 'DARB_NOTE_MODE', action: { enabled: true } }, ui());
    expect(
      await handle(
        { type: 'DARB_NOTE_MODE', action: { enabled: false } },
        page,
      ),
    ).toMatchObject({ ok: false });
    expect(
      await handle(
        {
          type: 'DARB_VIDEO_NOTES',
          action: {
            op: 'save',
            videoId: course.videoId,
            body: 'A private note',
            seconds: 123,
          },
        },
        page,
      ),
    ).toMatchObject({ ok: true, data: { notes: [{ seconds: 123 }] } });
    const other = createCourse(
      {
        platform: 'x',
        videoId: '456',
        videoUrl: 'https://x.com/u/status/456',
        title: 'Other',
        durationSeconds: 3600,
      },
      15,
    );
    await courseRepository.saveCourse(other);
    vi.spyOn(browser.tabs, 'get').mockImplementation(async () => ({
      id: 7,
      url: other.videoUrl,
    }));
    const result = await handle(
      { type: 'DARB_VIDEO_NOTES', action: { op: 'read' } },
      page,
    );
    expect(result).toMatchObject({ ok: true, data: { notes: [] } });
    expect(JSON.stringify(result)).not.toContain('A private note');
    expect(
      await handle(
        {
          type: 'DARB_VIDEO_NOTES',
          action: {
            op: 'save',
            videoId: course.videoId,
            body: 'wrong',
            seconds: 1,
          },
        },
        page,
      ),
    ).toMatchObject({ ok: false });
    expect(
      await handle(
        { type: 'DARB_VIDEO_NOTES', action: { op: 'read' } },
        { ...page, frameId: 1 },
      ),
    ).toMatchObject({ ok: false });
  });
});

it('reuses an already-open matching video for a note timestamp before any session is active', async () => {
  vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [
    { id: 7, url: course.videoUrl, active: true },
  ]);
  const create = vi.spyOn(browser.tabs, 'create');
  expect(
    await handle(
      { type: 'DARB_OPEN_TIMESTAMP', courseId: course.id, seconds: 6500 },
      ui(),
    ),
  ).toMatchObject({ ok: true });
  expect(await getActivePlayback()).toMatchObject({
    tabId: 7,
    lastKnownSeconds: 6500,
  });
  expect(create).not.toHaveBeenCalled();
});

describe('completion notification routing', () => {
  it('clicking the notification body focuses its video without opening settings or another tab', async () => {
    await activate();
    await saveSettings({
      ...(await getSettings()),
      notificationsEnabled: true,
    });
    const create = vi
      .spyOn(browser.notifications, 'create')
      .mockImplementation(async () => 'notification');
    const tabs = vi.spyOn(browser.tabs, 'create');
    const clear = vi
      .spyOn(browser.notifications, 'clear')
      .mockImplementation(async () => true);
    expect(
      await handle(
        {
          type: 'SESSION_REACHED_END',
          courseId: course.id,
          sessionId: course.sessions[7]!.id,
          activationId: 'a',
        },
        page,
      ),
    ).toMatchObject({ ok: true });
    const id = create.mock.calls[0]![0] as unknown as string;
    expect(id).toContain('darb:completion:');
    notificationClick(id);
    await vi.waitFor(() => expect(clear).toHaveBeenCalledWith(id));
    expect(browser.tabs.update).toHaveBeenCalledWith(7, { active: true });
    expect(tabs).not.toHaveBeenCalled();
  });
  it('opens the specific course if the original tab closed or changed video', async () => {
    const create = vi
      .spyOn(browser.tabs, 'create')
      .mockImplementation(async () => ({ id: 10 }));
    vi.spyOn(browser.notifications, 'clear').mockImplementation(
      async () => true,
    );
    vi.spyOn(browser.tabs, 'get').mockRejectedValue(new Error('Tab closed'));
    notificationClick(`darb:completion:${encodeURIComponent(course.id)}:7`);
    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    const url = new URL(create.mock.calls[0]![0].url!);
    expect(url.pathname).toBe('/dashboard.html');
    expect(url.searchParams.get('course')).toBe(course.id);
    expect(url.searchParams.get('section')).not.toBe('settings');
  });
});

it('keeps video message handlers working when the optional notification API cannot register', async () => {
  vi.spyOn(browser.notifications.onClicked, 'addListener').mockImplementation(
    () => {
      throw new Error('Notification permission unavailable');
    },
  );
  expect(() => background.main()).not.toThrow();
  await Promise.resolve();
  await Promise.resolve();
  expect(await handle({ type: 'CHECK_PLATFORM_ACCESS' }, page)).toMatchObject({
    ok: true,
  });
});
