/** The packaged page-world side of the embedded player transport. No extension APIs. */
export const EMBED_REQUEST = 'darb:embed-request';
export const EMBED_RESPONSE = 'darb:embed-response';
const installed = new WeakSet<Document>();

/** Accept only the current video's supported HTTPS embed, without credentials. */
export function embeddedYouTubeUrl(
  source: string,
  videoId: string,
): URL | null {
  try {
    const url = new URL(source);
    return url.protocol === 'https:' &&
      ['www.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname) &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.pathname === `/embed/${videoId}`
      ? url
      : null;
  } catch {
    return null;
  }
}
export function installEmbeddedRelay() {
  if (installed.has(document)) return;
  installed.add(document);
  const currentFrame = () => {
    if (location.origin !== 'https://hackertube.org') return null;
    const id = /^\/watch\/([\w-]{11})\/?$/.exec(location.pathname)?.[1];
    const frame = document.querySelector<HTMLIFrameElement>('#player iframe');
    if (!id || !frame) return null;
    const url = embeddedYouTubeUrl(frame.src, id);
    if (!url) return null;
    return { frame, origin: url.origin };
  };
  document.addEventListener(EMBED_REQUEST, (event) => {
    const detail = (event as CustomEvent).detail;
    if (typeof detail !== 'string' || detail.length > 1000) return;
    let data;
    try {
      data = JSON.parse(detail);
    } catch {
      return;
    }
    const target = currentFrame();
    if (
      !target ||
      !data ||
      data.channel !== 'widget' ||
      data.id !== 'darb-hackertube'
    )
      return;
    if (data.event !== 'listening') {
      if (data.event !== 'command' || !Array.isArray(data.args)) return;
      const args = data.args;
      if (data.func === 'seekTo') {
        if (
          args.length !== 2 ||
          !Number.isFinite(args[0]) ||
          args[0] < 0 ||
          args[1] !== true
        )
          return;
      } else if (data.func === 'addEventListener') {
        if (args.length !== 1 || args[0] !== 'onStateChange') return;
      } else if (
        !['playVideo', 'pauseVideo'].includes(data.func) ||
        args.length !== 0
      )
        return;
    }
    target.frame.contentWindow?.postMessage(detail, target.origin);
  });
  window.addEventListener('message', (event) => {
    const target = currentFrame();
    if (
      !target ||
      event.source !== target.frame.contentWindow ||
      event.origin !== target.origin ||
      typeof event.data !== 'string' ||
      event.data.length > 100000
    )
      return;
    document.dispatchEvent(
      new CustomEvent(EMBED_RESPONSE, { detail: event.data }),
    );
  });
}
