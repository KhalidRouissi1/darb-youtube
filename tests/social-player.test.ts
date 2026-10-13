import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, it, expect, vi } from 'vitest';
import {
  adapterForPage,
  facebookVideoRoot,
  selectSocialPlayer,
  xPostRoot,
} from '@/lib/platforms/adapter';
const fixture = readFileSync(
  new URL('./fixtures/social-videos.html', import.meta.url),
  'utf8',
);
function page() {
  const dom = new JSDOM(fixture);
  for (const video of dom.window.document.querySelectorAll('video'))
    video.getBoundingClientRect = () =>
      ({ width: 640, height: 360 }) as DOMRect;
  return dom.window.document;
}
describe('post-scoped player selection', () => {
  it('reads an ordinary X video inside placementTracking without treating it as an ad', async () => {
    const dom = new JSDOM('<div data-testid="placementTracking"><article data-testid="tweet"><a href="/teacher/status/123"><time>Today</time></a><div data-testid="tweetText">Recorded lecture</div><video></video></article></div>', { url: 'https://x.com/teacher/status/123' });
    const video = dom.window.document.querySelector('video')!;
    video.getBoundingClientRect = () => ({ width: 640, height: 360 } as DOMRect);
    Object.defineProperty(video, 'duration', { value: 8700.712 });
    Object.defineProperty(video, 'readyState', { value: 4 });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    try {
      const adapter = adapterForPage()!;
      expect(adapter.isAd()).toBe(false);
      expect(await adapter.readMetadata()).toMatchObject({ platform: 'x', videoId: '123', title: 'Recorded lecture', durationSeconds: 8700.712 });
    } finally { vi.unstubAllGlobals(); dom.window.close(); }
  });

  it('selects the X post player, not the reply player', () => {
    const doc = page();
    expect(xPostRoot(doc, '123')?.querySelector('video')?.id).toBe('x-target');
    expect(selectSocialPlayer(doc, 'x', '123')?.id).toBe('x-target');
    expect(selectSocialPlayer(doc, 'x', '777')).toBeNull();
  });
  it('rejects ambiguous videos within the selected post', () => {
    const doc = page();
    const video = doc.querySelector<HTMLVideoElement>('#x-target')!;
    const clone = video.cloneNode() as HTMLVideoElement;
    clone.getBoundingClientRect = video.getBoundingClientRect;
    video.parentElement!.append(clone);
    expect(() => selectSocialPlayer(doc, 'x', '123')).toThrow('Several videos');
  });
  it('ignores a nested quoted/reply post with its own player', () => {
    const doc = page();
    doc
      .querySelector('[data-testid="tweet"]')!
      .append(doc.querySelectorAll('[data-testid="tweet"]')[1]!);
    expect(selectSocialPlayer(doc, 'x', '123')?.id).toBe('x-target');
  });
  it('uses Facebook permalink ownership, ignoring recommendations', () => {
    const doc = page();
    expect(selectSocialPlayer(doc, 'facebook', '789')?.id).toBe('fb-target');
    expect(selectSocialPlayer(doc, 'facebook', '999')?.id).toBe(
      'fb-recommendation',
    );
    expect(
      facebookVideoRoot(doc.querySelector('#fb-recommendation')!, '789'),
    ).toBeNull();
  });
  it('does not guess when Facebook provides no ownership evidence', () => {
    const doc = page();
    doc.querySelector('#watch_feed a')!.remove();
    expect(selectSocialPlayer(doc, 'facebook', '789')).toBeNull();
  });
  it('ignores hidden or disconnected players', () => {
    const doc = page();
    doc
      .querySelector('#x-target')!
      .parentElement!.setAttribute('aria-hidden', 'true');
    expect(selectSocialPlayer(doc, 'x', '123')).toBeNull();
  });
});
