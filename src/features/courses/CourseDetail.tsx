import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  Play,
  RotateCcw,
} from 'lucide-react';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { calculateCourseProgress } from '@/lib/utils/courses';
import { formatDuration, formatTimestamp } from '@/lib/utils/time';
import type { Course } from '@/types/course';

interface CourseDetailProps {
  course: Course;
  error: string | null;
  onBack: () => void;
  onContinue: (courseId: string, sessionId?: string) => void;
  onRestart: (courseId: string, sessionId: string) => void;
  onToggleSession: (
    courseId: string,
    sessionId: string,
    completed: boolean,
  ) => void;
}

export function CourseDetail({
  course,
  error,
  onBack,
  onContinue,
  onRestart,
  onToggleSession,
}: CourseDetailProps) {
  const progress = calculateCourseProgress(course);

  return (
    <div>
      <button
        className="mb-6 inline-flex items-center gap-2 text-xs font-semibold text-muted transition hover:text-ink dark:text-white/50 dark:hover:text-white"
        onClick={onBack}
        type="button"
      >
        <ArrowLeft size={15} />
        Back to courses
      </button>

      <section className="overflow-hidden rounded-[24px] border border-[#e5e5eb] bg-white shadow-card dark:border-white/10 dark:bg-[#202028]">
        <div className="grid lg:grid-cols-[360px_1fr]">
          <div className="relative min-h-[220px] overflow-hidden bg-[#dddde5]">
            <img
              alt=""
              className="absolute inset-0 size-full object-cover"
              src={course.thumbnailUrl}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
            <span className="absolute bottom-4 left-4 rounded-lg bg-black/70 px-2.5 py-1.5 text-[11px] font-semibold text-white">
              {formatDuration(course.durationSeconds)}
            </span>
          </div>

          <div className="p-6 sm:p-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600">
              {course.completed ? 'Course completed' : 'YouTube course'}
            </p>
            <h1 className="mt-2 max-w-[700px] text-[25px] font-bold leading-tight tracking-[-0.04em] text-ink sm:text-[30px] dark:text-white">
              {course.title}
            </h1>
            <p className="mt-2 text-xs text-muted dark:text-white/45">
              {course.channelName ?? 'YouTube'} · {course.sessions.length}{' '}
              sessions · {course.sessionLengthMinutes} min/day
            </p>

            <div className="mt-6 h-2 overflow-hidden rounded-full bg-[#ececf2] dark:bg-white/10">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted dark:text-white/45">
              <span>
                {progress.completedSessions} of {progress.totalSessions}{' '}
                sessions complete
              </span>
              <span className="font-semibold text-ink dark:text-white">
                {progress.percentage}%
              </span>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <PrimaryButton
                icon={<Play fill="currentColor" size={14} />}
                onClick={() => onContinue(course.id)}
              >
                {course.completed ? 'Review last session' : 'Continue learning'}
              </PrimaryButton>
              <a
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5eb] px-4 text-xs font-semibold text-ink transition hover:bg-[#f8f8fb] dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                href={course.videoUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open on YouTube
                <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <ProgressStat
          label="Completed content"
          value={formatDuration(progress.watchedSeconds)}
        />
        <ProgressStat
          label="Remaining"
          value={formatDuration(progress.remainingSeconds)}
        />
        <ProgressStat
          label="Daily pace"
          value={`${course.sessionLengthMinutes} min`}
        />
      </div>

      <section className="mt-6 overflow-hidden rounded-[20px] border border-[#e5e5eb] bg-white dark:border-white/10 dark:bg-[#202028]">
        <div className="flex items-center justify-between border-b border-[#ececf1] px-5 py-4 dark:border-white/8">
          <div>
            <h2 className="text-sm font-semibold text-ink dark:text-white">
              Course sessions
            </h2>
            <p className="mt-1 text-[11px] text-muted dark:text-white/45">
              Open any session without changing completed progress.
            </p>
          </div>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-bold text-brand-600 dark:bg-brand-500/15 dark:text-brand-100">
            {course.sessions.length} total
          </span>
        </div>

        <div className="border-b border-[#ececf1] px-5 py-4 dark:border-white/8">
          <div aria-label="Course session progress" className="flex h-2 gap-1">
            {course.sessions.map((session) => (
              <span
                className={`min-w-1 flex-1 rounded-full ${
                  session.completed
                    ? 'bg-success-600'
                    : session.index === course.currentSessionIndex
                      ? 'bg-brand-500'
                      : 'bg-[#e5e1dd] dark:bg-white/12'
                }`}
                key={session.id}
                title={`${session.title}${session.completed ? ' — completed' : ''}`}
              />
            ))}
          </div>
        </div>

        <div className="divide-y divide-[#eeeeF2] dark:divide-white/8">
          {course.sessions.map((session) => {
            const isCurrent = session.index === course.currentSessionIndex;

            return (
              <div
                className={`flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center ${
                  isCurrent
                    ? 'bg-brand-50/60 dark:bg-brand-500/[0.07]'
                    : ''
                }`}
                key={session.id}
              >
                <div
                  className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                    session.completed
                      ? 'bg-success-50 text-success-600 dark:bg-[#2b6c44]/20'
                      : isCurrent
                        ? 'bg-brand-500 text-white'
                        : 'bg-[#f3f3f7] text-[#8a8b96] dark:bg-white/5 dark:text-white/45'
                  }`}
                >
                  {session.completed ? (
                    <Check size={16} strokeWidth={2.5} />
                  ) : (
                    <span className="text-[11px] font-bold">
                      {session.index + 1}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-ink dark:text-white">
                      {session.title}
                    </h3>
                    {isCurrent && (
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[9px] font-bold text-brand-700">
                        Current session
                      </span>
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-muted dark:text-white/45">
                    <Clock3 size={10} />
                    {formatTimestamp(session.startSeconds)} →{' '}
                    {formatTimestamp(session.endSeconds)}
                  </p>
                  {session.resumeSeconds !== undefined && !session.completed && (
                    <p className="mt-1 text-[10px] font-medium text-brand-600 dark:text-brand-100">
                      Resume at {formatTimestamp(session.resumeSeconds)}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[#e4e4ea] px-3 text-[10px] font-semibold text-ink transition hover:bg-[#f8f8fb] dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                    onClick={() =>
                      onContinue(course.id, session.id)
                    }
                    type="button"
                  >
                    <Play fill="currentColor" size={11} />
                    {session.resumeSeconds !== undefined && !session.completed ? 'Resume' : 'Open'}
                  </button>
                  {!session.completed && session.resumeSeconds !== undefined && (
                    <button
                      className="inline-flex min-h-9 items-center rounded-xl px-2 text-[10px] font-semibold text-muted hover:bg-[#f8f8fb] hover:text-ink dark:text-white/45 dark:hover:bg-white/5 dark:hover:text-white"
                      onClick={() => onRestart(course.id, session.id)}
                      type="button"
                    >
                      Restart
                    </button>
                  )}
                  <button
                    aria-label={
                      session.completed
                        ? `Mark ${session.title} incomplete`
                        : `Mark ${session.title} complete`
                    }
                    className={`grid size-9 place-items-center rounded-xl transition ${
                      session.completed
                        ? 'bg-success-50 text-success-600 hover:bg-red-50 hover:text-red-600 dark:bg-[#2b6c44]/20'
                        : 'border border-[#e4e4ea] text-[#9798a2] hover:border-brand-100 hover:bg-brand-50 hover:text-brand-600 dark:border-white/10'
                    }`}
                    onClick={() =>
                      onToggleSession(
                        course.id,
                        session.id,
                        !session.completed,
                      )
                    }
                    title={
                      session.completed
                        ? 'Mark incomplete'
                        : 'Mark complete'
                    }
                    type="button"
                  >
                    {session.completed ? (
                      <RotateCcw size={13} />
                    ) : (
                      <Circle size={14} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e5e5eb] bg-white p-5 dark:border-white/10 dark:bg-[#202028]">
      <div className="mb-3 grid size-8 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-100">
        <CheckCircle2 size={15} />
      </div>
      <p className="text-lg font-bold tracking-[-0.03em] text-ink dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted dark:text-white/45">{label}</p>
    </div>
  );
}
