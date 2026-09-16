import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  History,
  LayoutGrid,
  LoaderCircle,
  Play,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import { DarbLogo } from '@/components/brand/DarbLogo';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { CourseCard } from '@/features/courses/CourseCard';
import { CourseDetail } from '@/features/courses/CourseDetail';
import { useCourseStore } from '@/features/courses/course-store';
import { SettingsPanel } from '@/features/settings/SettingsPanel';
import type { RuntimeMessageResponse } from '@/lib/messaging/messages';
import { getSettings } from '@/lib/storage/repository';
import { STORAGE_KEYS } from '@/lib/storage/keys';
import {
  calculateCourseProgress,
  getCourseStatus,
  getCurrentSession,
} from '@/lib/utils/courses';
import { formatDuration, formatTimestamp } from '@/lib/utils/time';
import type { Course } from '@/types/course';

type DashboardSection = 'courses' | 'today' | 'activity' | 'settings';
type CourseFilter = 'all' | 'in-progress' | 'completed';

const navItems: {
  label: string;
  section: DashboardSection;
  icon: typeof LayoutGrid;
}[] = [
  { label: 'Courses', section: 'courses', icon: LayoutGrid },
  { label: 'Today', section: 'today', icon: CalendarDays },
  { label: 'Activity', section: 'activity', icon: History },
];

export function DashboardApp() {
  const { courses, error, loading, loadCourses, deleteCourse, setSessionCompleted } =
    useCourseStore();
  const [section, setSection] = useState<DashboardSection>('courses');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('course'),
  );
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CourseFilter>('all');
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void loadCourses();
    void getSettings().then((settings) => {
      document.documentElement.classList.toggle('dark', settings.darkMode);
    });

    const handleStorageChange: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, areaName) => {
      if (areaName === 'local' && STORAGE_KEYS.courses in changes) {
        void loadCourses();
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [loadCourses]);

  const selectedCourse =
    courses.find((course) => course.id === selectedCourseId) ?? null;

  const filteredCourses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return courses.filter((course) => {
      const matchesQuery =
        !normalizedQuery ||
        course.title.toLowerCase().includes(normalizedQuery) ||
        course.channelName?.toLowerCase().includes(normalizedQuery);
      const status = getCourseStatus(course);
      const matchesFilter =
        filter === 'all' ||
        (filter === 'in-progress'
          ? status === 'in-progress' || status === 'not-started'
          : status === 'completed');

      return matchesQuery && matchesFilter;
    });
  }, [courses, filter, query]);

  const totals = useMemo(
    () =>
      courses.reduce(
        (summary, course) => {
          const progress = calculateCourseProgress(course);
          return {
            sessions: summary.sessions + progress.completedSessions,
            watchedSeconds:
              summary.watchedSeconds + progress.watchedSeconds,
          };
        },
        { sessions: 0, watchedSeconds: 0 },
      ),
    [courses],
  );

  const openCourse = (courseId: string) => {
    setSelectedCourseId(courseId);
    setSection('courses');
    const url = new URL(window.location.href);
    url.searchParams.set('course', courseId);
    window.history.replaceState(null, '', url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeCourse = () => {
    setSelectedCourseId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('course');
    window.history.replaceState(null, '', url);
  };

  const navigate = (nextSection: DashboardSection) => {
    setSection(nextSection);
    closeCourse();
    setActionError(null);
  };

  const openSession = async (courseId: string, sessionId?: string) => {
    setActionError(null);

    const response = await browser.runtime.sendMessage<
      { type: 'OPEN_SESSION'; courseId: string; sessionId?: string },
      RuntimeMessageResponse
    >({
      type: 'OPEN_SESSION',
      courseId,
      ...(sessionId ? { sessionId } : {}),
    });

    if (!response?.ok) {
      setActionError(response?.error ?? 'Unable to open this session.');
    }
  };

  const restartSession = async (courseId: string, sessionId: string) => {
    setActionError(null);
    const response = await browser.runtime.sendMessage<
      { type: 'OPEN_SESSION'; courseId: string; sessionId: string; restart: boolean },
      RuntimeMessageResponse
    >({ type: 'OPEN_SESSION', courseId, sessionId, restart: true });
    if (!response?.ok) setActionError(response?.error ?? 'Unable to restart this session.');
  };

  const toggleSession = async (
    courseId: string,
    sessionId: string,
    completed: boolean,
  ) => {
    setActionError(null);

    try {
      await setSessionCompleted(courseId, sessionId, completed);
    } catch (toggleError) {
      setActionError(
        toggleError instanceof Error
          ? toggleError.message
          : 'Unable to update this session.',
      );
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await deleteCourse(deleteTarget.id);
      if (selectedCourseId === deleteTarget.id) {
        closeCourse();
      }
      setDeleteTarget(null);
    } catch {
      setActionError('Unable to delete this course.');
      setDeleteTarget(null);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink dark:bg-[#15151b] dark:text-white lg:grid lg:grid-cols-[244px_1fr]">
      <aside className="hidden min-h-screen border-r border-black/[0.055] bg-white px-5 py-6 dark:border-white/8 dark:bg-[#1b1b22] lg:flex lg:flex-col">
        <div className="px-2">
          <DarbLogo />
        </div>

        <nav aria-label="Main navigation" className="mt-10 space-y-1.5">
          {navItems.map(({ icon: Icon, label, section: itemSection }) => {
            const active = section === itemSection && !selectedCourse;

            return (
              <button
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100'
                    : 'text-[#777986] hover:bg-[#f7f7fa] hover:text-ink dark:text-white/45 dark:hover:bg-white/5 dark:hover:text-white'
                }`}
                key={itemSection}
                onClick={() => navigate(itemSection)}
                type="button"
              >
                <Icon size={17} strokeWidth={active ? 2.3 : 2} />
                {label}
                {active && (
                  <span className="ml-auto size-1.5 rounded-full bg-brand-500" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="my-6 border-t border-[#eeeef2] dark:border-white/8" />

        <button
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            section === 'settings'
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100'
              : 'text-[#777986] hover:bg-[#f7f7fa] hover:text-ink dark:text-white/45 dark:hover:bg-white/5 dark:hover:text-white'
          }`}
          onClick={() => navigate('settings')}
          type="button"
        >
          <Settings size={17} />
          Settings
        </button>

        <div className="mt-auto rounded-2xl bg-[#222127] p-4 text-white">
          <div className="mb-3 grid size-8 place-items-center rounded-xl bg-white/10">
            <ShieldCheck size={16} />
          </div>
          <p className="text-xs font-semibold">Private by default</p>
          <p className="mt-1.5 text-[11px] leading-4 text-white/50">
            No account, analytics, or cloud. Your progress stays in this
            browser.
          </p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-black/[0.055] bg-white/90 backdrop-blur dark:border-white/8 dark:bg-[#1b1b22]/90">
          <div className="mx-auto flex h-[74px] max-w-[1240px] items-center gap-4 px-5 sm:px-8">
            <div className="lg:hidden">
              <DarbLogo compact />
            </div>

            <label className="relative hidden max-w-[360px] flex-1 sm:block">
              <span className="sr-only">Search courses</span>
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#999aa5]"
                size={16}
              />
              <input
                aria-label="Search courses"
                className="h-10 w-full rounded-xl border border-[#e8e8ed] bg-[#fafafd] pl-10 pr-4 text-sm text-ink placeholder:text-[#aaabb4] focus:border-brand-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                onChange={(event) => {
                  setQuery(event.target.value);
                  if (section !== 'courses') {
                    setSection('courses');
                  }
                }}
                placeholder="Search your courses"
                type="search"
                value={query}
              />
            </label>

            <div className="ml-auto flex items-center gap-2">
              <button
                aria-label="Notifications"
                className="grid size-10 place-items-center rounded-xl border border-[#e8e8ed] bg-white text-[#6e707d] transition hover:bg-[#f8f8fb] hover:text-ink dark:border-white/10 dark:bg-white/5 dark:text-white/55"
                onClick={() => navigate('settings')}
                type="button"
              >
                <Bell size={17} />
              </button>
              <button
                className="hidden min-h-10 items-center gap-2 rounded-xl bg-brand-500 px-3.5 text-xs font-semibold text-white transition hover:bg-brand-600 sm:inline-flex"
                onClick={() =>
                  void browser.tabs.create({
                    url: 'https://www.youtube.com/',
                  })
                }
                type="button"
              >
                <Plus size={15} />
                Add course
              </button>
            </div>
          </div>

          <nav
            aria-label="Mobile navigation"
            className="flex gap-1 overflow-x-auto border-t border-[#eeeef2] px-4 py-2 dark:border-white/8 lg:hidden"
          >
            {[...navItems, { label: 'Settings', section: 'settings' as const, icon: Settings }].map(
              ({ icon: Icon, label, section: itemSection }) => (
                <button
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold ${
                    section === itemSection
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100'
                      : 'text-muted dark:text-white/45'
                  }`}
                  key={itemSection}
                  onClick={() => navigate(itemSection)}
                  type="button"
                >
                  <Icon size={13} />
                  {label}
                </button>
              ),
            )}
          </nav>
        </header>

        <main className="mx-auto max-w-[1240px] px-5 py-8 sm:px-8 lg:py-10">
          {loading ? (
            <LoadingDashboard />
          ) : selectedCourse ? (
              <CourseDetail
              course={selectedCourse}
              error={actionError}
              onBack={closeCourse}
              onContinue={(courseId, sessionId) =>
                void openSession(courseId, sessionId)
              }
              onRestart={(courseId, sessionId) =>
                void restartSession(courseId, sessionId)
              }
              onToggleSession={(courseId, sessionId, completed) =>
                void toggleSession(courseId, sessionId, completed)
              }
            />
          ) : section === 'settings' ? (
            <SettingsPanel onReset={loadCourses} />
          ) : section === 'today' ? (
            <TodayView courses={courses} onContinue={openSession} />
          ) : section === 'activity' ? (
            <ActivityView courses={courses} />
          ) : (
            <CoursesView
              allCourses={courses}
              courses={filteredCourses}
              error={error ?? actionError}
              filter={filter}
              query={query}
              totals={totals}
              onContinue={openSession}
              onDelete={setDeleteTarget}
              onFilter={setFilter}
              onView={openCourse}
            />
          )}
        </main>
      </div>

      <ConfirmDialog
        description={
          deleteTarget
            ? `“${deleteTarget.title}” and all of its local progress will be removed. This cannot be undone.`
            : ''
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        open={deleteTarget !== null}
        title="Delete this course?"
      />
    </div>
  );
}

function CoursesView({
  allCourses,
  courses,
  error,
  filter,
  query,
  totals,
  onContinue,
  onDelete,
  onFilter,
  onView,
}: {
  allCourses: Course[];
  courses: Course[];
  error: string | null;
  filter: CourseFilter;
  query: string;
  totals: { sessions: number; watchedSeconds: number };
  onContinue: (courseId: string) => Promise<void>;
  onDelete: (course: Course) => void;
  onFilter: (filter: CourseFilter) => void;
  onView: (courseId: string) => void;
}) {
  const resumeCourse = [...allCourses]
    .filter((course) => !course.completed)
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))[0];

  return (
    <>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-brand-600">
            <Sparkles size={14} />
            Your learning space
          </div>
          <h1 className="text-[30px] font-bold tracking-[-0.045em] text-ink sm:text-[36px] dark:text-white">
            Courses
          </h1>
          <p className="mt-1.5 text-sm text-muted dark:text-white/45">
            Build steady progress, one focused session at a time.
          </p>
        </div>
        <PrimaryButton
          icon={<Plus size={17} strokeWidth={2.5} />}
          onClick={() =>
            void browser.tabs.create({
              url: 'https://www.youtube.com/',
            })
          }
        >
          Add from YouTube
        </PrimaryButton>
      </div>

      {resumeCourse && (
        <ContinuePanel course={resumeCourse} onContinue={onContinue} />
      )}

      <section
        aria-label="Learning overview"
        className="mt-8 grid overflow-hidden rounded-2xl border border-[#e8e8ed] bg-white shadow-card dark:border-white/10 dark:bg-[#202028] sm:grid-cols-3"
      >
        <Stat
          icon={<BookOpen size={17} />}
          label="Saved courses"
          value={String(allCourses.length)}
        />
        <Stat
          border
          icon={<CheckCircle2 size={17} />}
          label="Sessions completed"
          value={String(totals.sessions)}
        />
        <Stat
          border
          icon={<Clock3 size={17} />}
          label="Time learned"
          value={formatDuration(totals.watchedSeconds)}
        />
      </section>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-[#e6e6ec] bg-white p-1 dark:border-white/10 dark:bg-[#202028]">
          {(
            [
              ['all', 'All'],
              ['in-progress', 'In progress'],
              ['completed', 'Completed'],
            ] as const
          ).map(([value, label]) => (
            <button
              className={`rounded-lg px-3 py-2 text-[11px] font-semibold transition ${
                filter === value
                  ? 'bg-[#222127] text-white dark:bg-brand-500'
                  : 'text-muted hover:bg-[#f6f6f9] dark:text-white/45 dark:hover:bg-white/5'
              }`}
              key={value}
              onClick={() => onFilter(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted dark:text-white/40">
          {courses.length === allCourses.length
            ? `${courses.length} ${courses.length === 1 ? 'course' : 'courses'}`
            : `${courses.length} of ${allCourses.length} shown`}
        </p>
      </div>

      {courses.length > 0 ? (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <CourseCard
              course={course}
              key={course.id}
              onContinue={(courseId) => void onContinue(courseId)}
              onDelete={onDelete}
              onView={onView}
            />
          ))}
        </div>
      ) : (
        <EmptyCourses
          hasCourses={allCourses.length > 0}
          hasQuery={Boolean(query.trim())}
        />
      )}

      {error && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </>
  );
}

function ContinuePanel({
  course,
  onContinue,
}: {
  course: Course;
  onContinue: (courseId: string) => Promise<void>;
}) {
  const session = getCurrentSession(course);
  const resumeAt = session.resumeSeconds ?? session.startSeconds;

  return (
    <section className="mt-8 overflow-hidden rounded-[22px] bg-ink text-white shadow-[0_22px_60px_rgba(57,31,18,0.16)]">
      <div className="border-l-[6px] border-brand-500 px-6 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-100">
              Continue your path · Session {session.index + 1} of{' '}
              {course.sessions.length}
            </p>
            <h2 className="mt-2 line-clamp-2 text-[22px] font-bold leading-tight tracking-[-0.035em] sm:text-[27px]">
              {course.title}
            </h2>
            <p className="mt-2 text-sm text-white/55">
              Resume at {formatTimestamp(resumeAt)} ·{' '}
              {formatDuration(session.endSeconds - resumeAt)} left in this session
            </p>

            <div
              aria-label={`${calculateCourseProgress(course).completedSessions} of ${course.sessions.length} sessions completed`}
              className="mt-5 flex h-2 gap-1 overflow-hidden"
            >
              {course.sessions.map((item) => (
                <span
                  className={`min-w-1 flex-1 rounded-full ${
                    item.completed
                      ? 'bg-brand-500'
                      : item.id === session.id
                        ? 'bg-white'
                        : 'bg-white/15'
                  }`}
                  key={item.id}
                  title={`${item.title}${item.completed ? ' — completed' : ''}`}
                />
              ))}
            </div>
          </div>

          <button
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 text-sm font-bold text-white transition hover:bg-brand-600"
            onClick={() => void onContinue(course.id)}
            type="button"
          >
            <Play fill="currentColor" size={15} />
            Resume session {session.index + 1}
          </button>
        </div>
      </div>
    </section>
  );
}

function TodayView({
  courses,
  onContinue,
}: {
  courses: Course[];
  onContinue: (courseId: string, sessionId?: string) => Promise<void>;
}) {
  const activeCourses = courses.filter((course) => !course.completed);

  return (
    <section>
      <p className="text-xs font-semibold text-brand-600">Daily plan</p>
      <h1 className="mt-2 text-[32px] font-bold tracking-[-0.045em] text-ink dark:text-white">
        Today
      </h1>
      <p className="mt-2 text-sm text-muted dark:text-white/45">
        Your next incomplete session from each active course.
      </p>

      <div className="mt-8 space-y-3">
        {activeCourses.map((course) => {
          const session = getCurrentSession(course);
          return (
            <article
              className="flex flex-col gap-4 rounded-2xl border border-[#e5e5eb] bg-white p-5 shadow-card dark:border-white/10 dark:bg-[#202028] sm:flex-row sm:items-center"
              key={course.id}
            >
              <img
                alt=""
                className="h-20 w-full rounded-xl object-cover sm:w-32"
                src={course.thumbnailUrl}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-600">
                  {session.title}
                </p>
                <h2 className="mt-1 truncate text-sm font-semibold text-ink dark:text-white">
                  {course.title}
                </h2>
                <p className="mt-1 text-[11px] text-muted dark:text-white/45">
                  {formatTimestamp(session.startSeconds)} →{' '}
                  {formatTimestamp(session.endSeconds)}
                </p>
              </div>
              <button
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-xs font-semibold text-white"
                onClick={() => void onContinue(course.id, session.id)}
                type="button"
              >
                <Play fill="currentColor" size={13} />
                Start session
              </button>
            </article>
          );
        })}

        {activeCourses.length === 0 && (
          <EmptyMessage
            detail="Create a course from a YouTube video to see your daily session here."
            title="Nothing scheduled yet"
          />
        )}
      </div>
    </section>
  );
}

function ActivityView({ courses }: { courses: Course[] }) {
  const activity = courses
    .flatMap((course) =>
      course.sessions
        .filter((session) => session.completed && session.completedAt)
        .map((session) => ({
          course,
          session,
          completedAt: session.completedAt ?? '',
        })),
    )
    .sort((first, second) =>
      second.completedAt.localeCompare(first.completedAt),
    );

  return (
    <section>
      <p className="text-xs font-semibold text-brand-600">Learning history</p>
      <h1 className="mt-2 text-[32px] font-bold tracking-[-0.045em] text-ink dark:text-white">
        Activity
      </h1>
      <p className="mt-2 text-sm text-muted dark:text-white/45">
        A local history of every session you complete.
      </p>

      <div className="mt-8 overflow-hidden rounded-2xl border border-[#e5e5eb] bg-white dark:border-white/10 dark:bg-[#202028]">
        {activity.map(({ completedAt, course, session }) => (
          <div
            className="flex items-center gap-4 border-b border-[#eeeeF2] px-5 py-4 last:border-0 dark:border-white/8"
            key={`${course.id}-${session.id}`}
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-success-50 text-success-600 dark:bg-[#2b6c44]/20">
              <CheckCircle2 size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-ink dark:text-white">
                {course.title}
              </p>
              <p className="mt-1 text-[10px] text-muted dark:text-white/45">
                {session.title} ·{' '}
                {formatDuration(
                  session.endSeconds - session.startSeconds,
                )}
              </p>
            </div>
            <time className="text-[10px] text-muted dark:text-white/40">
              {new Intl.DateTimeFormat(undefined, {
                month: 'short',
                day: 'numeric',
              }).format(new Date(completedAt))}
            </time>
          </div>
        ))}

        {activity.length === 0 && (
          <EmptyMessage
            detail="Completed sessions will appear here automatically."
            title="No completed sessions yet"
          />
        )}
      </div>
    </section>
  );
}

function EmptyCourses({
  hasCourses,
  hasQuery,
}: {
  hasCourses: boolean;
  hasQuery: boolean;
}) {
  if (hasQuery || hasCourses) {
    return (
      <EmptyMessage
        detail="Try a different title or choose another filter."
        title="No courses match this view"
      />
    );
  }

  return (
    <section className="mt-5 overflow-hidden rounded-[24px] border border-[#e5e5eb] bg-white shadow-card dark:border-white/10 dark:bg-[#202028]">
      <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative overflow-hidden bg-[#222127] px-7 py-10 text-white sm:px-10 sm:py-12">
          <div className="relative max-w-[450px]">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/75">
              <Sparkles size={13} />
              Start here
            </span>
            <h2 className="mt-6 text-[30px] font-semibold leading-[1.1] tracking-[-0.045em] sm:text-[38px]">
              Turn “watch later” into learning today.
            </h2>
            <p className="mt-4 max-w-[410px] text-sm leading-6 text-white/55">
              Open an educational YouTube video, then click the Darb
              extension to choose your daily pace.
            </p>
            <button
              className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#25242b]"
              onClick={() =>
                void browser.tabs.create({
                  url: 'https://www.youtube.com/',
                })
              }
              type="button"
            >
              <ExternalLink size={15} />
              Open YouTube
            </button>
          </div>
        </div>

        <div className="px-7 py-8 sm:px-9 sm:py-10">
          <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#9697a2]">
            Three simple steps
          </p>
          <ol className="mt-6 space-y-6">
            {[
              ['01', 'Open a long YouTube course'],
              ['02', 'Click Darb and choose your pace'],
              ['03', 'Create the course and start learning'],
            ].map(([number, text]) => (
              <li className="flex items-center gap-4" key={number}>
                <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-[11px] font-bold text-brand-600 dark:bg-brand-500/15 dark:text-brand-100">
                  {number}
                </span>
                <span className="text-xs font-semibold text-ink dark:text-white">
                  {text}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function EmptyMessage({
  detail,
  title,
}: {
  detail: string;
  title: string;
}) {
  return (
    <div className="grid min-h-[220px] place-items-center px-6 py-10 text-center">
      <div>
        <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-100">
          <BookOpen size={19} />
        </div>
        <h2 className="mt-4 text-sm font-semibold text-ink dark:text-white">
          {title}
        </h2>
        <p className="mt-2 text-xs text-muted dark:text-white/45">{detail}</p>
      </div>
    </div>
  );
}

function Stat({
  border = false,
  icon,
  label,
  value,
}: {
  border?: boolean;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className={`flex items-center gap-4 px-5 py-5 sm:px-6 ${
        border
          ? 'border-t border-[#ececf1] sm:border-l sm:border-t-0 dark:border-white/8'
          : ''
      }`}
    >
      <div className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-100">
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold tracking-[-0.03em] text-ink dark:text-white">
          {value}
        </p>
        <p className="mt-0.5 text-xs text-muted dark:text-white/45">{label}</p>
      </div>
    </div>
  );
}

function LoadingDashboard() {
  return (
    <div className="grid min-h-[480px] place-items-center">
      <div className="text-center">
        <LoaderCircle
          className="mx-auto animate-spin text-brand-500"
          size={24}
        />
        <p className="mt-3 text-xs text-muted dark:text-white/45">
          Loading your courses…
        </p>
      </div>
    </div>
  );
}
