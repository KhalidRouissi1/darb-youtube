import { describe, expect, it } from 'vitest';
import {
  hasReachedSessionEnd,
  resolveResumeSeconds,
} from '@/lib/youtube/playback';
import type { ActivePlayback } from '@/types/youtube';

const playback: ActivePlayback = {
  activationId: 'activation-1',
  tabId: 1,
  status: 'active',
  courseId: 'course-1',
  sessionId: 'session-1',
  videoId: 'video-1',
  startSeconds: 900,
  endSeconds: 1800,
  lastKnownSeconds: 1200,
  reportSequence: 0,
  startedAt: '2026-01-01T00:00:00.000Z',
};

describe('playback boundaries', () => {
  it('recovers the last saved position after the browser closes', () => {
    expect(resolveResumeSeconds(playback, 0)).toBe(1200);
  });

  it('keeps a valid YouTube timestamp inside the current session', () => {
    expect(resolveResumeSeconds(playback, 901)).toBe(901);
  });

  it('detects a manual seek beyond the session end', () => {
    expect(hasReachedSessionEnd(1801, playback.endSeconds)).toBe(true);
  });

  it('detects the configured 30-minute boundary', () => {
    expect(hasReachedSessionEnd(1799.75, playback.endSeconds)).toBe(true);
    expect(hasReachedSessionEnd(1800, playback.endSeconds)).toBe(true);
  });

  it('does not complete early', () => {
    expect(hasReachedSessionEnd(1799, playback.endSeconds)).toBe(false);
  });
});
