import { version as APP_VERSION } from '../../../package.json';
import { withTimeout } from '@/lib/utils/with-timeout';
import { CourseNotes } from '@/features/workspace/Notes';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceContext';
import '@/features/workspace/workspace.css';
import { VideoThumbnail } from '@/components/ui/VideoThumbnail';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  LayoutDashboard,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import { DarbLogo } from '@/components/brand/DarbLogo';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import type {
  RuntimeMessageResponse,
  VideoMetadataResponse,
} from '@/lib/messaging/messages';
import { courseRepository, getSettings } from '@/lib/storage/repository';
import { createCourse, rebuildCourseFromVideo } from '@/lib/utils/courses';
import { formatDuration } from '@/lib/utils/time';
import {
  parseVideoUrl,
  platformFromUrl,
  PLATFORM_LABELS,
} from '@/lib/video/platforms';
import { hasPlatformAccess, requestPlatformAccess } from '@/lib/video/access';
import { ensurePlatformBridge } from '@/lib/video/registration';
import type { Course } from '@/types/course';
import type { VideoMetadata } from '@/types/video';

const SESSION_LENGTHS = [15, 20, 30, 45, 60] as const;

type PopupState =
  | { status: 'loading' }
  | { status: 'browse' }
  | { status: 'error'; message: string }
  | { status: 'permission'; platform: 'x' | 'facebook' }
  | {
      status: 'ready';
      video: VideoMetadata;
      duplicates: Course[];
    }
  | { status: 'created'; course: Course };

export function PopupApp() {
  const [state, setState] = useState<PopupState>({ status: 'loading' });
  const detection = useRef(0);
  const detectedPage = useRef('');
  const [sessionLength, setSessionLength] = useState(30);
  const [customLength, setCustomLength] = useState('');
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [startingSelection, setStartingSelection] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const startPending = useRef(false);

  const startSelection = async () => {
    setActionError(null);
    setStartingSelection(true);
    try {
      const response = await browser.runtime.sendMessage({
        type: 'DARB_START_SELECTION',
      });
      if (!response?.ok)
        throw new Error(response?.error ?? 'Unable to start video selection.');
      window.close();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Unable to start video selection. Reload YouTube and try again.',
      );
    } finally {
      setStartingSelection(false);
    }
  };

  const detectVideo = async () => {
    const generation = ++detection.current;
    const commit = (next: PopupState) => {
      if (generation === detection.current) setState(next);
    };
    commit({ status: 'loading' });
    setActionError(null);
    setAllowDuplicate(false);

    try {
      await withTimeout(
        (async () => {
          const settings = await getSettings();
          setSessionLength(settings.defaultSessionLengthMinutes);

          let [tab] = await browser.tabs.query({
            active: true,
            currentWindow: true,
          });

          if (!tab) {
            [tab] = await browser.tabs.query({
              active: true,
              lastFocusedWindow: true,
            });
          }

          if (generation !== detection.current) return;
          if (!tab?.id) {
            await openDashboard();
            return;
          }

          let pageUrl = tab.url;
          detectedPage.current = `${tab.id}:${pageUrl}`;
          const candidate = pageUrl ? platformFromUrl(pageUrl) : null;
          if (
            candidate &&
            (candidate === 'youtube' || (await hasPlatformAccess(candidate)))
          ) {
            await ensurePlatformBridge(tab.id, pageUrl!);
            const context = await withTimeout(
              browser.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_CONTEXT' }),
              1500,
              'The video page did not respond. Refresh the video tab and try again.',
            );
            if (context?.ok && typeof context.url === 'string') {
              pageUrl = context.url;
            }
          }
          if (generation !== detection.current) return;
          detectedPage.current = `${tab.id}:${pageUrl}`;
          tab = { ...tab, url: pageUrl };
          const tabId = tab.id!;
          const platform = pageUrl ? platformFromUrl(pageUrl) : null;
          if (tab.url && !platform) {
            await openDashboard();
            return;
          }
          if (platform === 'youtube' && tab.url && !parseVideoUrl(tab.url)) {
            commit({ status: 'browse' });
            return;
          }
          if (tab.url && !parseVideoUrl(tab.url)) {
            commit({
              status: 'error',
              message:
                'Use Select videos to build a playlist, or open an individual video to create a course.',
            });
            return;
          }
          if (platform && platform !== 'youtube') {
            if (!(await hasPlatformAccess(platform))) {
              commit({ status: 'permission', platform });
              return;
            }
          }

          let response: VideoMetadataResponse | undefined;
          try {
            response = await browser.tabs.sendMessage<
              { type: 'GET_VIDEO_METADATA' },
              VideoMetadataResponse
            >(tabId, { type: 'GET_VIDEO_METADATA' });
          } catch {
            // If content script did not respond and this was not a verified watch URL, open dashboard
            if (!tab.url || !parseVideoUrl(tab.url)) {
              await openDashboard();
              return;
            }

            commit({
              status: 'error',
              message:
                'Darb could not connect to this tab. Reload the video page and try again.',
            });
            return;
          }

          if (!response?.ok) {
            commit({
              status: 'error',
              message:
                response?.error ??
                'Darb could not connect to this video. Reload the video tab and try again.',
            });
            return;
          }

          const expected = tab.url ? parseVideoUrl(tab.url) : null;
          if (
            expected &&
            (expected.videoId !== response.video.videoId ||
              expected.platform !== (response.video.platform ?? 'youtube'))
          ) {
            commit({
              status: 'error',
              message:
                'YouTube is changing videos. Wait a moment and try again.',
            });
            return;
          }
          const duplicates = await courseRepository.findByVideoId(
            response.video.videoId,
            response.video.platform,
          );
          commit({
            status: 'ready',
            video: response.video,
            duplicates,
          });
        })(),
        15000,
        'Reading this video took too long. Refresh the video tab, then press Try again.',
      );
    } catch (error) {
      commit({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Darb could not connect to this tab. Reload the video page and try again.',
      });
      // Discard a response arriving after the deadline.
      if (generation === detection.current) detection.current++;
    }
  };

  useEffect(() => {
    let alive = true;
    let checking = false;
    void detectVideo();
    const check = async () => {
      if (checking || !alive) return;
      checking = true;
      try {
        const [tab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) return;
        let url = tab.url;
        if (url && platformFromUrl(url)) {
          const context = await withTimeout(
            browser.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_CONTEXT' }),
            1500,
            'Context unavailable',
          ).catch(() => undefined);
          // A failed context read is not navigation back to tabs.query's cached URL.
          if (!context?.ok || typeof context.url !== 'string') return;
          url = context.url;
        }
        if (
          alive &&
          detectedPage.current &&
          detectedPage.current !== `${tab.id}:${url}`
        )
          void detectVideo();
      } finally {
        checking = false;
      }
    };
    const timer = setInterval(() => {
      void check().catch(() => undefined);
    }, 750);
    const changed = () => {
      void check().catch(() => undefined);
    };
    browser.tabs.onUpdated.addListener(changed);
    browser.tabs.onActivated.addListener(changed);
    return () => {
      alive = false;
      detection.current++;
      clearInterval(timer);
      browser.tabs.onUpdated.removeListener(changed);
      browser.tabs.onActivated.removeListener(changed);
    };
  }, []);

  const effectiveSessionLength = useMemo(() => {
    if (customLength.trim()) {
      return Number(customLength);
    }

    return sessionLength;
  }, [customLength, sessionLength]);

  const estimatedDays =
    state.status === 'ready' &&
    Number.isFinite(effectiveSessionLength) &&
    effectiveSessionLength > 0
      ? Math.ceil(state.video.durationSeconds / (effectiveSessionLength * 60))
      : 0;
  const repairTarget =
    state.status === 'ready'
      ? state.duplicates.find((course) =>
          hasDurationMismatch(course, state.video),
        )
      : undefined;

  const handleCreateCourse = async () => {
    if (state.status !== 'ready') {
      return;
    }

    if (
      !Number.isFinite(effectiveSessionLength) ||
      effectiveSessionLength < 1 ||
      effectiveSessionLength > 720
    ) {
      setActionError('Choose a session duration between 1 and 720 minutes.');
      return;
    }

    if (state.duplicates.length > 0 && !allowDuplicate) {
      setActionError(
        'This video already has a course. Open it or choose “Create another”.',
      );
      return;
    }

    setIsSaving(true);
    setActionError(null);

    try {
      const course = createCourse(state.video, effectiveSessionLength);
      const response = await browser.runtime.sendMessage<
        { type: 'CREATE_COURSE'; course: Course },
        RuntimeMessageResponse
      >({ type: 'CREATE_COURSE', course });
      if (!response?.ok) {
        throw new Error(response?.error ?? 'Darb could not save this course.');
      }
      setState({ status: 'created', course });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Darb could not save this course.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleRepairCourse = async () => {
    if (state.status !== 'ready' || !repairTarget) {
      return;
    }

    setIsSaving(true);
    setActionError(null);

    try {
      const repairedCourse = rebuildCourseFromVideo(repairTarget, state.video);
      const response = await browser.runtime.sendMessage<
        { type: 'REPAIR_COURSE'; course: Course },
        RuntimeMessageResponse
      >({ type: 'REPAIR_COURSE', course: repairedCourse });
      if (!response?.ok) {
        throw new Error(
          response?.error ?? 'Darb could not repair this course.',
        );
      }
      setState({
        status: 'created',
        course: repairedCourse,
      });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Darb could not repair this course.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const openDashboard = async (courseId?: string) => {
    const response = await browser.runtime.sendMessage<
      { type: 'OPEN_DASHBOARD'; courseId?: string },
      RuntimeMessageResponse
    >({
      type: 'OPEN_DASHBOARD',
      ...(courseId ? { courseId } : {}),
    });

    if (response?.ok) {
      window.close();
    } else {
      setActionError(response?.error ?? 'Unable to open the dashboard.');
    }
  };

  const openSession = async (courseId: string) => {
    if (startPending.current) return;
    startPending.current = true;
    setIsStarting(true);
    setActionError(null);
    try {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const response = await withTimeout(
        browser.runtime.sendMessage<
          { type: 'OPEN_SESSION'; courseId: string; sourceTabId?: number },
          RuntimeMessageResponse
        >({
          type: 'OPEN_SESSION',
          courseId,
          ...(tab?.id !== undefined ? { sourceTabId: tab.id } : {}),
        }),
        20000,
        'Starting took too long. Refresh the video page, then try again.',
      );

      if (response?.ok) {
        window.close();
      } else {
        throw new Error(response?.error ?? 'Unable to open this session.');
      }
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Unable to start this session. Refresh the video page and retry.',
      );
    } finally {
      startPending.current = false;
      setIsStarting(false);
    }
  };

  if (state.status === 'permission')
    return (
      <div className="w-[380px] p-6">
        <h1 className="text-lg font-bold">
          Enable Darb on {PLATFORM_LABELS[state.platform]}
        </h1>
        <p className="my-4 text-sm">
          Experimental support for individual recorded videos. Allow access to
          read this video's details and track progress locally.
        </p>
        <PrimaryButton
          onClick={() => {
            void requestPlatformAccess(state.platform)
              .then((granted) => {
                if (granted) void detectVideo();
                else
                  setState({
                    status: 'error',
                    message:
                      'Access was declined. Enable the platform in Settings when you want to try again.',
                  });
              })
              .catch(() =>
                setState({
                  status: 'error',
                  message:
                    'Unable to request access. Try enabling the platform in Settings.',
                }),
              );
          }}
        >
          Enable {PLATFORM_LABELS[state.platform]}
        </PrimaryButton>
      </div>
    );

  return (
    <main className="max-h-[600px] w-[390px] overflow-y-auto bg-white">
      <div className="flex gap-2 border-b p-3">
        <button
          className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white"
          disabled={startingSelection}
          onClick={() => void startSelection()}
        >
          {startingSelection ? 'Starting selection…' : 'Select videos'}
        </button>
        <button
          className="text-xs font-semibold"
          onClick={() => {
            void browser.tabs.create({
              url:
                browser.runtime.getURL('/dashboard.html') +
                '?section=playlists',
            });
            window.close();
          }}
        >
          Playlists
        </button>
      </div>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-black/5 bg-white/95 px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <DarbLogo />
          <span className="text-[10px] text-muted">v{APP_VERSION}</span>
        </div>
        <button
          aria-label="Open dashboard"
          className="grid size-9 place-items-center rounded-xl bg-[#f3f2f8] text-[#5f6070] transition hover:bg-brand-50 hover:text-brand-600"
          onClick={() => void openDashboard()}
          type="button"
        >
          <LayoutDashboard size={17} strokeWidth={2.2} />
        </button>
      </header>

      {actionError &&
        state.status !== 'ready' &&
        state.status !== 'created' && (
          <div className="px-5 pt-4">
            <InlineError message={actionError} />
          </div>
        )}

      {state.status === 'browse' && (
        <section className="px-5 pb-6 pt-5">
          <div className="rounded-[22px] bg-[#222127] p-6 text-white">
            <BookOpen className="text-brand-500" size={26} />
            <h1 className="mt-4 text-xl font-semibold">
              Choose a video or build a playlist
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/70">
              Open any video to create a single-video course. Or select videos
              here, then name and arrange a playlist in Darb.
            </p>
            <PrimaryButton
              className="mt-5 w-full"
              disabled={startingSelection}
              onClick={() => void startSelection()}
            >
              {startingSelection
                ? 'Starting selection…'
                : 'Select videos on this page'}
            </PrimaryButton>
          </div>
          <p className="mt-4 text-xs leading-5 text-muted">
            Open an individual video when you want to create a course from just
            that video.
          </p>
        </section>
      )}

      {state.status === 'loading' && <LoadingState />}

      {state.status === 'error' && (
        <ErrorState message={state.message} onRetry={detectVideo} />
      )}

      {(state.status === 'ready' || state.status === 'created') && (
        <NoteModeToggle />
      )}

      {state.status === 'ready' && (
        <section className="px-5 pb-5 pt-5">
          <div className="overflow-hidden rounded-[20px] border border-[#e8e7ed] bg-[#fafafd]">
            <div className="relative aspect-video overflow-hidden bg-[#e8e7ee]">
              <VideoThumbnail
                className="size-full object-cover"
                src={state.video.thumbnailUrl}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
              <span className="absolute bottom-3 right-3 rounded-lg bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">
                {formatDuration(state.video.durationSeconds)}
              </span>
            </div>
            <div className="p-4">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-600">
                <span className="size-1.5 rounded-full bg-[#2dab61]" />
                Video detected
              </div>
              <h1 className="line-clamp-2 text-[16px] font-semibold leading-5 tracking-[-0.02em] text-ink">
                {state.video.title}
              </h1>
              {state.video.channelName && (
                <p className="mt-1.5 truncate text-xs text-muted">
                  {state.video.channelName}
                </p>
              )}
            </div>
          </div>

          {state.duplicates.length > 0 && !allowDuplicate && (
            <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50 p-4">
              <div className="flex items-start gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-white text-brand-600">
                  <BookOpen size={15} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-brand-700">
                    {repairTarget
                      ? 'Saved duration needs repair'
                      : 'Already in your library'}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-[#6e659c]">
                    {repairTarget
                      ? `The old course used ${formatDuration(
                          repairTarget.durationSeconds,
                        )}, but the video reports ${formatDuration(
                          state.video.durationSeconds,
                        )}. Repairing resets its incorrect progress.`
                      : 'You can open the existing course or create a separate plan.'}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  className="rounded-xl bg-brand-500 px-3 py-2 text-[11px] font-semibold text-white"
                  disabled={isSaving}
                  onClick={() => {
                    if (repairTarget) {
                      void handleRepairCourse();
                    } else {
                      void openDashboard(state.duplicates[0]?.id);
                    }
                  }}
                  type="button"
                >
                  {repairTarget
                    ? isSaving
                      ? 'Repairing…'
                      : 'Repair course'
                    : 'Open existing'}
                </button>
                <button
                  className="rounded-xl border border-brand-100 bg-white px-3 py-2 text-[11px] font-semibold text-brand-700"
                  onClick={() => {
                    setAllowDuplicate(true);
                    setActionError(null);
                  }}
                  type="button"
                >
                  Create another
                </button>
              </div>
            </div>
          )}

          {state.duplicates.length > 0 && (
            <PopupVideoNotes courses={state.duplicates} />
          )}

          <div className="mt-5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-ink">
                Study per day
              </label>
              <span className="flex items-center gap-1 text-[11px] text-muted">
                <Clock3 size={12} />
                {estimatedDays} {estimatedDays === 1 ? 'day' : 'days'}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-5 gap-2">
              {SESSION_LENGTHS.map((length) => (
                <button
                  className={`rounded-xl border py-2 text-xs font-semibold transition ${
                    !customLength && sessionLength === length
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-[#e7e7ec] text-[#747683] hover:border-brand-100 hover:bg-brand-50'
                  }`}
                  key={length}
                  onClick={() => {
                    setSessionLength(length);
                    setCustomLength('');
                  }}
                  type="button"
                >
                  {length}
                </button>
              ))}
            </div>

            <div className="relative mt-2">
              <input
                className="h-10 w-full rounded-xl border border-[#e7e7ec] bg-[#fafafd] px-3 pr-20 text-xs text-ink placeholder:text-[#a2a3ac] focus:border-brand-500 focus:bg-white focus:outline-none"
                inputMode="numeric"
                max={720}
                min={1}
                onChange={(event) => setCustomLength(event.target.value)}
                placeholder="Or enter a custom duration"
                type="number"
                value={customLength}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted">
                minutes
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl bg-[#f7f7fa] px-3.5 py-3">
            <span className="text-xs text-muted">Your learning plan</span>
            <span className="text-xs font-semibold text-ink">
              {estimatedDays} focused sessions
            </span>
          </div>

          <PrimaryButton
            className="mt-4 w-full"
            disabled={isSaving}
            icon={
              isSaving ? (
                <LoaderCircle className="animate-spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )
            }
            onClick={() => void handleCreateCourse()}
          >
            {isSaving ? 'Creating course…' : 'Create course'}
          </PrimaryButton>

          {allowDuplicate && (
            <button
              className="mt-3 flex w-full items-center justify-center gap-1.5 text-[11px] font-semibold text-muted hover:text-ink"
              onClick={() => setAllowDuplicate(false)}
              type="button"
            >
              <ArrowLeft size={12} />
              Cancel duplicate
            </button>
          )}

          {actionError && <InlineError message={actionError} />}
        </section>
      )}

      {state.status === 'created' && (
        <>
          <CreatedState
            course={state.course}
            error={actionError}
            onOpenDashboard={openDashboard}
            onStart={openSession}
            isStarting={isStarting}
          />
          <div className="px-5 pb-5">
            <PopupVideoNotes courses={[state.course]} />
          </div>
        </>
      )}
    </main>
  );
}

function LoadingState() {
  return (
    <section className="grid min-h-[350px] place-items-center px-6 text-center">
      <div>
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <LoaderCircle className="animate-spin" size={22} />
        </div>
        <h1 className="mt-4 text-base font-semibold text-ink">
          Reading this video
        </h1>
        <p className="mt-2 text-xs leading-5 text-muted">
          Darb is checking the title, duration, and channel.
        </p>
      </div>
    </section>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => Promise<void>;
}) {
  return (
    <section className="px-5 pb-6 pt-5">
      <div className="relative overflow-hidden rounded-[22px] bg-[#222127] px-5 py-7 text-white">
        <div className="grid size-11 place-items-center rounded-2xl bg-white/10">
          <Play fill="currentColor" size={18} />
        </div>
        <h1 className="mt-5 text-[22px] font-semibold leading-tight tracking-[-0.035em]">
          Open a YouTube, HackerTube, X, or Facebook video to begin.
        </h1>
        <p className="mt-3 text-xs leading-5 text-white/58">{message}</p>
      </div>

      <button
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#e5e5eb] bg-white text-xs font-semibold text-ink transition hover:bg-[#f8f8fb]"
        onClick={() => void onRetry()}
        type="button"
      >
        <RefreshCw size={15} />
        Try again
      </button>

      <div className="mt-4 flex items-start gap-3 rounded-2xl bg-success-50 p-4">
        <ShieldCheck className="mt-0.5 shrink-0 text-success-600" size={17} />
        <p className="text-[11px] leading-4 text-[#4e755d]">
          Video details and progress stay in this browser. Darb never downloads
          or rehosts the video.
        </p>
      </div>
    </section>
  );
}

function NoteModeToggle() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void browser.runtime
      .sendMessage({ type: 'DARB_NOTE_MODE', action: {} })
      .then((r) => {
        if (r?.ok) setEnabled(r.enabled === true);
      })
      .catch(() => undefined);
  }, []);
  return (
    <section className="mx-5 mt-4 rounded-xl border border-[#e5e5eb] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold">Floating note mode</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={busy}
          className="rounded-lg border border-brand-500 px-3 py-2 text-xs font-semibold text-brand-700"
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const r = await browser.runtime.sendMessage({
                type: 'DARB_NOTE_MODE',
                action: { enabled: !enabled },
              });
              if (!r?.ok)
                throw new Error(r?.error ?? 'Unable to change note mode.');
              setEnabled(r.enabled === true);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : 'Unable to change note mode.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {enabled ? 'On — turn off' : 'Off — turn on'}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Show a notes bubble on supported video pages while you watch.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}

function PopupVideoNotes({ courses }: { courses: Course[] }) {
  const [courseId, setCourseId] = useState(courses[0]!.id);
  const course = courses.find((item) => item.id === courseId) ?? courses[0]!;
  const openMaterial = async (id: string) => {
    const url = new URL(browser.runtime.getURL('/dashboard.html'));
    if (id.startsWith('course:')) url.searchParams.set('course', id.slice(7));
    else {
      url.searchParams.set('section', 'library');
      url.searchParams.set('item', id);
    }
    await browser.tabs.create({ url: url.toString() });
    window.close();
  };
  return (
    <WorkspaceProvider>
      {courses.length > 1 && (
        <label className="mt-4 block text-xs">
          Notes for course plan
          <select
            className="mt-2 block w-full rounded-lg border p-2"
            value={course.id}
            onChange={(e) => setCourseId(e.target.value)}
          >
            {courses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · {item.sessionLengthMinutes} min/session
              </option>
            ))}
          </select>
        </label>
      )}
      <CourseNotes
        key={course.id}
        course={course}
        compact
        onOpen={(id) => void openMaterial(id)}
      />
    </WorkspaceProvider>
  );
}

function CreatedState({
  course,
  error,
  onOpenDashboard,
  onStart,
  isStarting,
}: {
  course: Course;
  error: string | null;
  onOpenDashboard: (courseId?: string) => Promise<void>;
  onStart: (courseId: string) => Promise<void>;
  isStarting: boolean;
}) {
  return (
    <section className="px-5 pb-6 pt-6">
      <div className="rounded-[22px] bg-[#222127] px-5 py-7 text-white">
        <div className="grid size-12 place-items-center rounded-2xl bg-[#72d598] text-[#153c25]">
          <Check size={23} strokeWidth={2.7} />
        </div>
        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
          Course ready
        </p>
        <h1 className="mt-2 line-clamp-2 text-[22px] font-semibold leading-tight tracking-[-0.035em]">
          {course.title}
        </h1>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/[0.07] p-3">
            <p className="text-lg font-semibold">{course.sessions.length}</p>
            <p className="mt-0.5 text-[10px] text-white/45">daily sessions</p>
          </div>
          <div className="rounded-xl bg-white/[0.07] p-3">
            <p className="text-lg font-semibold">
              {course.sessionLengthMinutes}m
            </p>
            <p className="mt-0.5 text-[10px] text-white/45">per session</p>
          </div>
        </div>
      </div>

      <PrimaryButton
        className="mt-4 w-full"
        icon={
          isStarting ? (
            <LoaderCircle className="animate-spin" size={15} />
          ) : (
            <Play fill="currentColor" size={15} />
          )
        }
        disabled={isStarting}
        aria-busy={isStarting}
        onClick={() => void onStart(course.id)}
      >
        {isStarting ? 'Starting session…' : 'Start first session'}
      </PrimaryButton>
      <button
        className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#e5e5eb] text-xs font-semibold text-ink transition hover:bg-[#f8f8fb]"
        onClick={() => void onOpenDashboard(course.id)}
        type="button"
      >
        View course plan
        <ArrowRight size={14} />
      </button>
      {error && <InlineError message={error} />}
    </section>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-[11px] font-medium leading-4 text-red-700">
      <AlertCircle className="mt-0.5 shrink-0" size={14} />
      {message}
    </p>
  );
}

function hasDurationMismatch(course: Course, video: VideoMetadata): boolean {
  const difference = Math.abs(course.durationSeconds - video.durationSeconds);
  return difference > Math.max(5, video.durationSeconds * 0.01);
}
