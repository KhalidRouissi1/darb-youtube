import { browser } from 'wxt/browser';
import type { Course } from '@/types/course';
import { getActivePlayback } from '@/lib/storage/repository';
import { parseVideoUrl, sameVideo } from './platforms';
import { ensurePlatformBridge } from './registration';
/** Returns no time when the course is not open; never substitutes a saved checkpoint. */
export async function captureNoteTime(
  course: Course,
): Promise<number | undefined> {
  const active = await getActivePlayback();
  const tabs = await browser.tabs.query({});
  const matching = tabs.filter((tab) => {
    const identity = tab.url && parseVideoUrl(tab.url);
    return identity && sameVideo(course, identity);
  });
  matching.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      Number(b.id === active?.tabId) - Number(a.id === active?.tabId),
  );
  for (const tab of matching) {
    if (tab.id === undefined || !tab.url) continue;
    try {
      await ensurePlatformBridge(tab.id, tab.url);
      const result = await browser.tabs.sendMessage(tab.id, {
        type: 'GET_VIDEO_POSITION',
        videoId: course.videoId,
        platform: course.platform ?? 'youtube',
      });
      const position = result?.position;
      if (
        result?.ok &&
        position &&
        sameVideo(course, position) &&
        typeof position.seconds === 'number' &&
        Number.isFinite(position.seconds) &&
        position.seconds >= 0 &&
        position.seconds < course.durationSeconds
      )
        return Math.floor(position.seconds);
    } catch {
      /* Try another open copy of this video. */
    }
  }
  return undefined;
}
