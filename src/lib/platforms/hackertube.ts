import {
  EMBED_REQUEST,
  EMBED_RESPONSE,
  embeddedYouTubeUrl,
} from './hackertube-relay';
import { parseVideoUrl, isHackerTubeUrl } from '../video/platforms';
import { withTimeout } from '../utils/with-timeout';
import type { VideoMetadata } from '@/types/video';
import type { MediaPlayer } from './media-player';

const players = new WeakMap<HTMLIFrameElement, EmbeddedPlayer>();
export function hackerTubePlayer(): EmbeddedPlayer | null {
  if (!isHackerTubeUrl(location.href)) return null;
  const identity = parseVideoUrl(location.href);
  if (!identity) return null;
  const frame = document.querySelector<HTMLIFrameElement>('#player iframe');
  if (!frame) return null;
  const url = embeddedYouTubeUrl(frame.src, identity.videoId);
  if (!url) return null;
  let player = players.get(frame);
  if (
    player &&
    (!player.isConnected || url.searchParams.get('enablejsapi') !== '1')
  ) {
    player.dispose();
    player = undefined;
  }
  if (!player) {
    player = new EmbeddedPlayer(frame, url, identity.videoId);
    players.set(frame, player);
  }
  return player;
}

/** Local message transport; no remote scripts or iframe DOM access. */
export class EmbeddedPlayer extends EventTarget implements MediaPlayer {
  private seconds = 0;
  private length = NaN;
  private state = -1;
  private identityVerified = false;
  private pendingSeek: { seconds: number; until: number } | null = null;
  private controller = new AbortController();
  private timer: ReturnType<typeof setInterval>;
  constructor(
    private frame: HTMLIFrameElement,
    url: URL,
    private videoId: string,
  ) {
    super();
    document.addEventListener(EMBED_RESPONSE, this.receiveRelayed, {
      signal: this.controller.signal,
    });
    frame.addEventListener('load', this.loaded, {
      signal: this.controller.signal,
    });
    if (url.searchParams.get('enablejsapi') !== '1') {
      url.searchParams.set('enablejsapi', '1');
      url.searchParams.set('origin', location.origin);
      frame.src = url.href;
    }
    this.listen();
    this.timer = setInterval(() => {
      if (!this.isConnected) {
        this.dispose();
        return;
      }
      if (!this.readyState) this.listen();
    }, 500);
  }
  get isConnected() {
    return (
      !this.controller.signal.aborted &&
      this.frame.isConnected &&
      parseVideoUrl(location.href)?.videoId === this.videoId &&
      embeddedYouTubeUrl(this.frame.src, this.videoId) !== null
    );
  }
  get currentTime() {
    return this.ended && Number.isFinite(this.length)
      ? this.length
      : this.seconds;
  }
  get seeking() {
    return this.pendingSeek !== null;
  }
  set currentTime(value: number) {
    if (!Number.isFinite(value) || value < 0) return;
    this.command('seekTo', [value, true]);
    // Only infoDelivery can confirm the actual playback position.
    if (this.state === 0) this.state = 2;
    this.pendingSeek = { seconds: value, until: Date.now() + 2000 };
  }
  get duration() {
    return this.length;
  }
  get readyState() {
    return this.identityVerified &&
      Number.isFinite(this.length) &&
      this.length > 0
      ? 1
      : 0;
  }
  get ended() {
    return this.state === 0;
  }
  async seekTo(seconds: number, signal: AbortSignal, startPlayback: boolean) {
    signal.throwIfAborted();
    this.currentTime = seconds;
    const seek = this.pendingSeek;
    if (!seek)
      throw new Error('The session position must be a non-negative number.');
    seek.until = Date.now() + 8000;
    // A cued embedded player can defer seeking until playback starts.
    if (startPlayback) this.command('playVideo');
    try {
      await this.waitFor(
        () => !this.pendingSeek && Math.abs(this.currentTime - seconds) < 2,
        8000,
        signal,
      );
    } catch (error) {
      if (this.pendingSeek === seek) this.pendingSeek = null;
      signal.throwIfAborted();
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new Error(
        'The embedded player did not confirm the session position. Press Play on HackerTube, then retry.',
      );
    }
  }
  async play(signal?: AbortSignal) {
    this.command('playVideo');
    await this.waitFor(() => this.state === 1, 3000, signal);
  }
  pause() {
    this.command('pauseVideo');
  }
  private async waitFor(
    confirmed: () => boolean,
    timeout: number,
    signal?: AbortSignal,
  ) {
    const deadline = Date.now() + timeout;
    while (true) {
      signal?.throwIfAborted();
      this.controller.signal.throwIfAborted();
      if (!this.isConnected) throw new Error('The embedded video changed.');
      if (confirmed()) return;
      if (Date.now() >= deadline)
        throw new Error('The embedded player did not respond.');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  private post(message: object) {
    document.dispatchEvent(
      new CustomEvent(EMBED_REQUEST, {
        detail: JSON.stringify({
          ...message,
          id: 'darb-hackertube',
          channel: 'widget',
        }),
      }),
    );
  }
  private command(func: string, args: unknown[] = []) {
    if (this.isConnected) this.post({ event: 'command', func, args });
  }
  private listen = () => {
    this.post({ event: 'listening' });
  };
  private loaded = () => {
    // YouTube can send initialDelivery before the iframe's load event. Do not
    // discard that verified handshake: subsequent listens may only receive
    // alreadyInitialized, which contains no metadata to rebuild readiness.
    this.listen();
  };
  private receiveRelayed = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (typeof detail !== 'string') return;
    // The page-world relay validates the source frame and origin before delivery.
    if (!this.isConnected) return;
    let data;
    try {
      data = JSON.parse(detail);
    } catch {
      return;
    }
    if (!data || typeof data !== 'object') return;
    if (data.event === 'readyToListen') {
      this.listen();
      return;
    }
    if (data.event === 'onReady') {
      this.command('addEventListener', ['onStateChange']);
      return;
    }
    if (
      data.event === 'onStateChange' &&
      this.identityVerified &&
      typeof data.info === 'number'
    ) {
      this.updateState(data.info);
      return;
    }
    if (
      !['infoDelivery', 'initialDelivery'].includes(data.event) ||
      !data.info ||
      typeof data.info !== 'object'
    )
      return;
    const info = data.info;
    if (info.videoData?.video_id) {
      this.identityVerified = info.videoData.video_id === this.videoId;
      if (!this.identityVerified) {
        this.length = NaN;
        return;
      }
    }
    if (!this.identityVerified) return;
    if (
      typeof info.duration === 'number' &&
      Number.isFinite(info.duration) &&
      info.duration > 0
    )
      this.length = info.duration;
    if (
      typeof info.currentTime === 'number' &&
      Number.isFinite(info.currentTime) &&
      info.currentTime >= 0
    ) {
      if (
        !this.pendingSeek ||
        Date.now() >= this.pendingSeek.until ||
        Math.abs(info.currentTime - this.pendingSeek.seconds) < 0.5
      ) {
        this.seconds = info.currentTime;
        this.pendingSeek = null;
      }
    }
    if (typeof info.playerState === 'number')
      this.updateState(info.playerState);
    this.dispatchEvent(new Event('timeupdate'));
  };
  private updateState(state: number) {
    const previous = this.state;
    this.state = state;
    if (previous === state) return;
    if (state === 1) this.dispatchEvent(new Event('play'));
    if (state === 2) this.dispatchEvent(new Event('pause'));
    if (state === 0) {
      if (Number.isFinite(this.length)) this.seconds = this.length;
      this.dispatchEvent(new Event('ended'));
      document.dispatchEvent(new CustomEvent('darb-embedded-ended'));
    }
  }
  dispose() {
    clearInterval(this.timer);
    this.controller.abort();
  }
}

export async function waitForHackerTubePlayer(
  signal: AbortSignal,
): Promise<EmbeddedPlayer> {
  // Starting a Darb session is explicit user intent to open the site's player.
  if (isHackerTubeUrl(location.href))
    document.querySelector<HTMLButtonElement>('#player #poster')?.click();
  const deadline = Date.now() + 10000;
  while (!signal.aborted && Date.now() < deadline) {
    const player = hackerTubePlayer();
    if (player?.readyState) return player;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  signal.throwIfAborted();
  throw new Error(
    'Press Play on HackerTube, then retry. The embedded recorded video must be available.',
  );
}

/** Read course metadata without requiring an embedded player to be playing. */
export async function readHackerTubeMetadata(): Promise<VideoMetadata> {
  const identity = parseVideoUrl(location.href);
  if (!isHackerTubeUrl(location.href) || !identity)
    throw new Error('Open a HackerTube video first.');
  let duration = hackerTubePlayer()?.duration;
  if (!Number.isFinite(duration) || !duration || duration <= 0) {
    const controller = new AbortController();
    try {
      const url = new URL('/api/video', location.origin);
      url.searchParams.set('vid', identity.videoId);
      const data = await withTimeout(
        fetch(url.href, {
          credentials: 'omit',
          signal: controller.signal,
        }).then(async (response) => {
          if (!response.ok)
            throw new Error('HackerTube could not return video details.');
          return response.json();
        }),
        4000,
        'HackerTube did not return video details. Please retry.',
      );
      if (
        data?.video?.vid !== identity.videoId ||
        typeof data.video.duration_s !== 'number' ||
        !Number.isFinite(data.video.duration_s) ||
        data.video.duration_s <= 0
      )
        throw new Error(
          'This HackerTube video has no valid recorded duration.',
        );
      duration = data.video.duration_s;
    } finally {
      controller.abort();
    }
  }
  if (
    !isHackerTubeUrl(location.href) ||
    parseVideoUrl(location.href)?.videoId !== identity.videoId
  )
    throw new Error(
      'HackerTube changed videos. Open Darb again on the current video.',
    );
  return {
    ...identity,
    title:
      document.querySelector('.watch h1')?.textContent?.trim().slice(0, 500) ||
      document.title.replace(/ - HackerTube$/, '') ||
      'HackerTube video',
    channelName:
      document
        .querySelector('.owner .who b')
        ?.textContent?.trim()
        .slice(0, 300) || 'HackerTube',
    thumbnailUrl: `https://i.ytimg.com/vi/${identity.videoId}/hqdefault.jpg`,
    durationSeconds: duration!,
  };
}
