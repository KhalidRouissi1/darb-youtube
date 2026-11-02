import { SELECTION_VERSION } from './version';
import { browser } from 'wxt/browser';
import { parseVideoUrl } from '../video/platforms';
import type { VideoReference } from './model';
let active = false;
let observer: MutationObserver | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let selected = new Set<string>();
let host: HTMLDivElement | null = null;
const attached = new Map<
  Element,
  {
    control: HTMLElement;
    oldPosition: string;
    oldCursor: string;
    oldOutline: string;
    oldOutlineOffset: string;
  }
>();
const controls = new Map<HTMLInputElement, string>();
const pendingVideos = new Set<string>();
let selectionWindow: Window | null = null;
const CAPTURE_EVENTS = [
  'click',
  'auxclick',
  'dblclick',
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
] as const;
const CARD_SELECTOR =
  'ytd-video-renderer,ytd-grid-video-renderer,ytd-rich-item-renderer,yt-lockup-view-model,a.vcard,a.srow,a.next';

async function send(op: string, extra: Record<string, unknown> = {}) {
  const response = await browser.runtime.sendMessage({
    type: 'DARB_LEARNING',
    action: { op, ...extra },
  });
  if (!response?.ok)
    throw new Error(response?.error ?? 'Darb could not update the selection.');
  return response.data as { selection: { items: VideoReference[] } };
}
function announce(text: string) {
  const label = host?.shadowRoot?.querySelector('[role="status"]');
  if (label) label.textContent = text;
}
async function refresh() {
  const data = await send('read');
  if (!active) return;
  selected = new Set(data.selection.items.map((v) => v.videoId));
  paintSelection();
  announce(`${selected.size} selected · Click any video to select`);
}
function paintSelection() {
  for (const [input, id] of controls) {
    input.checked = selected.has(id);
    input.disabled = pendingVideos.has(id);
  }
  for (const [card, entry] of attached) {
    const input = entry.control.querySelector('input')!;
    (card as HTMLElement).style.outline = input.checked
      ? '3px solid #f15a24'
      : '1px dashed #f15a2480';
  }
}
async function toggleVideo(video: VideoReference) {
  if (pendingVideos.has(video.videoId)) {
    paintSelection();
    return;
  }
  pendingVideos.add(video.videoId);
  paintSelection();
  try {
    await send('selection.toggle', { video });
    await refresh();
  } catch (error) {
    announce(
      error instanceof Error ? error.message : 'Unable to select video.',
    );
  } finally {
    pendingVideos.delete(video.videoId);
    paintSelection();
  }
}
// Intercept before YouTube's document-level handlers, including thumbnail
// preview handlers that run before a card's own click listener.
function captureSelectionEvent(event: Event) {
  if (!active) return;
  const path = event.composedPath();
  let card = [...attached.keys()].find((element) => path.includes(element));
  // Hover previews may be portalled outside the card's DOM subtree.
  const preview = path.some(
    (node) =>
      node &&
      typeof node === 'object' &&
      'nodeName' in node &&
      String(node.nodeName).toLowerCase().includes('video-preview'),
  );
  if (!card && preview && 'clientX' in event && 'clientY' in event) {
    const { clientX: x, clientY: y } = event as MouseEvent;
    card = [...attached.keys()].find((element) => {
      const r = element.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        x >= r.left &&
        x <= r.right &&
        y >= r.top &&
        y <= r.bottom
      );
    });
  }
  if (!card) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.type === 'click') {
    const video = cardVideo(card);
    if (video) void toggleVideo(video);
  }
}
export function cardVideo(card: Element): VideoReference | null {
  if (
    card.closest('ytd-promoted-video-renderer, ytd-ad-slot-renderer') ||
    card.querySelector('[overlay-style="LIVE"]')
  )
    return null;
  const links = Array.from(card.querySelectorAll<HTMLAnchorElement>('a[href]'));
  if (card.tagName === 'A' && card.matches('a[href]'))
    links.unshift(card as HTMLAnchorElement);
  // Modern channel cards put an empty thumbnail link before the heading.
  // Choose a titled watch link, never let that empty anchor hide the video.
  const candidates = links.filter(
    (link) => parseVideoUrl(link.href)?.platform === 'youtube',
  );
  const titleOf = (link: HTMLAnchorElement) =>
    (
      link.querySelector('h3')?.textContent ||
      link.getAttribute('title') ||
      link.textContent ||
      link.getAttribute('aria-label') ||
      ''
    ).trim();
  const link =
    candidates.find(
      (a) =>
        (a.id === 'video-title' ||
          a.id === 'video-title-link' ||
          a.closest('h3')) &&
        titleOf(a),
    ) ?? candidates.find((a) => titleOf(a));
  const identity = link ? parseVideoUrl(link.href) : null;
  if (!identity || identity.platform !== 'youtube' || !link) return null;
  const title = titleOf(link);
  const raw = card.querySelector<HTMLImageElement>('img')?.src;
  const thumbnailUrl = raw?.startsWith('https:')
    ? raw
    : `https://i.ytimg.com/vi/${identity.videoId}/hqdefault.jpg`;
  return {
    videoId: identity.videoId,
    videoUrl: identity.videoUrl,
    title: title.slice(0, 500),
    thumbnailUrl,
  };
}
function removeControl(card: Element) {
  const entry = attached.get(card);
  if (!entry) return;
  const input = entry.control.querySelector('input');
  if (input) controls.delete(input);
  entry.control.remove();
  if (card instanceof HTMLElement) {
    card.style.position = entry.oldPosition;
    card.style.cursor = entry.oldCursor;
    card.style.outline = entry.oldOutline;
    card.style.outlineOffset = entry.oldOutlineOffset;
  }
  attached.delete(card);
}
function scan() {
  if (!active) return;
  for (const card of attached.keys()) {
    const video = cardVideo(card);
    const input = attached.get(card)!.control.querySelector('input')!;
    if (
      !card.isConnected ||
      card.querySelector(CARD_SELECTOR) ||
      !video ||
      video.videoId !== controls.get(input)
    )
      removeControl(card);
  }
  for (const card of document.querySelectorAll<HTMLElement>(CARD_SELECTOR)) {
    if (attached.has(card) || card.querySelector(CARD_SELECTOR)) continue;
    const video = cardVideo(card);
    if (!video) continue;
    const label = document.createElement('label');
    label.className = 'darb-select-control';
    label.dataset.darbSelectionVersion = SELECTION_VERSION;
    label.style.cssText =
      'position:absolute!important;inset:0!important;width:100%!important;height:100%!important;z-index:2147483646!important;display:block!important;pointer-events:auto!important;background:transparent!important;margin:0!important;padding:0!important;cursor:pointer!important;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = selected.has(video.videoId);
    input.setAttribute('aria-label', `Select ${video.title}`);
    input.style.accentColor = '#f15a24';
    const text = document.createElement('span');
    text.textContent = 'Darb';
    const badge = document.createElement('span');
    badge.style.cssText =
      'position:absolute;top:8px;left:8px;display:flex;align-items:center;gap:6px;background:#fff;color:#1b1816;border:2px solid #f15a24;border-radius:8px;padding:8px;font:600 13px sans-serif;';
    badge.append(input, text);
    label.append(badge);
    label.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('change', () => {
      void toggleVideo(video);
    });
    const oldPosition = card.style.position;
    const oldCursor = card.style.cursor;
    const oldOutline = card.style.outline;
    const oldOutlineOffset = card.style.outlineOffset;
    card.style.position = 'relative';
    card.style.cursor = 'pointer';
    card.style.outlineOffset = '3px';
    card.append(label);
    attached.set(card, {
      control: label,
      oldPosition,
      oldCursor,
      oldOutline,
      oldOutlineOffset,
    });
    controls.set(input, video.videoId);
  }
  paintSelection();
  announce(
    attached.size
      ? `${selected.size} selected · Click any video to select`
      : 'No videos found yet. Open the channel Videos tab or scroll to load videos.',
  );
}
const storageChanged = () => {
  if (active) void refresh().catch((error) => announce(String(error)));
};
export function stopSelectionMode() {
  for (const type of CAPTURE_EVENTS)
    selectionWindow?.removeEventListener(type, captureSelectionEvent, true);
  selectionWindow = null;
  browser.storage.onChanged.removeListener(storageChanged);
  active = false;
  observer?.disconnect();
  observer = null;
  if (timer) clearTimeout(timer);
  for (const card of attached.keys()) removeControl(card);
  controls.clear();
  host?.remove();
  host = null;
}
export async function startSelectionMode() {
  stopSelectionMode();
  if (
    !['www.youtube.com', 'youtube.com', 'hackertube.org'].includes(
      location.hostname,
    )
  )
    throw new Error('Open YouTube or HackerTube first.');
  active = true;
  selectionWindow = document.defaultView;
  for (const type of CAPTURE_EVENTS)
    selectionWindow?.addEventListener(type, captureSelectionEvent, {
      capture: true,
      passive: false,
    });
  browser.storage.onChanged.addListener(storageChanged);
  host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent =
    ':host{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;font:14px system-ui}section{display:flex;align-items:center;gap:12px;padding:14px 18px;border:1px solid #f15a24;border-radius:16px;background:#1b1816;color:#fff;box-shadow:0 10px 40px #0005}button{padding:10px;border:0;border-radius:8px;cursor:pointer;background:#f15a24;color:white;font:inherit}button:focus-visible{outline:3px solid white}';
  const bar = document.createElement('section');
  bar.setAttribute('aria-label', 'Darb video selection');
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.textContent = 'Loading selection…';
  const build = document.createElement('strong');
  build.textContent = `Full-card selection v${SELECTION_VERSION}`;
  bar.append(build, status);
  const button = (text: string, action: () => void) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = text;
    element.onclick = action;
    bar.append(element);
  };
  button('Review playlist', () => {
    void browser.runtime
      .sendMessage({ type: 'DARB_REVIEW_SELECTION' })
      .then((response) => {
        if (response?.ok) stopSelectionMode();
        else announce(response?.error ?? 'Unable to open playlist review.');
      });
  });
  button('Save for later', stopSelectionMode);
  button('Cancel', () => {
    void send('selection.cancel')
      .then(stopSelectionMode)
      .catch((error) => announce(error.message));
  });
  shadow.append(style, bar);
  document.documentElement.append(host);
  await refresh();
  if (!active) return 0;
  scan();
  observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(scan, 150);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href', 'title', 'overlay-style'],
  });
  return attached.size;
}

if (typeof window !== 'undefined')
  window.addEventListener('pagehide', stopSelectionMode);
