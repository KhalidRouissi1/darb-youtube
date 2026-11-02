import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { PopupApp } from '@/entrypoints/popup/PopupApp';
let dom: JSDOM;
let root: Root;
beforeEach(async () => {
  dom = new JSDOM('<div id="app"></div>', { url: 'https://example.com' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  await browser.storage.local.clear();
  vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [
    { id: 7, url: 'https://www.youtube.com/@freecodecamp/featured' },
  ]);
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(
    async (_id, message) =>
      (message as { type: string }).type === 'GET_VIDEO_CONTEXT'
        ? { ok: true, url: 'https://www.youtube.com/@freecodecamp/featured' }
        : { ok: true },
  );
  root = createRoot(document.getElementById('app')!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  dom.window.close();
});
it('offers selection on a channel page without showing a missing-video error', async () => {
  const send = vi.spyOn(browser.runtime, 'sendMessage');
  await act(async () => root.render(<PopupApp />));
  expect(document.body.textContent).toContain(
    'Choose a video or build a playlist',
  );
  expect(document.body.textContent).not.toContain(
    'Open a YouTube, X, or Facebook video to begin',
  );
  expect(send).not.toHaveBeenCalled();
});
it('shows selection-start failures on the browse screen and allows retry', async () => {
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async () => {
    throw new Error('Bridge unavailable');
  });
  await act(async () => root.render(<PopupApp />));
  const button = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent === 'Select videos on this page',
  )!;
  await act(async () => button.click());
  expect(document.body.textContent).toContain('Bridge unavailable');
  expect(button.disabled).toBe(false);
});

it('recovers a single-video tab and creates a course without a playlist', async () => {
  vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [
    { id: 7, url: 'https://www.youtube.com/watch?v=abcdefghijk' },
  ]);
  let connected = false;
  const inject = vi
    .spyOn(browser.scripting, 'executeScript')
    .mockImplementation(async () => {
      connected = true;
      return [];
    });
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async (_id, raw) => {
    if (!connected) throw new Error('Receiving end does not exist');
    const message = raw as { type: string };
    if (message.type === 'GET_VIDEO_METADATA')
      return {
        ok: true,
        video: {
          platform: 'youtube',
          videoId: 'abcdefghijk',
          videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
          title: 'Standalone lesson',
          durationSeconds: 3600,
        },
      };
    return { ok: true };
  });
  const send = vi
    .spyOn(browser.runtime, 'sendMessage')
    .mockImplementation(async () => ({ ok: true }));
  await act(async () => root.render(<PopupApp />));
  expect(inject).toHaveBeenCalledWith({
    target: { tabId: 7 },
    files: ['/content-scripts/content.js'],
  });
  expect(document.body.textContent).toContain('Standalone lesson');
  const create = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent === 'Create course',
  )!;
  expect(create).toBeDefined();
  await act(async () => create.click());
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'CREATE_COURSE',
      course: expect.objectContaining({ videoId: 'abcdefghijk' }),
    }),
  );
  expect(document.body.textContent).toContain('Start first session');
  expect(document.body.textContent).not.toContain('Darb could not connect');
  let rejectStart!: (error: Error) => void;
  send.mockClear();
  send.mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rejectStart = reject;
      }),
  );
  const start = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent === 'Start first session',
  )!;
  await act(async () => {
    start.click();
    start.click();
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(start.disabled).toBe(true);
  expect(start.textContent).toContain('Starting session');
  await act(async () =>
    rejectStart(new Error('The embedded player did not respond.')),
  );
  expect(document.body.textContent).toContain(
    'The embedded player did not respond.',
  );
  expect(start.disabled).toBe(false);
});

it('changes from browse to a standalone video and then to a different video in the same tab', async () => {
  vi.useFakeTimers();
  let url = 'https://www.youtube.com/';
  vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [
    { id: 7, url: 'https://www.youtube.com/' },
  ]);
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async (_id, raw) => {
    const message = raw as { type: string };
    if (message.type === 'GET_VIDEO_CONTEXT') return { ok: true, url };
    if (message.type === 'GET_VIDEO_METADATA')
      return {
        ok: true,
        video: {
          platform: 'youtube',
          videoId: new URL(url).searchParams.get('v'),
          videoUrl: url,
          title: url.includes('abcdefghijk') ? 'First video' : 'Second video',
          durationSeconds: 3600,
        },
      };
    return { ok: true };
  });
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async () => ({
    ok: true,
  }));
  await act(async () => root.render(<PopupApp />));
  expect(document.body.textContent).toContain(
    'Choose a video or build a playlist',
  );
  url = 'https://www.youtube.com/watch?v=abcdefghijk';
  await act(async () => {
    await vi.advanceTimersByTimeAsync(800);
  });
  expect(document.body.textContent).toContain('First video');
  expect(document.body.textContent).not.toContain(
    'Choose a video or build a playlist',
  );
  url = 'https://www.youtube.com/watch?v=lmnopqrstuv';
  await act(async () => {
    await vi.advanceTimersByTimeAsync(800);
  });
  expect(document.body.textContent).toContain('Second video');
  expect(document.body.textContent).not.toContain('First video');
});

it('renders the note-mode switch from storage and changes its state explicitly', async () => {
  vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [
    { id: 7, url: 'https://www.youtube.com/watch?v=abcdefghijk' },
  ]);
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async (_id, raw) => {
    const type = (raw as { type: string }).type;
    if (type === 'GET_VIDEO_CONTEXT')
      return { ok: true, url: 'https://www.youtube.com/watch?v=abcdefghijk' };
    if (type === 'GET_VIDEO_METADATA')
      return {
        ok: true,
        video: {
          platform: 'youtube',
          videoId: 'abcdefghijk',
          videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
          title: 'Video',
          durationSeconds: 3600,
        },
      };
    return { ok: true };
  });
  let enabled = false;
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async (raw) => {
    const message = raw as unknown as {
      type: string;
      action: { enabled?: boolean };
    };
    if (message.type === 'DARB_NOTE_MODE') {
      if (message.action.enabled !== undefined)
        enabled = message.action.enabled;
      return { ok: true, enabled };
    }
    return { ok: true };
  });
  await act(async () => root.render(<PopupApp />));
  const toggle = document.querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  await act(async () => toggle.click());
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  await act(async () => toggle.click());
  expect(toggle.getAttribute('aria-checked')).toBe('false');
});

const watchUrl = 'https://www.youtube.com/watch?v=abcdefghijk';
const metadata = {
  ok: true,
  video: {
    platform: 'youtube',
    videoId: 'abcdefghijk',
    videoUrl: watchUrl,
    title: 'Slow lesson',
    durationSeconds: 3600,
  },
};
function watchTab() {
  vi.useFakeTimers();
  vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [
    { id: 7, url: watchUrl },
  ]);
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async () => ({
    ok: true,
  }));
}
it('finishes slow detection despite repeated navigation revisions for the same video', async () => {
  watchTab();
  let revision = 0;
  let reads = 0;
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async (_id, raw) => {
    const type = (raw as { type: string }).type;
    if (type === 'GET_VIDEO_CONTEXT')
      return { ok: true, url: watchUrl, revision: ++revision };
    if (type === 'GET_VIDEO_METADATA') {
      reads++;
      return new Promise<typeof metadata>((resolve) =>
        setTimeout(() => resolve(metadata), 2500),
      );
    }
    return { ok: true };
  });
  await act(async () => root.render(<PopupApp />));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3200);
  });
  expect(document.body.textContent).toContain('Slow lesson');
  expect(document.body.textContent).not.toContain('Reading this video');
  expect(reads).toBe(1);
});
it('times out an unanswered metadata message, ignores its late response, and allows retry', async () => {
  watchTab();
  let late: (value: typeof metadata) => void = () => undefined;
  let hung = true;
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async (_id, raw) => {
    const type = (raw as { type: string }).type;
    if (type === 'GET_VIDEO_CONTEXT') return { ok: true, url: watchUrl };
    if (type === 'GET_VIDEO_METADATA')
      return hung
        ? new Promise<typeof metadata>((resolve) => {
            late = resolve;
          })
        : metadata;
    return { ok: true };
  });
  await act(async () => root.render(<PopupApp />));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15001);
  });
  expect(document.body.textContent).toContain(
    'Reading this video took too long',
  );
  await act(async () => late(metadata));
  expect(document.body.textContent).not.toContain('Slow lesson');
  hung = false;
  const retry = Array.from(document.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Try again'),
  )!;
  await act(async () => retry.click());
  expect(document.body.textContent).toContain('Slow lesson');
});
it('recovers a bridge that keeps the ping channel open without responding', async () => {
  watchTab();
  let injected = false;
  vi.spyOn(browser.scripting, 'executeScript').mockImplementation(async () => {
    injected = true;
    return [];
  });
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async (_id, raw) => {
    const type = (raw as { type: string }).type;
    if (type === 'VIDEO_BRIDGE_PING' && !injected)
      return new Promise(() => undefined);
    if (type === 'GET_VIDEO_CONTEXT') return { ok: true, url: watchUrl };
    return type === 'GET_VIDEO_METADATA' ? metadata : { ok: true };
  });
  await act(async () => root.render(<PopupApp />));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1600);
  });
  expect(injected).toBe(true);
  expect(document.body.textContent).toContain('Slow lesson');
});
it('keeps the new video when metadata from the previous video arrives late', async () => {
  watchTab();
  let url = watchUrl;
  let late: (value: typeof metadata) => void = () => undefined;
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async (_id, raw) => {
    const type = (raw as { type: string }).type;
    if (type === 'GET_VIDEO_CONTEXT') return { ok: true, url };
    if (type === 'GET_VIDEO_METADATA') {
      if (url === watchUrl)
        return new Promise<typeof metadata>((resolve) => {
          late = resolve;
        });
      return {
        ok: true,
        video: {
          ...metadata.video,
          videoId: 'lmnopqrstuv',
          videoUrl: url,
          title: 'New lesson',
        },
      };
    }
    return { ok: true };
  });
  await act(async () => root.render(<PopupApp />));
  url = 'https://www.youtube.com/watch?v=lmnopqrstuv';
  await act(async () => {
    await vi.advanceTimersByTimeAsync(800);
  });
  expect(document.body.textContent).toContain('New lesson');
  await act(async () => late(metadata));
  expect(document.body.textContent).toContain('New lesson');
  expect(document.body.textContent).not.toContain('Slow lesson');
});

it('does not confuse a lost context reply with navigation to a cached homepage URL', async () => {
  watchTab();
  vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [
    { id: 7, url: 'https://www.youtube.com/' },
  ]);
  let contexts = 0;
  let reads = 0;
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async (_id, raw) => {
    const type = (raw as { type: string }).type;
    if (type === 'GET_VIDEO_CONTEXT') {
      contexts++;
      return contexts === 1 ? { ok: true, url: watchUrl } : undefined;
    }
    if (type === 'GET_VIDEO_METADATA') {
      reads++;
      return new Promise<typeof metadata>((resolve) =>
        setTimeout(() => resolve(metadata), 2500),
      );
    }
    return { ok: true };
  });
  await act(async () => root.render(<PopupApp />));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  expect(document.body.textContent).toContain('Slow lesson');
  expect(reads).toBe(1);
});
