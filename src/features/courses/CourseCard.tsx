import {
  BookOpen,
  Clock3,
  ListVideo,
  Play,
  Trash2,
} from 'lucide-react';
import { calculateCourseProgress, getCourseStatus, getCurrentSession } from '@/lib/utils/courses';
import { formatDuration, formatTimestamp } from '@/lib/utils/time';
import type { Course } from '@/types/course';

interface CourseCardProps {
  course: Course;
  onContinue: (courseId: string) => void;
  onDelete: (course: Course) => void;
  onView: (courseId: string) => void;
}

const STATUS_LABELS = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
} as const;

export function CourseCard({
  course,
  onContinue,
  onDelete,
  onView,
}: CourseCardProps) {
  const progress = calculateCourseProgress(course);
  const status = getCourseStatus(course);
  const currentSession = getCurrentSession(course);

  return (
    <article className="group overflow-hidden rounded-[20px] border border-[#e5e5eb] bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(37,37,54,0.1)] dark:border-white/10 dark:bg-[#202028]">
      <button
        className="relative block aspect-[16/9] w-full overflow-hidden bg-[#e6e5eb] text-left"
        onClick={() => onView(course.id)}
        type="button"
      >
        <img
          alt=""
          className="size-full object-cover transition duration-500 group-hover:scale-[1.025]"
          src={course.thumbnailUrl}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/5" />
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold ${
            status === 'completed'
              ? 'bg-[#dff7e7] text-[#277a45]'
              : 'bg-white/90 text-[#555664]'
          }`}
        >
          {STATUS_LABELS[status]}
        </span>
        <span className="absolute bottom-3 right-3 rounded-lg bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">
          {formatDuration(course.durationSeconds)}
        </span>
      </button>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 tracking-[-0.015em] text-ink dark:text-white">
              {course.title}
            </h2>
            <p className="mt-1 truncate text-[11px] text-muted dark:text-white/45">
              {course.channelName ?? 'YouTube course'}
            </p>
          </div>
          <button
            aria-label={`Delete ${course.title}`}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-[#8c8782] transition hover:bg-red-50 hover:text-red-600"
            onClick={() => onDelete(course)}
            type="button"
          >
            <Trash2 size={14} />
          </button>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#ececf1] dark:bg-white/10">
          <div
            className={`h-full rounded-full ${
              status === 'completed' ? 'bg-[#3aa765]' : 'bg-brand-500'
            }`}
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted dark:text-white/45">
          <span>
            {progress.completedSessions} of {progress.totalSessions} sessions
          </span>
          <span className="font-semibold text-ink dark:text-white">
            {progress.percentage}%
          </span>
        </div>

        {!course.completed && (
          <p className="mt-3 text-xs font-semibold text-ink dark:text-white">
            Session {currentSession.index + 1} of {course.sessions.length}
            <span className="font-normal text-muted dark:text-white/45">
              {' '}· Resume at {formatTimestamp(currentSession.resumeSeconds ?? currentSession.startSeconds)}
            </span>
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 px-3 text-xs font-semibold text-white transition hover:bg-brand-600"
            onClick={() => onContinue(course.id)}
            type="button"
          >
            <Play fill="currentColor" size={13} />
            {course.completed
              ? 'Review course'
              : `Resume session ${currentSession.index + 1}`}
          </button>
          <button
            aria-label={`View sessions for ${course.title}`}
            className="grid size-10 place-items-center rounded-xl border border-[#e5e5eb] text-[#737582] transition hover:bg-[#f6f6f9] dark:border-white/10 dark:text-white/55 dark:hover:bg-white/5"
            onClick={() => onView(course.id)}
            type="button"
          >
            <ListVideo size={17} />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3 border-t border-[#eeeeF2] pt-3 text-[10px] text-muted dark:border-white/8 dark:text-white/40">
          <span className="flex items-center gap-1">
            <Clock3 size={11} />
            {course.sessionLengthMinutes} min/day
          </span>
          <span className="flex items-center gap-1">
            <BookOpen size={11} />
            {formatDuration(progress.remainingSeconds)} left
          </span>
        </div>
      </div>
    </article>
  );
}
