import { browser } from 'wxt/browser';
import { parseVideoUrl } from './platforms';
import { readVideoPosition } from './position';
import { adapterForPage } from '@/lib/platforms/adapter';
import { formatTimestamp } from '@/lib/utils/time';
const KEY = 'darb:note-mode';
export function installFloatingNotes() {
  let enabled = false;
  let disposed = false;
  let expanded = false;
  let current = '';
  let dirty = true;
  let loading = false;
  let host: HTMLDivElement | null = null;
  let shadow: ShadowRoot | null = null;
  const drafts = new Map<string, string>();
  const remove = () => {
    host?.remove();
    host = null;
    shadow = null;
    current = '';
  };
  const readMode = async () => {
    const saved = await browser.storage.local.get(KEY);
    enabled = saved[KEY] === true;
    if (!enabled) remove();
    else await sync();
  };
  const load = async () => {
    if (loading || !shadow || !current) return;
    loading = true;
    const identity = current;
    try {
      const response = await browser.runtime.sendMessage({
        type: 'DARB_VIDEO_NOTES',
        action: { op: 'read' },
      });
      if (disposed || current !== identity || !shadow) return;
      const status = shadow.querySelector<HTMLElement>('[role=status]')!;
      const list = shadow.querySelector<HTMLElement>('.notes')!;
      list.replaceChildren();
      if (!response?.ok)
        throw new Error(response?.error ?? 'Unable to load notes.');
      const data = response.data;
      const form = shadow.querySelector<HTMLFormElement>('form')!;
      form.hidden = data.needsCourse === true;
      status.textContent = data.needsCourse
        ? 'Create a course for this video in Darb to start taking notes.'
        : '';
      for (const note of data.notes ?? []) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'note';
        row.textContent = `${typeof note.seconds === 'number' ? formatTimestamp(note.seconds) + ' · ' : ''}${note.body || note.title}`;
        row.disabled = typeof note.seconds !== 'number';
        row.addEventListener('click', () => {
          if (
            current !== identity ||
            parseVideoUrl(window.location.href)?.videoId !== identity
          )
            return;
          const player = adapterForPage()?.findPlayer();
          if (player && !adapterForPage()?.isAd())
            player.currentTime = note.seconds;
        });
        list.append(row);
      }
      dirty = false;
    } catch (error) {
      if (shadow && current === identity)
        shadow.querySelector<HTMLElement>('[role=status]')!.textContent =
          error instanceof Error ? error.message : 'Unable to load notes.';
    } finally {
      loading = false;
    }
  };
  const build = () => {
    host = document.createElement('div');
    host.id = 'darb-floating-notes';
    host.style.cssText =
      'position:fixed;right:20px;bottom:20px;z-index:2147483646';
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `:host{font:14px/1.5 system-ui;color:#242321}*{box-sizing:border-box}button,textarea{font:inherit}button{cursor:pointer}button:focus-visible,textarea:focus-visible{outline:3px solid #e95520;outline-offset:3px}.bubble{border:1px solid #c63c10;background:#e95520;color:white;padding:12px 18px;border-radius:24px;box-shadow:0 6px 22px #0003;font-weight:650}.panel{width:min(340px,calc(100vw - 40px));max-height:65vh;overflow:auto;background:#fff;border:1px solid #dedbd7;border-radius:14px;padding:18px;box-shadow:0 12px 36px #0004;margin-bottom:10px}.panel[hidden],form[hidden]{display:none}h2{font-size:17px;margin:0 0 8px}.hint,[role=status]{font-size:12px;color:#625f59}textarea{width:100%;min-height:100px;resize:vertical;padding:10px;border:1px solid #aaa59d;border-radius:6px;background:white;color:#242321}.save{border:0;background:#e95520;color:white;padding:9px 14px;border-radius:6px;margin:8px 0}.save:disabled{opacity:.5;cursor:wait}.note{display:block;width:100%;white-space:pre-wrap;overflow-wrap:anywhere;text-align:left;padding:12px 0;border:0;border-top:1px solid #ddd;background:none;color:#242321}.note:disabled{cursor:default}.clock{font-variant-numeric:tabular-nums} `;
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.hidden = !expanded;
    panel.setAttribute('aria-label', 'Video notes');
    const title = document.createElement('h2');
    title.textContent = 'Darb video notes';
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Current time: ';
    const clock = document.createElement('span');
    clock.className = 'clock';
    hint.append(clock);
    const form = document.createElement('form');
    const textarea = document.createElement('textarea');
    textarea.maxLength = 100000;
    textarea.required = true;
    textarea.setAttribute('aria-label', 'Your video note');
    textarea.placeholder = 'Capture an idea at this moment…';
    textarea.addEventListener('input', () => {
      drafts.set(current, textarea.value);
    });
    const save = document.createElement('button');
    save.className = 'save';
    save.textContent = 'Save note at current time';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    form.append(textarea, save);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (save.disabled || !textarea.value.trim()) return;
      const source = current;
      const body = textarea.value;
      save.disabled = true;
      try {
        const position = readVideoPosition();
        if (position.videoId !== source)
          throw new Error('The video changed. Try again.');
        const result = await browser.runtime.sendMessage({
          type: 'DARB_VIDEO_NOTES',
          action: {
            op: 'save',
            videoId: source,
            body,
            seconds: Math.floor(
              Math.min(position.seconds, position.durationSeconds - 0.01),
            ),
          },
        });
        if (!result?.ok)
          throw new Error(result?.error ?? 'Unable to save note.');
        drafts.delete(source);
        if (current === source && shadow) {
          textarea.value = '';
          dirty = true;
          await load();
          status.textContent =
            'Note saved at ' + formatTimestamp(position.seconds) + '.';
        }
      } catch (error) {
        status.textContent =
          error instanceof Error ? error.message : 'Unable to save note.';
      } finally {
        save.disabled = false;
      }
    });
    const list = document.createElement('div');
    list.className = 'notes';
    panel.append(title, hint, form, status, list);
    const bubble = document.createElement('button');
    bubble.className = 'bubble';
    bubble.type = 'button';
    bubble.textContent = 'Darb notes';
    bubble.setAttribute('aria-expanded', String(expanded));
    bubble.addEventListener('click', () => {
      expanded = !expanded;
      panel.hidden = !expanded;
      bubble.setAttribute('aria-expanded', String(expanded));
      if (expanded) {
        void load();
        textarea.focus();
      }
    });
    shadow.append(style, panel, bubble);
    document.documentElement.append(host);
  };
  async function sync() {
    if (disposed || !enabled) return;
    const identity = parseVideoUrl(window.location.href);
    if (!identity) {
      remove();
      return;
    }
    if (!host) build();
    if (current !== identity.videoId) {
      current = identity.videoId;
      dirty = true;
      shadow!.querySelector('textarea')!.value = drafts.get(current) ?? '';
      shadow!.querySelector('.notes')!.replaceChildren();
    }
    try {
      shadow!.querySelector('.clock')!.textContent = formatTimestamp(
        readVideoPosition().seconds,
      );
    } catch {
      shadow!.querySelector('.clock')!.textContent = 'Waiting for video';
    }
    if (dirty) await load();
  }
  const changed = (changes: Record<string, unknown>, area: string) => {
    if (area !== 'local') return;
    if (KEY in changes) void readMode();
    if ('darb:workspace' in changes || 'coursora:courses' in changes) {
      dirty = true;
      void sync();
    }
  };
  browser.storage.onChanged.addListener(changed);
  void readMode().catch(() => undefined);
  return {
    sync,
    dispose: () => {
      disposed = true;
      remove();
      browser.storage.onChanged.removeListener(changed);
    },
  };
}
