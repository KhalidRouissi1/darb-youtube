import { create } from 'zustand';
import { browser } from 'wxt/browser';
import { courseRepository } from '@/lib/storage/repository';
import { setSessionCompletion } from '@/lib/utils/courses';
import type { Course } from '@/types/course';

interface CourseStore {
  courses: Course[];
  error: string | null;
  loading: boolean;
  loadCourses: () => Promise<void>;
  deleteCourse: (courseId: string) => Promise<void>;
  setSessionCompleted: (
    courseId: string,
    sessionId: string,
    completed: boolean,
  ) => Promise<void>;
}

export const useCourseStore = create<CourseStore>((set, get) => ({
  courses: [],
  error: null,
  loading: true,

  loadCourses: async () => {
    set({ loading: true, error: null });

    try {
      const courses = await courseRepository.getCourses();
      set({
        courses: courses.sort((first, second) =>
          second.updatedAt.localeCompare(first.updatedAt),
        ),
        loading: false,
      });
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to load saved courses.',
        loading: false,
      });
    }
  },

  deleteCourse: async (courseId) => {
    const response = await browser.runtime.sendMessage({ type: 'DELETE_COURSE', courseId });
    if (!response?.ok) throw new Error(response?.error ?? 'Unable to delete this course.');
    set({
      courses: get().courses.filter((course) => course.id !== courseId),
    });
  },

  setSessionCompleted: async (
    courseId,
    sessionId,
    completed,
  ) => {
    const course = get().courses.find(
      (candidate) => candidate.id === courseId,
    );
    if (!course) {
      throw new Error('This course no longer exists.');
    }

    const response = await browser.runtime.sendMessage({ type: 'SET_SESSION_COMPLETION', courseId, sessionId, completed });
    if (!response?.ok) throw new Error(response?.error ?? 'Unable to update this session.');
    const updated = setSessionCompletion(course, sessionId, completed);

    set({
      courses: get().courses.map((candidate) =>
        candidate.id === courseId ? updated : candidate,
      ),
    });
  },
}));
