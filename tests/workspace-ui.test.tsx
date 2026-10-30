import { PlaylistPanel } from '@/features/learning/LearningPanels';
import { learningAction } from '@/lib/learning/actions';
import { createPlaylist, initialLearningState } from '@/lib/learning/model';
import { writeLearning } from '@/lib/learning/repository';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceContext';
import { WorkspacePanel } from '@/features/workspace/WorkspacePanel';
import { WorkspaceFolders } from '@/features/workspace/WorkspaceFolders';
import { PopupApp } from '@/entrypoints/popup/PopupApp';
import { CourseNotes, NoteBody } from '@/features/workspace/Notes';
import { workspaceAction, readWorkspace } from '@/lib/workspace/repository';
import { courseRepository } from '@/lib/storage/repository';
import { readLearning } from '@/lib/learning/repository';
import { createCourse } from '@/lib/utils/courses';
import type { Course } from '@/types/course';
let dom: JSDOM;
let root: Root;
let course: Course;
beforeEach(async () => {
  dom = new JSDOM('<div id="app"></div>', { url: 'https://example.com' });
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    vi.stubGlobal(key, value);
  const { createRoot } = await import('react-dom/client');
  root = createRoot(document.getElementById('app')!);
  await browser.storage.local.clear();
  course = createCourse(
    {
      videoId: 'abcdefghijk',
      videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      title: 'JavaScript course',
      durationSeconds: 8000,
    },
    15,
  );
  course.currentSessionIndex = 7;
  course.sessions[7]!.resumeSeconds = 6500;
  await courseRepository.saveCourse(course);
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(
    async (message) => {
      const request = message as unknown as { type: string; action: unknown };
      if (request.type === 'DARB_WORKSPACE') {
        try {
          return { ok: true, data: await workspaceAction(request.action) };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      if (request.type === 'DARB_LEARNING')
        return { ok: true, data: await readLearning() };
      return { ok: true };
    },
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  dom.window.close();
});
async function mount(mode: 'library' | 'graph' = 'library') {
  await act(async () =>
    root.render(
      <WorkspaceProvider>
        <WorkspaceFolders onNavigate={() => undefined} />
        <WorkspacePanel
          courses={[course]}
          mode={mode}
          onOpenCourse={() => undefined}
          onOpenPlaylist={() => undefined}
        />
      </WorkspaceProvider>,
    ),
  );
}
function button(text: string) {
  const result = Array.from(
    document.querySelectorAll<HTMLButtonElement>('button'),
  ).find((b) => b.textContent?.trim() === text);
  if (!result) throw new Error('Missing button ' + text);
  return result;
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
}
async function fill(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  await act(async () => {
    const prototype =
      element.tagName === 'TEXTAREA'
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
async function select(element: HTMLSelectElement, value: string) {
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
}
it('organizes a real saved course through the library without changing its checkpoint', async () => {
  await mount();
  await click(button('JavaScript course'));
  await click(button('New folder'));
  const dialog = document.querySelector<HTMLFormElement>('form[role=dialog]')!;
  await fill(dialog.querySelector('input')!, 'Programming');
  await act(async () => {
    dialog.dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  expect(document.querySelector('form[role=dialog]')).toBeNull();
  const folder = (await readWorkspace()).folders[0]!;
  await select(
    document.querySelector<HTMLSelectElement>('.ws-inspector select')!,
    folder.id,
  );
  await click(button('Save organization'));
  expect(
    (await readWorkspace()).metadata[`course:${course.id}`]?.folderId,
  ).toBe(folder.id);
  expect(
    (await courseRepository.getCourse(course.id))?.sessions[7]!.resumeSeconds,
  ).toBe(6500);
});
it('restores saved table/search settings on the initial workspace load', async () => {
  await workspaceAction({
    op: 'preferences',
    revision: 0,
    patch: { view: 'table', search: 'javascript' },
  });
  await mount();
  expect(document.querySelector('table')).not.toBeNull();
  expect(
    document.querySelector<HTMLInputElement>('[aria-label="Search library"]')
      ?.value,
  ).toBe('javascript');
  expect((await readWorkspace()).preferences.search).toBe('javascript');
});
it('creates a course-linked timestamp note and displays it in the graph', async () => {
  await mount();
  await click(button('JavaScript course'));
  await click(button('New linked note'));
  const form = document.querySelector<HTMLFormElement>('form[role=dialog]')!;
  await fill(form.querySelector('input')!, 'A useful concept');
  await fill(
    form.querySelector('textarea')!,
    '# Closures\n02:30 A useful example',
  );
  await act(async () => {
    form.dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  const note = (await readWorkspace()).notes[0]!;
  expect(note.courseId).toBe(course.id);
  expect(note.linkedIds).toContain(`course:${course.id}`);
  await mount('graph');
  expect(
    document.querySelector('[aria-label="Open note: A useful concept"]'),
  ).not.toBeNull();
  expect(document.querySelectorAll('.ws-graph-canvas line')).toHaveLength(1);
});
it('renders raw HTML as text and sends only an explicit timestamp action', async () => {
  const note = {
    id: 'n',
    title: 'Safe note',
    body: '<img src=x onerror="alert(1)">\n02:30 example',
    courseId: course.id,
    linkedIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await act(async () =>
    root.render(<NoteBody note={note} onOpen={() => undefined} />),
  );
  expect(document.querySelector('img')).toBeNull();
  expect(document.body.textContent).toContain('<img src=x');
  await click(button('02:30'));
  expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
    type: 'DARB_OPEN_TIMESTAMP',
    courseId: course.id,
    seconds: 150,
  });
});

it('opens graph nodes with the keyboard and persists the final drag position', async () => {
  await mount('graph');
  const node = document.querySelector<SVGGElement>(
    '[aria-label="Open course: JavaScript course"]',
  )!;
  await act(async () => {
    node.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  });
  expect(document.querySelector('.ws-inspector')?.textContent).toContain(
    'JavaScript course',
  );
  const svg = document.querySelector<SVGSVGElement>('.ws-graph-canvas')!;
  svg.setPointerCapture = vi.fn();
  svg.hasPointerCapture = vi.fn().mockReturnValue(false);
  await act(async () => {
    node.dispatchEvent(
      new dom.window.MouseEvent('pointerdown', {
        button: 0,
        clientX: 100,
        clientY: 100,
        bubbles: true,
      }),
    );
    svg.dispatchEvent(
      new dom.window.MouseEvent('pointermove', {
        clientX: 150,
        clientY: 125,
        bubbles: true,
      }),
    );
    svg.dispatchEvent(
      new dom.window.MouseEvent('pointerup', {
        clientX: 150,
        clientY: 125,
        bubbles: true,
      }),
    );
  });
  expect(
    (await readWorkspace()).preferences.positions[`course:${course.id}`],
  ).toEqual({ x: 550, y: 345 });
});

async function submitForm(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true }),
    );
  });
}
it('adds, edits, restores and deletes a note in the video section while preserving progress', async () => {
  const renderNotes = (current = course) =>
    act(async () =>
      root.render(
        <WorkspaceProvider>
          <CourseNotes
            key={current.id}
            course={current}
            onOpen={() => undefined}
          />
        </WorkspaceProvider>,
      ),
    );
  await renderNotes();
  let form = document.querySelector<HTMLFormElement>(
    'form[aria-label="Add video note"]',
  )!;
  expect(form.querySelector<HTMLButtonElement>('.ws-primary')!.disabled).toBe(
    true,
  );
  await fill(form.querySelector('textarea')!, '02:30 Closures explained');
  await submitForm(form);
  const note = (await readWorkspace()).notes[0]!;
  expect(note.title).toBe('02:30 Closures explained');
  expect(note.courseId).toBe(course.id);
  expect(form.querySelector('textarea')!.value).toBe('');
  expect(document.body.textContent).toContain('Note saved');
  const other = createCourse(
    {
      videoId: 'lmnopqrstuv',
      videoUrl: 'https://www.youtube.com/watch?v=lmnopqrstuv',
      title: 'Another video',
      durationSeconds: 3600,
    },
    15,
  );
  await courseRepository.saveCourse(other);
  await renderNotes(other);
  expect(document.body.textContent).not.toContain('Closures explained');
  await renderNotes();
  expect(document.body.textContent).toContain('Closures explained');
  await click(button('Edit'));
  form = document.querySelector<HTMLFormElement>(
    'form[aria-label="Edit video note"]',
  )!;
  await fill(form.querySelector('input')!, 'Closures');
  await fill(form.querySelector('textarea')!, '04:00 Updated explanation');
  await submitForm(form);
  expect((await readWorkspace()).notes[0]).toMatchObject({
    id: note.id,
    title: 'Closures',
    body: '04:00 Updated explanation',
    courseId: course.id,
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await click(button('Delete'));
  expect((await readWorkspace()).notes).toHaveLength(0);
  expect(
    (await courseRepository.getCourse(course.id))?.sessions[7]!.resumeSeconds,
  ).toBe(6500);
});
it('keeps the inline draft when saving a video note fails', async () => {
  await act(async () =>
    root.render(
      <WorkspaceProvider>
        <CourseNotes course={course} onOpen={() => undefined} />
      </WorkspaceProvider>,
    ),
  );
  const form = document.querySelector<HTMLFormElement>(
    'form[aria-label="Add video note"]',
  )!;
  await fill(form.querySelector('textarea')!, 'Keep my draft');
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(
    async (message) => {
      const request = message as unknown as {
        type: string;
        action: { op: string };
      };
      if (request.action?.op === 'note.save')
        return { ok: false, error: 'Storage is full' };
      return { ok: true, data: await workspaceAction({ op: 'read' }) };
    },
  );
  await submitForm(form);
  expect(form.querySelector('textarea')!.value).toBe('Keep my draft');
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    'Storage is full',
  );
});
it('offers inline video notes in the popup for the currently detected saved video', async () => {
  vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [
    { id: 7, url: course.videoUrl },
  ]);
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(
    async (_id, message) =>
      (message as { type: string }).type === 'GET_VIDEO_METADATA'
        ? { ok: true, video: course }
        : { ok: true },
  );
  await act(async () => root.render(<PopupApp />));
  const form = document.querySelector<HTMLFormElement>(
    'form[aria-label="Add video note"]',
  )!;
  expect(form).not.toBeNull();
  await fill(form.querySelector('textarea')!, 'A note while watching');
  await submitForm(form);
  expect((await readWorkspace()).notes[0]).toMatchObject({
    courseId: course.id,
    body: 'A note while watching',
  });
  expect(
    document.querySelector('[aria-label="Video notes"]')?.textContent,
  ).toContain('A note while watching');
});

it('adds video notes immediately after creating a new course in the popup', async () => {
  const video = {
    platform: 'youtube' as const,
    videoId: 'lmnopqrstuv',
    videoUrl: 'https://www.youtube.com/watch?v=lmnopqrstuv',
    title: 'New video',
    durationSeconds: 3600,
  };
  vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [
    { id: 7, url: video.videoUrl },
  ]);
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(
    async (_id, message) =>
      (message as { type: string }).type === 'GET_VIDEO_METADATA'
        ? { ok: true, video }
        : { ok: true },
  );
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(
    async (message) => {
      const request = message as unknown as {
        type: string;
        course: Course;
        action: unknown;
      };
      if (request.type === 'CREATE_COURSE') {
        await courseRepository.saveCourse(request.course);
        return { ok: true };
      }
      if (request.type === 'DARB_WORKSPACE')
        return { ok: true, data: await workspaceAction(request.action) };
      if (request.type === 'DARB_LEARNING')
        return { ok: true, data: await readLearning() };
      return { ok: true };
    },
  );
  await act(async () => root.render(<PopupApp />));
  await click(button('Create course'));
  const form = document.querySelector<HTMLFormElement>(
    'form[aria-label="Add video note"]',
  )!;
  expect(form).not.toBeNull();
  await fill(
    form.querySelector('textarea')!,
    'My first note for the new video',
  );
  await submitForm(form);
  const note = (await readWorkspace()).notes[0]!;
  expect((await courseRepository.getCourse(note.courseId!))?.videoId).toBe(
    video.videoId,
  );
  expect(note.body).toBe('My first note for the new video');
});

it('keeps the bulk folder destination selected until Move and confirms the stored result', async () => {
  const workspace = await workspaceAction({
    op: 'folder.save',
    revision: 0,
    name: 'Programming',
    parentId: null,
  });
  await mount();
  await click(
    document.querySelector<HTMLElement>(
      '[aria-label="Select JavaScript course"]',
    )!,
  );
  const destination = document.querySelector<HTMLSelectElement>(
    '[aria-label="Move selected items"]',
  )!;
  await select(destination, workspace.folders[0]!.id);
  expect(destination.value).toBe(workspace.folders[0]!.id);
  expect(
    (await readWorkspace()).metadata[`course:${course.id}`],
  ).toBeUndefined();
  await click(button('Move'));
  expect(
    (await readWorkspace()).metadata[`course:${course.id}`]?.folderId,
  ).toBe(workspace.folders[0]!.id);
  expect(document.body.textContent).toContain(
    'Moved 1 item(s) to Programming.',
  );
});
it('renames a playlist in its own section without changing its cursor or course checkpoint', async () => {
  const state = initialLearningState();
  const playlist = createPlaylist('Old name', [
    { videoId: course.videoId, videoUrl: course.videoUrl, title: course.title },
  ]);
  state.playlists = [playlist];
  await writeLearning(state);
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async (raw) => ({
    ok: true,
    data: await learningAction((raw as unknown as { action: unknown }).action),
  }));
  await act(async () => root.render(<PlaylistPanel courses={[course]} />));
  await click(button('Rename / edit playlist'));
  const editor = document.querySelector<HTMLInputElement>('article input')!;
  expect(editor).not.toBeNull();
  await fill(editor, 'New learning path');
  await click(button('Save playlist'));
  expect((await readLearning()).playlists[0]).toMatchObject({
    id: playlist.id,
    title: 'New learning path',
    cursorId: playlist.cursorId,
  });
  expect(
    (await courseRepository.getCourse(course.id))?.sessions[7]!.resumeSeconds,
  ).toBe(6500);
});
it('captures the live video timestamp on Add note and makes the saved note jump there', async () => {
  vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [
    { id: 7, url: course.videoUrl, active: true },
  ]);
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async (_id, raw) =>
    (raw as { type: string }).type === 'GET_VIDEO_POSITION'
      ? {
          ok: true,
          position: {
            platform: 'youtube',
            videoId: course.videoId,
            seconds: 192.7,
          },
        }
      : { ok: true },
  );
  await act(async () =>
    root.render(
      <WorkspaceProvider>
        <CourseNotes course={course} onOpen={() => undefined} />
      </WorkspaceProvider>,
    ),
  );
  const form = document.querySelector<HTMLFormElement>(
    'form[aria-label="Add video note"]',
  )!;
  await fill(form.querySelector('textarea')!, 'This explanation matters');
  await submitForm(form);
  expect((await readWorkspace()).notes[0]?.seconds).toBe(192);
  await click(button('Jump to 00:03:12'));
  expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
    type: 'DARB_OPEN_TIMESTAMP',
    courseId: course.id,
    seconds: 192,
  });
});

it('renames a playlist directly in the Library inspector', async () => {
  const state = initialLearningState();
  const playlist = createPlaylist('Original path', [
    { videoId: course.videoId, videoUrl: course.videoUrl, title: course.title },
  ]);
  state.playlists = [playlist];
  await writeLearning(state);
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async (raw) => {
    const message = raw as unknown as { type: string; action: unknown };
    if (message.type === 'DARB_WORKSPACE')
      return { ok: true, data: await workspaceAction(message.action) };
    return { ok: true, data: await learningAction(message.action) };
  });
  await mount();
  await click(button('Original path'));
  await fill(
    document.querySelector<HTMLInputElement>('[aria-label="Playlist name"]')!,
    'Renamed in Library',
  );
  await click(button('Rename playlist'));
  expect((await readLearning()).playlists[0]?.title).toBe('Renamed in Library');
});

it('labels a fully completed playlist and offers Watch again instead of Continue', async () => {
  const finished = {
    ...course,
    completed: true,
    sessions: course.sessions.map((s) => ({ ...s, completed: true })),
  };
  const state = initialLearningState();
  state.playlists = [createPlaylist('Finished path', [finished])];
  await writeLearning(state);
  await act(async () => root.render(<PlaylistPanel courses={[finished]} />));
  expect(document.body.textContent).toContain('Playlist completed');
  expect(button('Watch again')).not.toBeNull();
  expect(button('Next video').disabled).toBe(true);
});
