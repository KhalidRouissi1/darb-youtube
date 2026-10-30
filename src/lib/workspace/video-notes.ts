import { courseRepository } from '@/lib/storage/repository';
import { readWorkspace, workspaceAction } from './repository';
import { sameVideo, type VideoIdentity } from '@/lib/video/platforms';
import { z } from 'zod';
const requestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('read') }),
  z.object({
    op: z.literal('save'),
    videoId: z.string(),
    body: z.string().trim().min(1).max(100000),
    seconds: z.number().finite().nonnegative(),
  }),
]);
/** Called only after the background validates the current top-level video tab. */
export async function videoNotesAction(identity: VideoIdentity, raw: unknown) {
  const request = requestSchema.parse(raw);
  if (request.op === 'save' && request.videoId !== identity.videoId)
    throw new Error(
      'The video changed. Reopen your note on the current video.',
    );
  const courses = await courseRepository.getCourses();
  const course = courses
    .filter((c) => sameVideo(c, identity))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!course) return { needsCourse: true, notes: [] };
  let workspace = await readWorkspace();
  if (request.op === 'save')
    workspace = await workspaceAction({
      op: 'note.save',
      revision: workspace.revision,
      title: request.body.split('\n')[0]!.slice(0, 200),
      body: request.body,
      seconds: request.seconds,
      courseId: course.id,
      linkedIds: [`course:${course.id}`],
    });
  const courseIds = new Set(
    courses.filter((c) => sameVideo(c, identity)).map((c) => c.id),
  );
  return {
    courseId: course.id,
    title: course.title,
    notes: workspace.notes
      .filter((note) => note.courseId && courseIds.has(note.courseId))
      .map(({ id, title, body, seconds }) => ({ id, title, body, seconds })),
  };
}
