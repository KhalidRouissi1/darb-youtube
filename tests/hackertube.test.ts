import {
  EMBED_REQUEST,
  installEmbeddedRelay,
} from '@/lib/platforms/hackertube-relay';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EmbeddedPlayer,
  hackerTubePlayer,
  readHackerTubeMetadata,
} from '@/lib/platforms/hackertube';
import { parseVideoUrl, sameVideo, sessionUrl } from '@/lib/video/platforms';
import { adapterForPage } from '@/lib/platforms/adapter';
import { cardVideo } from '@/lib/learning/selection-mode';

let dom: JSDOM;
let frame: HTMLIFrameElement;
let player: EmbeddedPlayer;
const id = 'abcdefghijk';
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('Unexpected fetch')),
  );
  dom = new JSDOM('', { url: `https://hackertube.org/watch/${id}` });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
  vi.stubGlobal('AbortController', dom.window.AbortController);
  vi.stubGlobal('location', new URL(`https://hackertube.org/watch/${id}`));
  document.body.innerHTML = `<div id="player"><iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0"></iframe></div>`;
  frame = document.querySelector('iframe')!;
  installEmbeddedRelay();
  player = hackerTubePlayer()!;
});
afterEach(() => {
  player?.dispose();
  vi.useRealTimers();
  dom.window.close();
  vi.unstubAllGlobals();
});
function deliver(
  info: object,
  origin = 'https://www.youtube-nocookie.com',
  source = frame.contentWindow,
) {
  window.dispatchEvent(
    new dom.window.MessageEvent('message', {
      origin,
      source,
      data: JSON.stringify({ event: 'infoDelivery', info }),
    }),
  );
}
describe('HackerTube integration', () => {
  it('preserves source URLs and shares YouTube video identity', () => {
    const identity = parseVideoUrl(
      `https://hackertube.org/watch/${id}?foo=bar`,
    )!;
    expect(identity.videoUrl).toBe(`https://hackertube.org/watch/${id}`);
    expect(
      sameVideo(
        identity,
        parseVideoUrl(`https://www.youtube.com/watch?v=${id}`)!,
      ),
    ).toBe(true);
    expect(sessionUrl(identity.videoUrl, 90)).toContain('t=90s');
    for (const url of [
      'https://hackertube.org/',
      'https://hackertube.org.evil/watch/abcdefghijk',
      'https://hackertube.org/watch/not-valid',
      'http://hackertube.org/watch/abcdefghijk',
    ])
      expect(parseVideoUrl(url)).toBeNull();
  });
  it('uses the YouTube widget handshake and repeats it when the iframe becomes ready', () => {
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        source: frame.contentWindow,
        origin: 'https://www.youtube-nocookie.com',
        data: JSON.stringify({ event: 'readyToListen' }),
      }),
    );
    expect(post).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'listening',
        id: 'darb-hackertube',
        channel: 'widget',
      }),
      'https://www.youtube-nocookie.com',
    );
  });
  it('restricts the page relay to playback commands for the current embedded video', () => {
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    const request = (func: string, args: unknown[]) =>
      document.dispatchEvent(
        new dom.window.CustomEvent(EMBED_REQUEST, {
          detail: JSON.stringify({
            event: 'command',
            func,
            args,
            channel: 'widget',
            id: 'darb-hackertube',
          }),
        }),
      );
    request('loadVideoById', ['other-video']);
    request('seekTo', [-1, true]);
    request('addEventListener', ['arbitraryCallback']);
    expect(post).not.toHaveBeenCalled();
    request('playVideo', []);
    expect(post).toHaveBeenCalledTimes(1);
    frame.src = 'https://evil.example/embed/abcdefghijk';
    const otherPost = vi.spyOn(frame.contentWindow!, 'postMessage');
    request('playVideo', []);
    expect(otherPost).not.toHaveBeenCalled();
  });
  it('reads HackerTube cards including their own anchor and visible title', () => {
    const card = document.createElement('a');
    card.className = 'vcard';
    card.href = `https://hackertube.org/watch/${id}`;
    card.title = 'Recommendation text';
    card.innerHTML =
      '<div class="thumb"><img src="https://hackertube.org/frames/abcdefghijk.jpg"><span>1:00:00</span></div><h3>Useful lecture</h3>';
    expect(cardVideo(card)).toMatchObject({
      videoId: id,
      title: 'Useful lecture',
      videoUrl: `https://hackertube.org/watch/${id}`,
    });
  });
  it('enables the embedded API and authenticates message origin, frame and identity', () => {
    expect(new URL(frame.src).searchParams.get('enablejsapi')).toBe('1');
    expect(new URL(frame.src).searchParams.get('origin')).toBe(
      'https://hackertube.org',
    );
    const info = {
      videoData: { video_id: id },
      duration: 3600,
      currentTime: 42,
      playerState: 1,
    };
    deliver(info, 'https://evil.example');
    expect(player.readyState).toBe(0);
    deliver(info, 'https://www.youtube-nocookie.com', window);
    expect(player.readyState).toBe(0);
    deliver({ ...info, videoData: { video_id: 'other-video' } });
    expect(player.readyState).toBe(0);
    deliver(info);
    expect(player.duration).toBe(3600);
    expect(player.currentTime).toBe(42);
    expect(player.readyState).toBe(1);
  });
  it('sends seek/pause commands without accepting stale seek positions', () => {
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    deliver({ videoData: { video_id: id }, duration: 3600, currentTime: 0 });
    player.currentTime = 900;
    player.pause();
    expect(post).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'command',
        func: 'seekTo',
        args: [900, true],
        id: 'darb-hackertube',
        channel: 'widget',
      }),
      'https://www.youtube-nocookie.com',
    );
    expect(post).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'command',
        func: 'pauseVideo',
        args: [],
        id: 'darb-hackertube',
        channel: 'widget',
      }),
      'https://www.youtube-nocookie.com',
    );
    deliver({ currentTime: 0 });
    expect(player.currentTime).toBe(0);
    deliver({ currentTime: 900.2 });
    expect(player.currentTime).toBe(900.2);
  });
  it.each([1, 60, 125])(
    'confirms a restart at zero after watching %i seconds',
    async (position) => {
      deliver({
        videoData: { video_id: id },
        duration: 3600,
        currentTime: position,
        playerState: 2,
      });
      const post = vi.spyOn(frame.contentWindow!, 'postMessage');
      const controller = new AbortController();
      let done = false;
      const seek = player.seekTo(0, controller.signal, true).then(() => {
        done = true;
      });
      deliver({ currentTime: position });
      await vi.advanceTimersByTimeAsync(600);
      expect(done).toBe(false);
      expect(post).toHaveBeenCalledWith(
        expect.stringContaining('playVideo'),
        'https://www.youtube-nocookie.com',
      );
      deliver({ currentTime: 0, playerState: 1 });
      await vi.advanceTimersByTimeAsync(100);
      await seek;
      expect(player.currentTime).toBe(0);
      expect(player.seeking).toBe(false);
    },
  );
  it('waits for a nonzero resume checkpoint rather than reporting an optimistic seek', async () => {
    deliver({
      videoData: { video_id: id },
      duration: 3600,
      currentTime: 10,
      playerState: 1,
    });
    const seek = player.seekTo(125, new AbortController().signal, true);
    expect(player.currentTime).toBe(10);
    expect(player.seeking).toBe(true);
    deliver({ currentTime: 125, playerState: 1 });
    await vi.advanceTimersByTimeAsync(100);
    await seek;
    expect(player.currentTime).toBe(125);
  });
  it('reports an unacknowledged seek and clears the pending seek', async () => {
    deliver({
      videoData: { video_id: id },
      duration: 3600,
      currentTime: 60,
      playerState: 2,
    });
    const check = expect(
      player.seekTo(0, new AbortController().signal, true),
    ).rejects.toThrow(/did not confirm/);
    await vi.advanceTimersByTimeAsync(8001);
    await check;
    expect(player.currentTime).toBe(60);
    expect(player.seeking).toBe(false);
  });
  it('does not claim playback started until the iframe confirms it', async () => {
    deliver({
      videoData: { video_id: id },
      duration: 3600,
      currentTime: 60,
      playerState: 2,
    });
    const check = expect(player.play()).rejects.toThrow(/did not respond/);
    await vi.advanceTimersByTimeAsync(3001);
    await check;
    const play = player.play();
    deliver({ playerState: 1 });
    await vi.advanceTimersByTimeAsync(100);
    await play;
  });
  it('cancels a pending seek when session ownership is lost', async () => {
    deliver({ videoData: { video_id: id }, duration: 3600, currentTime: 60 });
    const controller = new AbortController();
    const check = expect(
      player.seekTo(0, controller.signal, true),
    ).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await vi.advanceTimersByTimeAsync(100);
    await check;
    expect(player.seeking).toBe(false);
  });
  it('replaces a disposed cached player on the same iframe', () => {
    deliver({ videoData: { video_id: id }, duration: 3600, currentTime: 60 });
    player.dispose();
    const previous = player;
    player = hackerTubePlayer()!;
    expect(player).not.toBe(previous);
    expect(player.readyState).toBe(0);
    deliver({ videoData: { video_id: id }, duration: 3600, currentTime: 60 });
    expect(player.readyState).toBe(1);
  });
  it('preserves a verified handshake delivered before the iframe load event', () => {
    deliver({ videoData: { video_id: id }, duration: 3600, currentTime: 60 });
    frame.dispatchEvent(new dom.window.Event('load'));
    expect(player.readyState).toBe(1);
    deliver({ videoData: { video_id: id }, duration: 3600, currentTime: 60 });
    expect(player.readyState).toBe(1);
  });
  it('signals completion once, supports playlist progression, and detaches replaced frames', () => {
    const ended = vi.fn();
    const playlistEnded = vi.fn();
    player.addEventListener('ended', ended);
    document.addEventListener('darb-embedded-ended', playlistEnded, {
      once: true,
    });
    deliver({
      videoData: { video_id: id },
      duration: 100,
      currentTime: 99,
      playerState: 1,
    });
    window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        source: frame.contentWindow,
        origin: 'https://www.youtube-nocookie.com',
        data: JSON.stringify({ event: 'onStateChange', info: 0 }),
      }),
    );
    deliver({ playerState: 0 });
    expect(ended).toHaveBeenCalledOnce();
    expect(playlistEnded).toHaveBeenCalledOnce();
    expect(player.ended).toBe(true);
    expect(player.currentTime).toBe(100);
    player.currentTime = 50;
    expect(player.ended).toBe(false);
    expect(player.currentTime).toBe(100);
    frame.remove();
    deliver({ currentTime: 12 });
    expect(player.currentTime).toBe(100);
    expect(player.isConnected).toBe(false);
  });
  it('reads duration before Play without waiting for the embedded player', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ video: { vid: id, duration_s: 2994 } }),
    } as Response);
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div class="watch"><h1>Clean Architecture</h1><div class="owner"><div class="who"><b>Next Day Video</b></div></div></div>',
    );
    expect(await readHackerTubeMetadata()).toMatchObject({
      videoId: id,
      durationSeconds: 2994,
      title: 'Clean Architecture',
      channelName: 'Next Day Video',
    });
    expect(fetch).toHaveBeenCalledWith(
      `https://hackertube.org/api/video?vid=${id}`,
      expect.objectContaining({ credentials: 'omit' }),
    );
  });
  it('rejects metadata if navigation changes the video during the request', async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const read = adapterForPage()!.readMetadata();
    dom.reconfigure({ url: 'https://hackertube.org/watch/xxxxxxxxxxx' });
    vi.stubGlobal('location', dom.window.location);
    resolve({
      ok: true,
      json: async () => ({ video: { vid: id, duration_s: 100 } }),
    } as Response);
    await expect(read).rejects.toThrow(/changed videos/);
  });
  it('bounds a stalled HackerTube metadata request', async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const check = expect(readHackerTubeMetadata()).rejects.toThrow(
      /did not return/,
    );
    await vi.advanceTimersByTimeAsync(4001);
    await check;
  });
  it('rejects metadata for the wrong video or missing duration', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ video: { vid: 'xxxxxxxxxxx', duration_s: 100 } }),
    } as Response);
    await expect(readHackerTubeMetadata()).rejects.toThrow(
      /valid recorded duration/,
    );
  });
  it('rejects a mismatched or untrusted embed', () => {
    player.dispose();
    frame.src = 'https://evil.example/embed/abcdefghijk';
    expect(hackerTubePlayer()).toBeNull();
    frame.src = 'https://www.youtube-nocookie.com/embed/xxxxxxxxxxx';
    expect(hackerTubePlayer()).toBeNull();
  });
});
