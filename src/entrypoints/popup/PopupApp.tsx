import { useEffect, useMemo, useState } from 'react';
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
import {
  courseRepository,
  getSettings,
} from '@/lib/storage/repository';
import {
  createCourse,
  rebuildCourseFromVideo,
} from '@/lib/utils/courses';
import { formatDuration } from '@/lib/utils/time';
import type { Course } from '@/types/course';
import type { YouTubeVideoMetadata } from '@/types/youtube';

const SESSION_LENGTHS = [15, 20, 30, 45, 60] as const;

type PopupState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      video: YouTubeVideoMetadata;
      duplicates: Course[];
    }
  | { status: 'created'; course: Course };

export function PopupApp() {
  const [state, setState] = useState<PopupState>({ status: 'loading' });
  const [sessionLength, setSessionLength] = useState(30);
  const [customLength, setCustomLength] = useState('');
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const detectVideo = async () => {
    setState({ status: 'loading' });
    setActionError(null);
    setAllowDuplicate(false);

    try {
      const settings = await getSettings();
      setSessionLength(settings.defaultSessionLengthMinutes);

      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab?.id || !isStandardYouTubeWatchUrl(tab.url)) {
        await openDashboard();
        return;
      }

      const response = await browser.tabs.sendMessage<
        { type: 'GET_VIDEO_METADATA' },
        VideoMetadataResponse
      >(tab.id, { type: 'GET_VIDEO_METADATA' });

      if (!response?.ok) {
        setState({
          status: 'error',
          message:
            response?.error ??
            'Darb could not connect to this video. Reload the YouTube tab and try again.',
        });
        return;
      }

      const duplicates = await courseRepository.findByVideoId(
        response.video.videoId,
      );
      setState({
        status: 'ready',
        video: response.video,
        duplicates,
      });
    } catch {
      setState({
        status: 'error',
        message:
          'Darb could not connect to this tab. Reload the YouTube page and try again.',
      });
    }
  };

  useEffect(() => {
    void detectVideo();
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
      ? Math.ceil(
          state.video.durationSeconds / (effectiveSessionLength * 60),
        )
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
      const repairedCourse = rebuildCourseFromVideo(
        repairTarget,
        state.video,
      );
      const response = await browser.runtime.sendMessage<
        { type: 'REPAIR_COURSE'; course: Course },
        RuntimeMessageResponse
      >({ type: 'REPAIR_COURSE', course: repairedCourse });
      if (!response?.ok) {
        throw new Error(response?.error ?? 'Darb could not repair this course.');
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
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const response = await browser.runtime.sendMessage<
      { type: 'OPEN_SESSION'; courseId: string; sourceTabId?: number },
      RuntimeMessageResponse
    >({
      type: 'OPEN_SESSION',
      courseId,
      ...(tab?.id !== undefined ? { sourceTabId: tab.id } : {}),
    });

    if (response?.ok) {
      window.close();
    } else {
      setActionError(response?.error ?? 'Unable to open this session.');
    }
  };

  return (
    <main className="max-h-[600px] w-[390px] overflow-y-auto bg-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-black/5 bg-white/95 px-5 py-4 backdrop-blur">
        <DarbLogo />
        <button
          aria-label="Open dashboard"
          className="grid size-9 place-items-center rounded-xl bg-[#f3f2f8] text-[#5f6070] transition hover:bg-brand-50 hover:text-brand-600"
          onClick={() => void openDashboard()}
          type="button"
        >
          <LayoutDashboard size={17} strokeWidth={2.2} />
        </button>
      </header>

      {state.status === 'loading' && <LoadingState />}

      {state.status === 'error' && (
        <ErrorState message={state.message} onRetry={detectVideo} />
      )}

      {state.status === 'ready' && (
        <section className="px-5 pb-5 pt-5">
          <div className="overflow-hidden rounded-[20px] border border-[#e8e7ed] bg-[#fafafd]">
            <div className="relative aspect-video overflow-hidden bg-[#e8e7ee]">
              <img
                alt=""
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
                        )}, but YouTube reports ${formatDuration(
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
        <CreatedState
          course={state.course}
          error={actionError}
          onOpenDashboard={openDashboard}
          onStart={openSession}
        />
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
          Open a YouTube course to begin.
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
          Video details and progress stay in this browser. Darb never
          downloads or rehosts the video.
        </p>
      </div>
    </section>
  );
}

function CreatedState({
  course,
  error,
  onOpenDashboard,
  onStart,
}: {
  course: Course;
  error: string | null;
  onOpenDashboard: (courseId?: string) => Promise<void>;
  onStart: (courseId: string) => Promise<void>;
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
        icon={<Play fill="currentColor" size={15} />}
        onClick={() => void onStart(course.id)}
      >
        Start first session
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

function hasDurationMismatch(
  course: Course,
  video: YouTubeVideoMetadata,
): boolean {
  const difference = Math.abs(
    course.durationSeconds - video.durationSeconds,
  );
  return difference > Math.max(5, video.durationSeconds * 0.01);
}

function isStandardYouTubeWatchUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com')) &&
      url.pathname === '/watch' && Boolean(url.searchParams.get('v'));
  } catch { return false; }
}
