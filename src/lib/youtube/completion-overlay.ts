import { browser } from 'wxt/browser';
import { formatTimestamp } from '@/lib/utils/time';
import type {
  RuntimeMessageResponse,
  SessionCompletionResponse,
} from '@/lib/messaging/messages';

const OVERLAY_ID = 'coursora-completion-overlay';

export function showCompletionOverlay(
  response: Extract<SessionCompletionResponse, { ok: true }>,
): void {
  document.getElementById(OVERLAY_ID)?.remove();

  const host = document.createElement('div');
  host.id = OVERLAY_ID;
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483647';
  host.style.pointerEvents = 'none';

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
      * { box-sizing: border-box; }
      .card {
        position: fixed;
        right: 24px;
        bottom: 24px;
        width: min(360px, calc(100vw - 32px));
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 20px;
        background: #1b1816;
        color: #fff;
        box-shadow: 0 24px 70px rgba(0,0,0,.35);
        font-family: Inter, "Segoe UI", sans-serif;
        padding: 20px;
        pointer-events: auto;
        animation: enter .24s ease-out;
      }
      @keyframes enter {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
      .icon {
        display: grid; place-items: center; width: 40px; height: 40px;
        border-radius: 11px; background: #f15a24; font-size: 20px;
      }
      h2 { margin: 16px 0 6px; font-size: 20px; line-height: 1.2; letter-spacing: -.02em; }
      p { margin: 0; color: rgba(255,255,255,.6); font-size: 13px; line-height: 1.5; }
      .progress { height: 6px; margin-top: 18px; border-radius: 99px; overflow: hidden; background: rgba(255,255,255,.1); }
      .progress > div { height: 100%; background: #f15a24; width: var(--progress); }
      .meta { display: flex; justify-content: space-between; margin-top: 8px; color: rgba(255,255,255,.5); font-size: 11px; }
      button { border: 0; font: inherit; cursor: pointer; }
      .close { background: transparent; color: rgba(255,255,255,.55); font-size: 20px; padding: 4px; }
      .next {
        width: 100%; min-height: 42px; margin-top: 18px; border-radius: 11px;
        background: #f15a24; color: white; font-size: 13px; font-weight: 700;
      }
      .next:hover { background: #d94713; }
      .next:disabled { cursor: wait; opacity: .7; }
      .error { display: none; margin-top: 10px; color: #ff9f9f; font-size: 11px; }
      .error.visible { display: block; }
  `;

  const card = document.createElement('section');
  card.className = 'card';
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');

  const row = document.createElement('div');
  row.className = 'row';

  const icon = document.createElement('div');
  icon.className = 'icon';
  icon.textContent = '✓';

  const closeButton = document.createElement('button');
  closeButton.className = 'close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close completion message');
  closeButton.textContent = '×';
  row.append(icon, closeButton);

  const heading = document.createElement('h2');
  heading.textContent = response.course.completed
    ? 'Course completed!'
    : 'Session completed';

  const message = document.createElement('p');
  message.textContent = response.course.completed
    ? 'You finished every session. Excellent work.'
    : response.nextSession
      ? `Next session starts at ${formatTimestamp(
          response.nextSession.startSeconds,
        )}.`
      : 'You reached the end. Earlier sessions are still unfinished.';

  const progress = document.createElement('div');
  progress.className = 'progress';
  progress.style.setProperty('--progress', `${response.progress.percentage}%`);
  progress.append(document.createElement('div'));

  const meta = document.createElement('div');
  meta.className = 'meta';
  const completedSessions = document.createElement('span');
  completedSessions.textContent = `${response.progress.completedSessions} of ${response.progress.totalSessions} sessions`;
  const percentage = document.createElement('span');
  percentage.textContent = `${response.progress.percentage}%`;
  meta.append(completedSessions, percentage);

  card.append(row, heading, message, progress, meta);

  if (response.nextSession) {
    const nextButton = document.createElement('button');
    nextButton.className = 'next';
    nextButton.type = 'button';
    nextButton.textContent = 'Continue to next session';
    card.append(nextButton);
  }

  const errorMessage = document.createElement('p');
  errorMessage.className = 'error';
  errorMessage.setAttribute('role', 'alert');
  card.append(errorMessage);

  shadow.append(style, card);
  document.documentElement.append(host);

  shadow.querySelector('.close')?.addEventListener('click', () => host.remove());
  shadow.querySelector('.next')?.addEventListener('click', async () => {
    const nextSession = response.nextSession;
    const button = shadow.querySelector<HTMLButtonElement>('.next');
    const errorElement = shadow.querySelector<HTMLElement>('.error');

    if (!nextSession || !button) {
      return;
    }

    button.disabled = true;
    button.textContent = 'Opening next session…';
    errorElement?.classList.remove('visible');

    try {
      const openResponse = await browser.runtime.sendMessage<
        {
          type: 'CONTINUE_SESSION_IN_TAB';
          courseId: string;
          sessionId: string;
        },
        RuntimeMessageResponse
      >({
        type: 'CONTINUE_SESSION_IN_TAB',
        courseId: response.course.id,
        sessionId: nextSession.id,
      });

      if (!openResponse?.ok) {
        throw new Error(
          openResponse?.error ?? 'The next session could not be opened.',
        );
      }

      host.remove();
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Try opening next session again';

      if (errorElement) {
        errorElement.textContent =
          error instanceof Error
            ? error.message
            : 'The next session could not be opened.';
        errorElement.classList.add('visible');
      }
    }
  });
}

export function removeCompletionOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}
