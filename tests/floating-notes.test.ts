import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { browser } from 'wxt/browser';
import { installFloatingNotes } from '@/lib/video/floating-notes';
import { videoNotesAction } from '@/lib/workspace/video-notes';
import { readWorkspace } from '@/lib/workspace/repository';
import { courseRepository } from '@/lib/storage/repository';
import { createCourse } from '@/lib/utils/courses';
import { parseVideoUrl } from '@/lib/video/platforms';
let dom: JSDOM;
let widget: ReturnType<typeof installFloatingNotes> | undefined;
beforeEach(async () => {
  await browser.storage.local.clear();
  dom = new JSDOM('<div id="movie_player"><video></video></div>', {
    url: 'https://www.youtube.com/watch?v=abcdefghijk',
  });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  const video = document.querySelector('video')!;
  Object.defineProperty(video, 'duration', { value: 3600 });
  video.currentTime = 150.9;
  await courseRepository.saveCourse(
    createCourse(
      {
        platform: 'youtube',
        videoId: 'abcdefghijk',
        videoUrl: dom.window.location.href,
        title: 'Course',
        durationSeconds: 3600,
      },
      15,
    ),
  );
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async (raw) => {
    const message = raw as unknown as { action: unknown };
    return {
      ok: true,
      data: await videoNotesAction(
        parseVideoUrl(window.location.href)!,
        message.action,
      ),
    };
  });
});
afterEach(() => {
  widget?.dispose();
  widget = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  dom.window.close();
});
it('stays hidden when disabled, captures time when enabled and seeks a saved note', async () => {
  widget = installFloatingNotes();
  await widget.sync();
  expect(document.getElementById('darb-floating-notes')).toBeNull();
  await browser.storage.local.set({ 'darb:note-mode': true });
  await vi.waitFor(() =>
    expect(document.getElementById('darb-floating-notes')).not.toBeNull(),
  );
  const shadow = document.getElementById('darb-floating-notes')!.shadowRoot!;
  shadow.querySelector<HTMLButtonElement>('.bubble')!.click();
  const textarea = shadow.querySelector('textarea')!;
  textarea.value = 'Remember this explanation';
  shadow
    .querySelector('form')!
    .dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true }),
    );
  await vi.waitFor(async () =>
    expect((await readWorkspace()).notes[0]?.seconds).toBe(150),
  );
  await vi.waitFor(() =>
    expect(shadow.querySelector('.note')?.textContent).toContain('2:30'),
  );
  const video = document.querySelector('video')!;
  video.currentTime = 400;
  shadow.querySelector<HTMLButtonElement>('.note')!.click();
  expect(video.currentTime).toBe(150);
  await browser.storage.local.set({ 'darb:note-mode': false });
  await vi.waitFor(() =>
    expect(document.getElementById('darb-floating-notes')).toBeNull(),
  );
});
it('keeps an unsaved draft and does not attach it to a different video during navigation', async () => {
  await browser.storage.local.set({ 'darb:note-mode': true });
  widget = installFloatingNotes();
  await vi.waitFor(() =>
    expect(document.getElementById('darb-floating-notes')).not.toBeNull(),
  );
  const shadow = document.getElementById('darb-floating-notes')!.shadowRoot!;
  const textarea = shadow.querySelector('textarea')!;
  textarea.value = 'First video draft';
  textarea.dispatchEvent(new dom.window.Event('input'));
  dom.reconfigure({ url: 'https://www.youtube.com/watch?v=lmnopqrstuv' });
  await widget.sync();
  expect(textarea.value).toBe('');
  expect(shadow.textContent).toContain('Create a course for this video');
  dom.reconfigure({ url: 'https://www.youtube.com/watch?v=abcdefghijk' });
  await widget.sync();
  expect(textarea.value).toBe('First video draft');
  await expect(
    videoNotesAction(parseVideoUrl(window.location.href)!, {
      op: 'save',
      videoId: 'lmnopqrstuv',
      body: 'wrong',
      seconds: 10,
    }),
  ).rejects.toThrow('video changed');
  expect((await readWorkspace()).notes).toHaveLength(0);
});
