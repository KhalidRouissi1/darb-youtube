import { adapterForPage } from '@/lib/platforms/adapter';
import { withTimeout } from '@/lib/utils/with-timeout';
import { readVideoPosition } from './position';
import { browser } from 'wxt/browser';
import { parseVideoUrl } from './platforms';

type Context = {
  id: string;
  videoId: string;
  title: string;
  index: number;
  total: number;
  completedVideos: number;
  completed: boolean;
  next: { videoId: string; title: string } | null;
};

/** Current playlist only; refresh on navigation or saved progress changes. */
export function installPlaylistControls() {
  let host: HTMLDivElement | undefined;
  let lastUrl = '';
  let dirty = true;
  let loading = false;
  let disposed = false;
  let minimized = false;
  let rendered = '';
  let currentContext: Context | null = null;
  let savingEnd = false;
  let completionError = '';
  const remove = () => {
    host?.remove();
    host = undefined;
    rendered = '';
    currentContext = null;
  };
  const changed = (changes: Record<string, unknown>) => {
    if (
      ['darb:learning', 'coursora:courses', 'coursora:active-playback'].some(
        (key) => key in changes,
      )
    )
      dirty = true;
  };
  browser.storage.onChanged.addListener(changed);
  function render(context: Context) {
    const signature = JSON.stringify([context, completionError]);
    if (signature === rendered && host) return;
    remove();
    rendered = signature;
    currentContext = context;
    host = document.createElement('div');
    host.id = 'darb-playlist-controls';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { position: fixed; left: 16px; bottom: 68px; z-index: 2147483645; font: 13px/1.5 system-ui, sans-serif; color: #fff; }
      section { width: min(320px, calc(100vw - 32px)); box-sizing: border-box; padding: 14px; background: #222126; border: 1px solid #ffffff26; border-radius: 14px; box-shadow: 0 8px 30px #0004; }
      header { display: flex; gap: 12px; align-items: start; } strong { flex: 1; overflow-wrap: anywhere; }
      p { margin: 8px 0; } .meta { color: #d1cfd6; font-size: 12px; } button { font: inherit; color: inherit; cursor: pointer; border: 0; }
      .toggle { background: transparent; padding: 0 4px; } .next { width: 100%; border-radius: 8px; padding: 9px; background: #f15a24; font-weight: 600; }
      .next:disabled { opacity: .6; cursor: wait; } .error { color: #ffb1a7; } [hidden] { display: none; }
    `;
    const card = document.createElement('section');
    card.setAttribute('aria-label', 'Darb playlist');
    const header = document.createElement('header');
    const title = document.createElement('strong');
    title.textContent = context.completed
      ? `✓ Playlist completed: ${context.title}`
      : context.title;
    const toggle = document.createElement('button');
    toggle.className = 'toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Toggle playlist details');
    toggle.setAttribute('aria-expanded', String(!minimized));
    toggle.textContent = minimized ? '+' : '−';
    const details = document.createElement('div');
    details.hidden = minimized;
    toggle.onclick = () => {
      minimized = !minimized;
      details.hidden = minimized;
      toggle.textContent = minimized ? '+' : '−';
      toggle.setAttribute('aria-expanded', String(!minimized));
    };
    const progress = document.createElement('p');
    progress.className = 'meta';
    progress.textContent = `Video ${context.index + 1} of ${context.total} · ${context.completedVideos} completed`;
    const next = document.createElement('p');
    next.textContent = context.completed
      ? 'Every video is completed.'
      : context.next
        ? `Up next: ${context.next.title}`
        : 'Last video in this playlist.';
    details.append(progress, next);
    if (context.next && !context.completed) {
      const button = document.createElement('button');
      button.className = 'next';
      button.type = 'button';
      button.textContent = 'Next video →';
      const error = document.createElement('p');
      error.className = 'error';
      error.setAttribute('role', 'alert');
      error.hidden = true;
      button.onclick = async () => {
        button.disabled = true;
        error.hidden = true;
        try {
          const result = await browser.runtime.sendMessage({
            type: 'DARB_NEXT_PLAYLIST',
            playlistId: context.id,
            videoId: context.next!.videoId,
          });
          if (!result?.ok)
            throw new Error(result?.error ?? 'Could not open the next video.');
          dirty = true;
        } catch (cause) {
          error.textContent =
            cause instanceof Error
              ? cause.message
              : 'Could not open the next video.';
          error.hidden = false;
        } finally {
          button.disabled = false;
        }
      };
      details.append(button, error);
    }
    if (completionError) {
      const error = document.createElement('p');
      error.className = 'error';
      error.setAttribute('role', 'alert');
      error.textContent = completionError;
      const retry = document.createElement('button');
      retry.className = 'next';
      retry.textContent = 'Retry saving completion';
      retry.onclick = () => {
        void saveEnded(context);
      };
      details.append(error, retry);
    }
    header.append(title, toggle);
    card.append(header, details);
    shadow.append(style, card);
    document.documentElement.append(host);
  }
  async function saveEnded(context: Context) {
    if (
      savingEnd ||
      parseVideoUrl(window.location.href)?.videoId !== context.videoId
    )
      return;
    savingEnd = true;
    completionError = '';
    try {
      const result = await withTimeout(
        browser.runtime.sendMessage({
          type: 'DARB_PLAYLIST_VIDEO_ENDED',
          playlistId: context.id,
          videoId: context.videoId,
        }),
        15000,
        'Saving video completion took too long. Please retry.',
      );
      if (!result?.ok)
        throw new Error(result?.error ?? 'Could not save video completion.');
      dirty = true;
    } catch (error) {
      if (
        !disposed &&
        parseVideoUrl(window.location.href)?.videoId === context.videoId
      ) {
        completionError =
          error instanceof Error
            ? error.message
            : 'Could not save video completion.';
        render(context);
      }
    } finally {
      savingEnd = false;
    }
  }
  const ended = (event: Event) => {
    if (!currentContext || event.target !== adapterForPage()?.findPlayer())
      return;
    try {
      const position = readVideoPosition({
        videoId: currentContext.videoId,
        platform: 'youtube',
      });
      if (position.ended && position.seconds >= position.durationSeconds - 0.5)
        void saveEnded(currentContext);
    } catch {
      /* Ignore ads, replaced players and navigation. */
    }
  };
  document.addEventListener('ended', ended, true);
  return {
    async sync() {
      const url = window.location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        completionError = '';
        dirty = true;
        remove();
      }
      if (disposed || loading || !dirty) return;
      if (parseVideoUrl(url)?.platform !== 'youtube') {
        dirty = false;
        remove();
        return;
      }
      loading = true;
      dirty = false;
      try {
        const response = await browser.runtime.sendMessage({
          type: 'DARB_PLAYLIST_CONTEXT',
        });
        if (!disposed && url === window.location.href) {
          if (response?.ok && response.playlist)
            render(response.playlist as Context);
          else remove();
        }
      } catch {
        dirty = true;
      } finally {
        loading = false;
      }
    },
    dispose() {
      disposed = true;
      document.removeEventListener('ended', ended, true);
      remove();
      browser.storage.onChanged.removeListener(changed);
    },
  };
}
