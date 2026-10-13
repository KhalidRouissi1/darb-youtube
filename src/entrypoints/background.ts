import {
  ensurePlatformBridge,
  syncPlatformScripts,
} from '@/lib/video/registration';
import { hasPlatformAccess } from '@/lib/video/access';
import { parseVideoUrl, sameVideo, sessionUrl } from '@/lib/video/platforms';
import { browser } from 'wxt/browser';
import {
  type ContentActionResponse,
  type RuntimeMessage,
  type RuntimeMessageResponse,
  type SessionCompletionResponse,
  isRuntimeMessage,
} from '@/lib/messaging/messages';
import {
  clearActivePlayback,
  courseRepository,
  getActivePlayback,
  getSettings,
  resetAllData,
  saveActivePlayback,
  saveSettings,
} from '@/lib/storage/repository';
import {
  calculateCourseProgress,
  completeSessionAndAdvance,
  getCurrentSession,
  selectCourseSession,
  setSessionCompletion,
} from '@/lib/utils/courses';
import type { Course, CourseSession } from '@/types/course';
import type { ActivePlayback } from '@/types/video';

let mutationTail: Promise<void> = Promise.resolve();
function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationTail.then(operation, operation);
  mutationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export default defineBackground(() => {
  void syncPlatformScripts().catch((error) =>
    console.error('[Darb] Platform registration failed.', error),
  );
  browser.permissions.onAdded.addListener(() => {
    void syncPlatformScripts().catch(() => undefined);
  });
  browser.permissions.onRemoved.addListener(() => {
    void syncPlatformScripts().catch(() => undefined);
    void mutate(async () => {
      const playback = await getActivePlayback();
      if (
        playback &&
        !(await hasPlatformAccess(playback.platform ?? 'youtube'))
      ) {
        await browser.tabs
          .sendMessage(playback.tabId, { type: 'STOP_SESSION' })
          .catch(() => undefined);
        await clearActivePlayback();
      }
    });
  });
  browser.runtime.onStartup.addListener(() => {
    void mutate(clearActivePlayback);
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    void mutate(async () => {
      if ((await getActivePlayback())?.tabId === tabId)
        await clearActivePlayback();
    });
  });
  browser.runtime.onMessage.addListener(async (message: unknown, sender) => {
    if (!isRuntimeMessage(message)) return undefined;
    try {
      const extensionSender =
        sender.url?.startsWith(browser.runtime.getURL('/')) === true;
      if (!extensionSender && sender.tab) {
        const allowed = [
          'OPEN_DASHBOARD',
          'CHECK_PLATFORM_ACCESS',
          'GET_TAB_ACTIVATION',
          'RELEASE_SESSION',
          'REPORT_SESSION_POSITION',
          'SESSION_REACHED_END',
          'CONTINUE_SESSION_IN_TAB',
        ];
        const identity = sender.url ? parseVideoUrl(sender.url) : null;
        if (
          !allowed.includes(message.type) ||
          sender.frameId !== 0 ||
          !identity ||
          !(await hasPlatformAccess(identity.platform))
        )
          return { ok: false, error: 'This page cannot perform that action.' };
        if (
          message.type !== 'OPEN_DASHBOARD' &&
          message.type !== 'GET_TAB_ACTIVATION' &&
          message.type !== 'CHECK_PLATFORM_ACCESS'
        ) {
          const active = await getActivePlayback();
          // Completion overlays intentionally continue after the completed activation is cleared.
          const course =
            'courseId' in message
              ? await courseRepository.getCourse(message.courseId)
              : null;
          const expected =
            message.type === 'CONTINUE_SESSION_IN_TAB' ? course : active;
          if (!expected || !sameVideo(expected, identity))
            return {
              ok: false,
              error: 'The video no longer matches this session.',
            };
        }
      } else if (!extensionSender) {
        return { ok: false, error: 'Untrusted request.' };
      }
      switch (message.type) {
        case 'CHECK_PLATFORM_ACCESS':
          return { ok: true };
        case 'PING':
          return { ok: true } satisfies RuntimeMessageResponse;
        case 'OPEN_DASHBOARD':
          await openDashboard(message.courseId);
          return { ok: true };
        case 'OPEN_SESSION':
          await openCourseSession(
            message.courseId,
            message.sessionId,
            message.sourceTabId,
            message.restart,
          );
          return { ok: true };
        case 'CONTINUE_SESSION_IN_TAB': {
          if (sender.tab?.id === undefined)
            throw new Error('Darb could not identify the current video tab.');
          await openCourseSession(
            message.courseId,
            message.sessionId,
            sender.tab.id,
            false,
            sender.tab.id,
          );
          return { ok: true };
        }
        case 'CREATE_COURSE':
          await mutate(() => courseRepository.saveCourse(message.course));
          return { ok: true };
        case 'REPAIR_COURSE':
          await mutate(() => courseRepository.updateCourse(message.course));
          return { ok: true };
        case 'DELETE_COURSE':
          await deleteCourse(message.courseId);
          return { ok: true };
        case 'SET_SESSION_COMPLETION':
          await setCourseSessionCompletion(
            message.courseId,
            message.sessionId,
            message.completed,
          );
          return { ok: true };
        case 'SAVE_SETTINGS':
          await mutate(() => saveSettings(message.settings));
          return { ok: true };
        case 'RESET_DATA':
          await mutate(resetAllData);
          return { ok: true };
        case 'GET_TAB_ACTIVATION':
          return getTabActivation(sender.tab?.id);
        case 'RELEASE_SESSION':
          await releaseSession(message.activationId, sender.tab?.id);
          return { ok: true };
        case 'REPORT_SESSION_POSITION':
          await reportPosition(message, sender.tab?.id);
          return { ok: true };
        case 'SESSION_REACHED_END':
          return completeCourseSession(
            message.courseId,
            message.sessionId,
            message.activationId,
            sender.tab?.id,
          );
      }
    } catch (error) {
      return {
        ok: false,
        error: getErrorMessage(error),
      } satisfies RuntimeMessageResponse;
    }
  });
});

async function openDashboard(courseId?: string): Promise<void> {
  const url = new URL(browser.runtime.getURL('/dashboard.html'));
  if (courseId) url.searchParams.set('course', courseId);
  await browser.tabs.create({ url: url.toString() });
}
async function openCourseSession(
  courseId: string,
  sessionId?: string,
  sourceTabId?: number,
  restart = false,
  requiredTabId?: number,
): Promise<void> {
  const course = await courseRepository.getCourse(courseId);
  if (!course) throw new Error('This course no longer exists.');
  if (!(await hasPlatformAccess(course.platform ?? 'youtube')))
    throw new Error('Enable this platform in Darb Settings before continuing.');
  const session = getRequestedSession(course, sessionId);
  const selectedCourse = selectCourseSession(course, session.id);
  if (selectedCourse !== course)
    await mutate(() => courseRepository.updateCourse(selectedCourse));
  const target =
    restart || session.completed ? session.startSeconds : clampResume(session);
  const previous = await getActivePlayback();
  let tabId =
    requiredTabId ??
    sourceTabId ??
    (previous && sameVideo(previous, course) ? previous.tabId : undefined);
  let tabMatchesVideo =
    tabId !== undefined && (await isMatchingVideoTab(tabId, course));
  if (
    !tabMatchesVideo &&
    requiredTabId === undefined &&
    previous &&
    sameVideo(previous, course) &&
    (await isMatchingVideoTab(previous.tabId, course))
  ) {
    tabId = previous.tabId;
    tabMatchesVideo = true;
  }
  if (requiredTabId !== undefined && !tabMatchesVideo) {
    const url = new URL(sessionUrl(course.videoUrl, target));
    await browser.tabs.update(requiredTabId, {
      active: true,
      url: url.toString(),
    });
  } else if (tabId === undefined || !tabMatchesVideo) {
    const url = new URL(sessionUrl(course.videoUrl, target));
    const tab = await browser.tabs.create({
      active: true,
      url: url.toString(),
    });
    if (tab.id === undefined)
      throw new Error('The video opened, but its tab could not be tracked.');
    tabId = tab.id;
  } else await browser.tabs.update(tabId, { active: true });
  if (tabId === undefined)
    throw new Error('Darb could not identify the video tab.');
  const activeTabId = tabId;
  const playback = await mutate(async () => {
    const activation: ActivePlayback = {
      activationId: crypto.randomUUID(),
      tabId: activeTabId,
      status: 'active',
      platform: course.platform ?? 'youtube',
      courseId: course.id,
      sessionId: session.id,
      videoId: course.videoId,
      startSeconds: session.startSeconds,
      endSeconds: session.endSeconds,
      lastKnownSeconds: target,
      reportSequence: 0,
      startedAt: new Date().toISOString(),
    };
    await saveActivePlayback(activation);
    return activation;
  });
  try {
    await waitForTabToLoad(activeTabId);
    await ensurePlatformBridge(activeTabId, course.videoUrl);
    const activation = await activateSessionInTab(
      activeTabId,
      playback.activationId,
    );
    if (!activation.ok)
      throw new Error(
        `Darb could not activate ${session.title}: ${activation.error}`,
      );
  } catch (error) {
    await releaseSession(playback.activationId, activeTabId);
    throw error;
  }
}
async function getTabActivation(
  tabId?: number,
): Promise<ContentActionResponse> {
  if (tabId === undefined)
    return { ok: false, error: 'This page is not a browser tab.' };
  const active = await getActivePlayback();
  return active?.tabId === tabId
    ? { ok: true, playback: active }
    : { ok: false, error: 'No active Darb session belongs to this tab.' };
}
async function reportPosition(
  message: Extract<RuntimeMessage, { type: 'REPORT_SESSION_POSITION' }>,
  tabId?: number,
): Promise<void> {
  await mutate(async () => {
    const active = await getActivePlayback();
    if (
      !owns(
        active,
        message.activationId,
        tabId,
        message.courseId,
        message.sessionId,
      ) ||
      message.sequence <= active.reportSequence
    )
      return;
    const course = await courseRepository.getCourse(active.courseId);
    const session = course?.sessions.find(
      (item) => item.id === active.sessionId,
    );
    if (!course || !session) return;
    const seconds = Math.max(
      session.startSeconds,
      Math.min(message.seconds, session.endSeconds),
    );
    await courseRepository.updateCourse({
      ...course,
      sessions: course.sessions.map((item) =>
        item.id === session.id ? { ...item, resumeSeconds: seconds } : item,
      ),
      updatedAt: new Date().toISOString(),
    });
    await saveActivePlayback({
      ...active,
      lastKnownSeconds: seconds,
      reportSequence: message.sequence,
    });
  });
}
async function completeCourseSession(
  courseId: string,
  sessionId: string,
  activationId: string,
  tabId?: number,
): Promise<SessionCompletionResponse> {
  const result = await mutate(async () => {
    const active = await getActivePlayback();
    if (!owns(active, activationId, tabId, courseId, sessionId))
      throw new Error('This session is no longer active in this tab.');
    const course = await courseRepository.getCourse(courseId);
    if (!course) throw new Error('This course no longer exists.');
    const advancement = completeSessionAndAdvance(course, sessionId);
    const updated = advancement.course;
    await courseRepository.updateCourse(updated);
    await clearActivePlayback();
    return {
      course: updated,
      nextSession: advancement.nextSession,
      progress: calculateCourseProgress(updated),
    };
  });
  try {
    await showCompletionNotification(result.course, result.nextSession);
  } catch {
    /* progress is already durable */
  }
  return { ok: true, ...result };
}
async function setCourseSessionCompletion(
  courseId: string,
  sessionId: string,
  completed: boolean,
): Promise<void> {
  await mutate(async () => {
    const course = await courseRepository.getCourse(courseId);
    if (!course) throw new Error('This course no longer exists.');
    await courseRepository.updateCourse(
      setSessionCompletion(course, sessionId, completed),
    );
    const active = await getActivePlayback();
    if (active?.courseId === courseId && active.sessionId === sessionId)
      await clearActivePlayback();
  });
}
async function deleteCourse(courseId: string): Promise<void> {
  await mutate(async () => {
    await courseRepository.deleteCourse(courseId);
    if ((await getActivePlayback())?.courseId === courseId)
      await clearActivePlayback();
  });
}
async function releaseSession(
  activationId: string,
  tabId?: number,
): Promise<void> {
  await mutate(async () => {
    const active = await getActivePlayback();
    if (owns(active, activationId, tabId)) await clearActivePlayback();
  });
}
function owns(
  active: ActivePlayback | null,
  activationId: string,
  tabId?: number,
  courseId?: string,
  sessionId?: string,
): active is ActivePlayback {
  return (
    !!active &&
    active.activationId === activationId &&
    active.tabId === tabId &&
    (courseId === undefined || active.courseId === courseId) &&
    (sessionId === undefined || active.sessionId === sessionId)
  );
}
function clampResume(session: CourseSession): number {
  return Math.max(
    session.startSeconds,
    Math.min(
      session.resumeSeconds ?? session.startSeconds,
      session.endSeconds - 1,
    ),
  );
}
function getRequestedSession(course: Course, id?: string): CourseSession {
  if (!id) return getCurrentSession(course);
  const session = course.sessions.find((item) => item.id === id);
  if (!session) throw new Error('The requested session no longer exists.');
  return session;
}
async function isMatchingVideoTab(
  tabId: number,
  course: Course,
): Promise<boolean> {
  try {
    const tab = await browser.tabs.get(tabId);
    const identity = tab.url ? parseVideoUrl(tab.url) : null;
    return !!identity && sameVideo(course, identity);
  } catch {
    return false;
  }
}
async function activateSessionInTab(
  tabId: number,
  activationId: string,
): Promise<ContentActionResponse> {
  await waitForTabToLoad(tabId);
  let error = 'The video bridge did not respond.';
  for (let i = 0; i < 8; i += 1) {
    try {
      const response = await browser.tabs.sendMessage<
        { type: 'ACTIVATE_SESSION'; activationId: string },
        ContentActionResponse
      >(tabId, { type: 'ACTIVATE_SESSION', activationId });
      if (response) return response;
    } catch (cause) {
      error = getErrorMessage(cause);
    }
    await delay(350);
  }
  return { ok: false, error };
}
async function waitForTabToLoad(tabId: number): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    if ((await browser.tabs.get(tabId)).status === 'complete') return;
    await delay(250);
  }
  throw new Error(
    'The video page took too long to load. Refresh the tab and retry.',
  );
}
async function showCompletionNotification(
  course: Course,
  next: CourseSession | null,
): Promise<void> {
  const settings = await getSettings();
  if (
    !settings.notificationsEnabled ||
    !(await browser.permissions.contains({ permissions: ['notifications'] }))
  )
    return;
  await browser.notifications.create({
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon-128.png'),
    title: course.completed ? 'Course completed!' : 'Session completed',
    message: course.completed
      ? `You finished ${course.title}.`
      : next
        ? `${next.title} is ready.`
        : 'You reached the end. Earlier sessions are still unfinished.',
  });
}
function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Darb could not complete this action.';
}
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
