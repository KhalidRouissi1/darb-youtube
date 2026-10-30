import { videoNotesAction } from '@/lib/workspace/video-notes';
import { withAsyncResponse } from '@/lib/messaging/async-response';
import { workspaceAction } from '@/lib/workspace/repository';
import { z } from 'zod';
import { launchSelection } from '@/lib/learning/launch';
import { learningAction } from '@/lib/learning/actions';
import { withTimeout } from '@/lib/utils/with-timeout';
import {
  courseForVideo,
  playlistSummary,
  recordPlaylistVideoCompletion,
} from '@/lib/learning/model';
import { readLearning, writeLearning } from '@/lib/learning/repository';
import { attachNativeBridge } from '@/lib/learning/native-bridge';
import {
  ensurePlatformBridge,
  syncPlatformScripts,
} from '@/lib/video/registration';
import { hasPlatformAccess } from '@/lib/video/access';
import {
  platformFromUrl,
  parseVideoUrl,
  sameVideo,
  sessionUrl,
} from '@/lib/video/platforms';
import { browser, type Browser } from 'wxt/browser';
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
  createCourse,
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
  attachNativeBridge(mutate);
  let notificationClicksAttached = false;
  const attachNotificationClicks = async () => {
    if (
      !(await browser.permissions.contains({ permissions: ['notifications'] }))
    )
      return;
    if (notificationClicksAttached) return;
    const event = browser.notifications?.onClicked;
    if (!event) return;
    event.addListener((id) => {
      void handleNotificationClick(id).catch((error) =>
        console.error('[Darb] Could not open notification.', error),
      );
    });
    notificationClicksAttached = true;
  };
  // Optional notification APIs must never prevent video message handlers starting.
  void attachNotificationClicks().catch(() => undefined);
  void syncPlatformScripts().catch((error) =>
    console.error('[Darb] Platform registration failed.', error),
  );
  browser.permissions.onAdded.addListener(() => {
    void attachNotificationClicks().catch(() => undefined);
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
  browser.runtime.onMessage.addListener(
    withAsyncResponse(
      (message) =>
        isRuntimeMessage(message) ||
        (typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          typeof message.type === 'string' &&
          message.type.startsWith('DARB_')),
      async (message: unknown, sender) => {
        if (
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          typeof message.type === 'string' &&
          message.type.startsWith('DARB_')
        ) {
          try {
            const extension =
              sender.url?.startsWith(browser.runtime.getURL('/')) === true;
            const page = sender.url ? new URL(sender.url) : null;
            const youtube =
              sender.frameId === 0 &&
              page &&
              (page.hostname === 'youtube.com' ||
                page.hostname.endsWith('.youtube.com'));
            const request = message as {
              type: string;
              action?: unknown;
              playlistId?: string;
              videoId?: string;
            };
            if (request.type === 'DARB_PLAYLIST_VIDEO_ENDED') {
              const identity = await liveContentVideo(sender);
              const input = z
                .object({ playlistId: z.string(), videoId: z.string() })
                .parse(message);
              if (
                identity.platform !== 'youtube' ||
                identity.videoId !== input.videoId
              )
                throw new Error('This tab changed videos.');
              const response = await withTimeout(
                browser.tabs.sendMessage(sender.tab!.id!, {
                  type: 'GET_VIDEO_POSITION',
                  videoId: identity.videoId,
                  platform: 'youtube',
                }),
                2000,
                'The video player did not respond.',
              );
              const position = response?.position;
              if (
                !response?.ok ||
                position?.videoId !== identity.videoId ||
                !position.ended ||
                !Number.isFinite(position.durationSeconds) ||
                position.durationSeconds <= 0 ||
                !Number.isFinite(position.seconds) ||
                position.seconds < position.durationSeconds - 0.5
              )
                throw new Error('The video has not finished yet.');
              const next = await mutate(async () => {
                const state = await readLearning();
                const playlist = state.playlists.find(
                  (p) => p.id === input.playlistId,
                );
                if (
                  !playlist ||
                  !playlist.items.some((v) => v.videoId === identity.videoId)
                )
                  throw new Error('Video is not in this playlist.');
                if (playlist.cursorId !== identity.videoId) {
                  if (playlist.completedVideoIds.includes(identity.videoId))
                    return null;
                  throw new Error('The playlist moved to another video.');
                }
                recordPlaylistVideoCompletion(playlist, identity.videoId);
                await writeLearning(state);
                return (
                  playlist.items[
                    playlist.items.findIndex(
                      (v) => v.videoId === identity.videoId,
                    ) + 1
                  ] ?? null
                );
              });
              if (next)
                await advancePlaylist(
                  input.playlistId,
                  identity.videoId,
                  next.videoId,
                  sender.tab!.id!,
                );
              return { ok: true };
            }
            if (request.type === 'DARB_PLAYLIST_CONTEXT') {
              const identity = await liveContentVideo(sender);
              return {
                ok: true,
                playlist: await videoPlaylistContext(
                  identity.videoId,
                  identity.platform,
                ),
              };
            }
            if (
              request.type === 'DARB_CONTINUE_PLAYLIST' ||
              request.type === 'DARB_NEXT_PLAYLIST'
            ) {
              const identity = await liveContentVideo(sender);
              const input = z
                .object({ playlistId: z.string(), videoId: z.string() })
                .parse(message);
              const state = await readLearning();
              const playlist = state.playlists.find(
                (p) => p.id === input.playlistId,
              );
              const index =
                playlist?.items.findIndex(
                  (v) => v.videoId === identity.videoId,
                ) ?? -1;
              const course = courseForVideo(
                await courseRepository.getCourses(),
                identity.videoId,
              );
              if (
                identity.platform !== 'youtube' ||
                !playlist ||
                playlist.cursorId !== identity.videoId ||
                index < 0 ||
                playlist.items[index + 1]?.videoId !== input.videoId ||
                (request.type === 'DARB_CONTINUE_PLAYLIST' &&
                  !course?.sessions.at(-1)?.completed)
              )
                throw new Error(
                  'This playlist changed. Open its current video in Darb.',
                );
              return {
                ok: true,
                ...(await advancePlaylist(
                  input.playlistId,
                  identity.videoId,
                  input.videoId,
                  sender.tab!.id!,
                )),
              };
            }
            if (request.type === 'DARB_NOTE_MODE') {
              if (!extension) throw new Error('Change note mode inside Darb.');
              const action = z
                .object({ enabled: z.boolean().optional() })
                .parse(request.action ?? {});
              if (action.enabled !== undefined)
                await browser.storage.local.set({
                  'darb:note-mode': action.enabled,
                });
              const saved = await browser.storage.local.get('darb:note-mode');
              return { ok: true, enabled: saved['darb:note-mode'] === true };
            }
            if (request.type === 'DARB_VIDEO_NOTES') {
              if (extension)
                throw new Error('Use the video page for floating notes.');
              const identity = await liveContentVideo(sender);
              const saved = await browser.storage.local.get('darb:note-mode');
              if (saved['darb:note-mode'] !== true)
                throw new Error('Turn on note mode in the Darb popup first.');
              return {
                ok: true,
                data: await mutate(() =>
                  videoNotesAction(identity, request.action),
                ),
              };
            }
            if (request.type === 'DARB_WORKSPACE') {
              if (!extension)
                throw new Error(
                  'Workspace access is only available inside Darb.',
                );
              return {
                ok: true,
                data: await mutate(() => workspaceAction(request.action)),
              };
            }
            if (request.type === 'DARB_OPEN_TIMESTAMP') {
              if (!extension)
                throw new Error('Open timestamp links inside Darb.');
              const input = z
                .object({
                  courseId: z.string(),
                  seconds: z.number().finite().nonnegative(),
                })
                .parse(message);
              const course = await courseRepository.getCourse(input.courseId);
              const tabs = course ? await browser.tabs.query({}) : [];
              const matching = tabs.filter((tab) => {
                const identity = tab.url ? parseVideoUrl(tab.url) : null;
                return course && identity && sameVideo(course, identity);
              });
              matching.sort((a, b) => Number(b.active) - Number(a.active));
              await openCourseSession(
                input.courseId,
                undefined,
                matching[0]?.id,
                false,
                undefined,
                input.seconds,
              );
              return { ok: true };
            }
            if (request.type === 'DARB_LEARNING') {
              const action = request.action as { op?: string };
              if (
                !extension &&
                !(
                  youtube &&
                  ['read', 'selection.toggle', 'selection.cancel'].includes(
                    action?.op ?? '',
                  )
                )
              )
                throw new Error('This page cannot change Darb data.');
              const data = await mutate(() => learningAction(request.action));
              return {
                ok: true,
                data: extension
                  ? data
                  : { selection: (await readLearning()).selection },
              };
            }
            if (
              request.type === 'DARB_REVIEW_SELECTION' &&
              (extension || youtube)
            ) {
              await browser.tabs.create({
                url:
                  browser.runtime.getURL('/dashboard.html') +
                  '?section=playlists',
              });
              return { ok: true };
            }
            if (!extension) throw new Error('Open this action in Darb.');
            if (request.type === 'DARB_START_SELECTION') {
              const [tab] = await browser.tabs.query({
                active: true,
                currentWindow: true,
              });
              if (
                !tab?.id ||
                !tab.url ||
                !/^https:\/\/(?:www\.)?youtube\.com\//.test(tab.url)
              )
                throw new Error(
                  'Open YouTube search results or a channel Videos page first.',
                );
              await launchSelection(tab.id);
              return { ok: true };
            }
            if (request.type === 'DARB_OPEN_PLAYLIST') {
              if (!request.playlistId) throw new Error('Choose a playlist.');
              return {
                ok: true,
                ...(await openPlaylistVideo(
                  request.playlistId,
                  request.videoId,
                )),
              };
            }
            throw new Error('Unknown Darb action.');
          } catch (error) {
            return { ok: false, error: getErrorMessage(error) };
          }
        }
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
            // YouTube changes / -> /watch through history navigation. The sender's
            // document URL can still be the URL at injection; use the browser's live
            // top-level tab URL for video identity, retaining the sender origin check.
            const senderPlatform = platformFromUrl(sender.url ?? '');
            if (
              !allowed.includes(message.type) ||
              sender.frameId !== 0 ||
              !senderPlatform ||
              sender.tab.id === undefined
            )
              return {
                ok: false,
                error: 'This page cannot perform that action.',
              };
            const liveTab = await browser.tabs.get(sender.tab.id);
            const liveUrl = liveTab.url ?? '';
            if (
              platformFromUrl(liveUrl) !== senderPlatform ||
              new URL(liveUrl).origin !== new URL(sender.url!).origin ||
              !(await hasPlatformAccess(senderPlatform))
            )
              return {
                ok: false,
                error: 'This page cannot perform that action.',
              };
            const identity = parseVideoUrl(liveUrl);
            if (
              message.type !== 'CHECK_PLATFORM_ACCESS' &&
              message.type !== 'OPEN_DASHBOARD' &&
              !identity
            )
              return {
                ok: false,
                error: 'Open a dedicated recorded video page.',
              };
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
              if (!expected || !identity || !sameVideo(expected, identity))
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
                throw new Error(
                  'Darb could not identify the current video tab.',
                );
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
      },
    ),
  );
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
  seekSeconds?: number,
  playlistId?: string,
): Promise<void> {
  const course = await courseRepository.getCourse(courseId);
  if (!course) throw new Error('This course no longer exists.');
  if (!(await hasPlatformAccess(course.platform ?? 'youtube')))
    throw new Error('Enable this platform in Darb Settings before continuing.');
  if (
    seekSeconds !== undefined &&
    (!Number.isFinite(seekSeconds) ||
      seekSeconds < 0 ||
      seekSeconds >= course.durationSeconds)
  )
    throw new Error('Timestamp is outside this video.');
  const session =
    seekSeconds === undefined
      ? getRequestedSession(course, sessionId)
      : course.sessions.find(
          (s) => seekSeconds >= s.startSeconds && seekSeconds < s.endSeconds,
        )!;
  if (!session)
    throw new Error(
      'No session covers this timestamp. Repair the course before opening this link.',
    );
  const selectedCourse = selectCourseSession(course, session.id);
  if (selectedCourse !== course)
    await mutate(() => courseRepository.updateCourse(selectedCourse));
  const target =
    seekSeconds ??
    (restart || session.completed
      ? session.startSeconds
      : clampResume(session));
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
  const learning = await readLearning();
  const candidates = learning.playlists.filter(
    (p) => p.cursorId === course.videoId,
  );
  const playlistContext =
    playlistId ??
    (previous?.courseId === course.id ? previous.playlistId : undefined) ??
    (candidates.length === 1 ? candidates[0]!.id : undefined);
  const playback = await mutate(async () => {
    const activation: ActivePlayback = {
      activationId: crypto.randomUUID(),
      ...(playlistContext ? { playlistId: playlistContext } : {}),
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
    const learning = await readLearning();
    const candidates = learning.playlists.filter(
      (p) => p.cursorId === updated.videoId,
    );
    const playlist = active.playlistId
      ? candidates.find((p) => p.id === active.playlistId)
      : candidates.length === 1
        ? candidates[0]
        : undefined;
    if (playlist && !advancement.nextSession) {
      recordPlaylistVideoCompletion(playlist, updated.videoId);
      await writeLearning(learning);
    }
    const next =
      !advancement.nextSession && playlist
        ? playlist.items[
            playlist.items.findIndex((v) => v.videoId === updated.videoId) + 1
          ]
        : undefined;
    return {
      ...(next && playlist
        ? {
            nextVideo: {
              playlistId: playlist.id,
              videoId: next.videoId,
              title: next.title,
            },
          }
        : {}),
      ...(playlist
        ? {
            playlist: {
              title: playlist.title,
              completed:
                playlistSummary(playlist, await courseRepository.getCourses())
                  .completedVideos === playlist.items.length,
            },
          }
        : {}),
      course: updated,
      nextSession: advancement.nextSession,
      progress: calculateCourseProgress(updated),
    };
  });
  try {
    await showCompletionNotification(
      result.course,
      result.nextSession,
      tabId,
      result.playlist,
    );
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
  tabId?: number,
  playlist?: { title: string; completed: boolean },
): Promise<void> {
  const settings = await getSettings();
  if (
    !settings.notificationsEnabled ||
    !(await browser.permissions.contains({ permissions: ['notifications'] }))
  )
    return;
  await browser.notifications.create(
    `darb:completion:${encodeURIComponent(course.id)}:${tabId ?? ''}`,
    {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon-128.png'),
      title: playlist?.completed
        ? 'Playlist completed!'
        : course.completed
          ? 'Course completed!'
          : 'Session completed',
      message: playlist?.completed
        ? `You finished ${playlist.title}.`
        : course.completed
          ? `You finished ${course.title}.`
          : next
            ? `${next.title} is ready.`
            : 'You reached the end. Earlier sessions are still unfinished.',
    },
  );
}
function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Darb could not complete this action.';
}
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function liveContentVideo(sender: Browser.runtime.MessageSender) {
  if (
    sender.frameId !== 0 ||
    sender.tab?.id === undefined ||
    !sender.url ||
    !platformFromUrl(sender.url)
  )
    throw new Error('Open a supported video page.');
  const tab = await browser.tabs.get(sender.tab.id);
  const identity = tab.url ? parseVideoUrl(tab.url) : null;
  if (
    !identity ||
    new URL(tab.url!).origin !== new URL(sender.url).origin ||
    !(await hasPlatformAccess(identity.platform))
  )
    throw new Error('Video access is unavailable.');
  return identity;
}

async function openPlaylistVideo(
  playlistId: string,
  videoId?: string,
  sourceTabId?: number,
) {
  const video = await mutate(async () => {
    const state = await readLearning();
    const playlist = state.playlists.find((p) => p.id === playlistId);
    const item = playlist?.items.find(
      (v) => v.videoId === (videoId ?? playlist.cursorId),
    );
    if (!playlist || !item) throw new Error('Video is not in this playlist.');
    playlist.cursorId = item.videoId;
    playlist.revision++;
    playlist.updatedAt = new Date().toISOString();
    await writeLearning(state);
    return item;
  });
  let course = courseForVideo(
    await courseRepository.getCourses(),
    video.videoId,
  );
  let tabId = sourceTabId;
  if (tabId !== undefined)
    await browser.tabs.update(tabId, { url: video.videoUrl, active: true });
  if (!course) {
    if (tabId === undefined)
      tabId = (await browser.tabs.create({ url: video.videoUrl })).id;
    if (tabId !== undefined) {
      await waitForTabToLoad(tabId);
      await ensurePlatformBridge(tabId, video.videoUrl);
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const response = await browser.tabs.sendMessage(tabId, {
            type: 'GET_VIDEO_METADATA',
          });
          if (
            response?.ok &&
            response.video?.videoId === video.videoId &&
            (response.video.platform ?? 'youtube') === 'youtube'
          ) {
            course = createCourse(
              response.video,
              (await getSettings()).defaultSessionLengthMinutes,
            );
            const prepared = course;
            await mutate(() => courseRepository.saveCourse(prepared));
            break;
          }
        } catch {
          /* YouTube may still be navigating. */
        }
        if (attempt < 4) await delay(250);
      }
    }
  }
  if (course)
    await openCourseSession(
      course.id,
      undefined,
      tabId,
      false,
      undefined,
      undefined,
      playlistId,
    );
  return { needsCourse: !course };
}

// The notification ID survives service-worker restarts without a separate routing store.
async function handleNotificationClick(id: string): Promise<void> {
  const match = /^darb:completion:([^:]+):(\d*)$/.exec(id);
  if (!match) return;
  const courseId = decodeURIComponent(match[1]!);
  const course = await courseRepository.getCourse(courseId);
  let tab = match[2]
    ? await browser.tabs.get(Number(match[2])).catch(() => undefined)
    : undefined;
  if (
    !course ||
    !tab?.url ||
    !(parseVideoUrl(tab.url) && sameVideo(course, parseVideoUrl(tab.url)!))
  )
    tab = undefined;
  if (tab?.id !== undefined) {
    await browser.tabs.update(tab.id, { active: true });
    if (tab.windowId !== undefined)
      await browser.windows.update(tab.windowId, { focused: true });
  } else await openDashboard(courseId);
  await browser.notifications.clear(id);
}

async function videoPlaylistContext(videoId: string, platform: string) {
  if (platform !== 'youtube') return null;
  const state = await readLearning();
  const active = await getActivePlayback();
  const candidates = state.playlists.filter((p) => p.cursorId === videoId);
  const playlist =
    candidates.find((p) => p.id === active?.playlistId) ??
    (candidates.length === 1 ? candidates[0] : undefined);
  if (!playlist) return null;
  const summary = playlistSummary(
    playlist,
    await courseRepository.getCourses(),
  );
  const index = playlist.items.findIndex((v) => v.videoId === videoId);
  return {
    id: playlist.id,
    videoId,
    title: playlist.title,
    index,
    total: playlist.items.length,
    completedVideos: summary.completedVideos,
    completed: summary.completedVideos === playlist.items.length,
    next: playlist.items[index + 1]
      ? {
          videoId: playlist.items[index + 1]!.videoId,
          title: playlist.items[index + 1]!.title,
        }
      : null,
  };
}

// The player ended event and final-session completion may arrive together.
const playlistAdvances = new Map<string, Promise<{ needsCourse: boolean }>>();
function advancePlaylist(
  playlistId: string,
  fromVideoId: string,
  nextVideoId: string,
  tabId: number,
) {
  const key = `${tabId}:${playlistId}:${fromVideoId}`;
  const pending = playlistAdvances.get(key);
  if (pending) return pending;
  const task = (async () => {
    const playlist = (await readLearning()).playlists.find(
      (p) => p.id === playlistId,
    );
    if (
      !playlist ||
      playlist.cursorId !== fromVideoId ||
      playlist.items[
        playlist.items.findIndex((v) => v.videoId === fromVideoId) + 1
      ]?.videoId !== nextVideoId
    )
      throw new Error('The playlist already moved to another video.');
    return openPlaylistVideo(playlistId, nextVideoId, tabId);
  })().finally(() => playlistAdvances.delete(key));
  playlistAdvances.set(key, task);
  return task;
}
