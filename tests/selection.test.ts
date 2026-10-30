import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { browser } from 'wxt/browser';
import {
  cardVideo,
  startSelectionMode,
  stopSelectionMode,
} from '@/lib/learning/selection-mode';
let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM('', { url: 'https://example.com' });
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('location', dom.window.location);
});
afterEach(() => {
  stopSelectionMode();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  dom.window.close();
});
it('extracts standard cards, ignores live streams and rejects shorts', () => {
  const card = document.createElement('ytd-video-renderer');
  card.innerHTML =
    '<a id="video-title" href="https://www.youtube.com/watch?v=abcdefghijk">Lecture</a>';
  expect(cardVideo(card)).toMatchObject({
    videoId: 'abcdefghijk',
    title: 'Lecture',
  });
  const live = document.createElement('span');
  live.setAttribute('overlay-style', 'LIVE');
  card.append(live);
  expect(cardVideo(card)).toBeNull();
  live.remove();
  card.querySelector('a')!.href = 'https://www.youtube.com/shorts/abcdefghijk';
  expect(cardVideo(card)).toBeNull();
});
it('does not allow selection controls on arbitrary websites', async () => {
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async () => ({
    ok: true,
    data: { selection: { items: [] } },
  }));
  await expect(startSelectionMode()).rejects.toThrow(/YouTube/);
  expect(document.querySelector('.darb-select-control')).toBeNull();
});
it('updates recycled cards, preserves normal navigation, and removes controls on exit', async () => {
  dom.reconfigure({
    url: 'https://www.youtube.com/results?search_query=course',
  });
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
  const card = document.createElement('ytd-video-renderer');
  card.innerHTML =
    '<a id="video-title" href="https://www.youtube.com/watch?v=abcdefghijk">Lecture</a>';
  document.body.append(card);
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async () => ({
    ok: true,
    data: { selection: { items: [{ videoId: 'abcdefghijk' }] } },
  }));
  await startSelectionMode();
  expect(card.querySelector('input')?.checked).toBe(true);
  expect(card.querySelector('a')!.href).toContain('abcdefghijk');
  card.querySelector('a')!.href = 'https://www.youtube.com/watch?v=lmnopqrstuv';
  card.querySelector('a')!.textContent = 'Another lecture';
  await vi.waitFor(() =>
    expect(card.querySelector('input')?.getAttribute('aria-label')).toBe(
      'Select Another lecture',
    ),
  );
  expect(card.querySelector('input')?.checked).toBe(false);
  stopSelectionMode();
  expect(card.querySelector('input')).toBeNull();
  expect(card.style.position).toBe('');
});

it('reads a modern channel card whose first watch link is an empty thumbnail', () => {
  const card = document.createElement('yt-lockup-view-model');
  card.innerHTML =
    '<a href="https://www.youtube.com/watch?v=abcdefghijk"><img src="https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"></a><h3><a class="ytLockupMetadataViewModelTitle" href="https://www.youtube.com/watch?v=abcdefghijk"><span>Harvard CS50 – Full Course</span></a></h3>';
  expect(cardVideo(card)).toMatchObject({
    videoId: 'abcdefghijk',
    title: 'Harvard CS50 – Full Course',
  });
});

it('attaches one checkbox to a modern card inside a rich-item wrapper', async () => {
  dom.reconfigure({ url: 'https://www.youtube.com/@freecodecamp/featured' });
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
  document.body.innerHTML =
    '<ytd-rich-item-renderer><yt-lockup-view-model><a href="https://www.youtube.com/watch?v=abcdefghijk"></a><h3><a href="https://www.youtube.com/watch?v=abcdefghijk">Lecture</a></h3></yt-lockup-view-model></ytd-rich-item-renderer>';
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async () => ({
    ok: true,
    data: { selection: { items: [] } },
  }));
  expect(await startSelectionMode()).toBe(1);
  expect(document.querySelectorAll('.darb-select-control')).toHaveLength(1);
  expect(
    document.querySelector('yt-lockup-view-model > .darb-select-control'),
  ).not.toBeNull();
});

it('toggles from the thumbnail, title and card background while preventing YouTube clicks', async () => {
  dom.reconfigure({ url: 'https://www.youtube.com/@freecodecamp/featured' });
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
  document.body.innerHTML =
    '<yt-lockup-view-model style="cursor: crosshair; outline: 2px solid blue; outline-offset: 1px"><a href="https://www.youtube.com/watch?v=abcdefghijk"><img alt="Lecture thumbnail"></a><h3><a href="https://www.youtube.com/watch?v=abcdefghijk">Lecture</a></h3></yt-lockup-view-model>';
  const card = document.querySelector<HTMLElement>('yt-lockup-view-model')!;
  const youtubeClick = vi.fn();
  card.addEventListener('click', youtubeClick);
  let checked = false;
  const toggles = vi.fn();
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(
    async (message) => {
      const request = message as unknown as { action: { op: string } };
      if (request.action.op === 'selection.toggle') {
        toggles();
        checked = !checked;
      }
      return {
        ok: true,
        data: {
          selection: { items: checked ? [{ videoId: 'abcdefghijk' }] : [] },
        },
      };
    },
  );
  await startSelectionMode();
  for (const target of [
    card.querySelector('img')!,
    card.querySelector('h3 a')!,
    card,
  ]) {
    const previous = checked;
    const event = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    if (toggles.mock.calls.length === 1) {
      // A second click during the pending save must not toggle it back.
      target.dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    }
    await vi.waitFor(() =>
      expect(card.querySelector('input')?.checked).toBe(!previous),
    );
    await vi.waitFor(() =>
      expect(card.querySelector('input')?.disabled).toBe(false),
    );
  }
  expect(toggles).toHaveBeenCalledTimes(3);
  expect(youtubeClick).not.toHaveBeenCalled();
  // The small native checkbox still toggles exactly once.
  card.querySelector('input')!.click();
  await vi.waitFor(() => expect(toggles).toHaveBeenCalledTimes(4));
  await vi.waitFor(() =>
    expect(card.querySelector('input')?.disabled).toBe(false),
  );
  stopSelectionMode();
  expect(card.style.cursor).toBe('crosshair');
  expect(card.style.outline).toBe('2px solid blue');
  expect(card.style.outlineOffset).toBe('1px');
  const normalClick = new dom.window.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
  });
  card.dispatchEvent(normalClick);
  expect(normalClick.defaultPrevented).toBe(false);
  expect(youtubeClick).toHaveBeenCalledTimes(1);
});

it('covers the card center and intercepts YouTube document handlers before navigation', async () => {
  dom.reconfigure({ url: 'https://www.youtube.com/@freecodecamp/videos' });
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
  document.body.innerHTML =
    '<yt-lockup-view-model><a href="https://www.youtube.com/watch?v=abcdefghijk"><img alt="Thumbnail"></a><h3><a href="https://www.youtube.com/watch?v=abcdefghijk">Lecture</a></h3></yt-lockup-view-model>';
  // Reproduce the ordering missed by a listener on the card itself: YouTube
  // handles the event at document capture before it reaches the card.
  const navigate = vi.fn();
  for (const type of ['pointerdown', 'pointerup', 'click', 'auxclick'])
    document.addEventListener(type, navigate, true);
  let checked = false;
  const toggle = vi.fn();
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(
    async (message) => {
      if (
        (message as unknown as { action: { op: string } }).action.op ===
        'selection.toggle'
      ) {
        checked = !checked;
        toggle();
      }
      return {
        ok: true,
        data: {
          selection: { items: checked ? [{ videoId: 'abcdefghijk' }] : [] },
        },
      };
    },
  );
  await startSelectionMode();
  const overlay = document.querySelector<HTMLElement>('.darb-select-control')!;
  expect(overlay.style.getPropertyValue('inset')).toBe('0');
  expect(overlay.style.width).toBe('100%');
  expect(overlay.style.height).toBe('100%');
  expect(overlay.style.pointerEvents).toBe('auto');
  for (const type of ['pointerdown', 'pointerup', 'click', 'auxclick']) {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: 200,
      clientY: 100,
    });
    overlay.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }
  await vi.waitFor(() =>
    expect(overlay.querySelector('input')?.checked).toBe(true),
  );
  expect(toggle).toHaveBeenCalledTimes(1);
  expect(navigate).not.toHaveBeenCalled();
  await vi.waitFor(() =>
    expect(overlay.querySelector('input')?.disabled).toBe(false),
  );
  const card = overlay.parentElement!;
  card.getBoundingClientRect = () =>
    ({
      left: 100,
      top: 50,
      right: 400,
      bottom: 250,
      width: 300,
      height: 200,
    }) as DOMRect;
  const preview = document.createElement('ytd-video-preview');
  document.body.append(preview);
  const portalClick = new dom.window.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    clientX: 200,
    clientY: 100,
  });
  preview.dispatchEvent(portalClick);
  expect(portalClick.defaultPrevented).toBe(true);
  await vi.waitFor(() => expect(toggle).toHaveBeenCalledTimes(2));
  expect(navigate).not.toHaveBeenCalled();
  await vi.waitFor(() =>
    expect(overlay.querySelector('input')?.disabled).toBe(false),
  );
  stopSelectionMode();
  document
    .querySelector('img')!
    .dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );
  expect(navigate).toHaveBeenCalledTimes(1);
});
