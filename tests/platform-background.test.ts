import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser, type Browser } from 'wxt/browser';
import background from '@/entrypoints/background';
import {
  courseRepository,
  getActivePlayback,
  saveActivePlayback,
} from '@/lib/storage/repository';
import { createCourse } from '@/lib/utils/courses';
import type { Course } from '@/types/course';

type Handler = (
  message: unknown,
  sender: Browser.runtime.MessageSender,
) => Promise<unknown>;
let handle: Handler;
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
      handle = listener as unknown as Handler;
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
