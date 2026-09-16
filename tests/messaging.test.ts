import { describe, expect, it } from 'vitest';
import {
  isContentMessage,
  isRuntimeMessage,
} from '@/lib/messaging/messages';

describe('runtime message validation', () => {
  it('accepts known extension messages', () => {
    expect(isRuntimeMessage({ type: 'PING' })).toBe(true);
    expect(isRuntimeMessage({ type: 'OPEN_DASHBOARD' })).toBe(true);
    expect(
      isRuntimeMessage({
        type: 'OPEN_SESSION',
        courseId: 'course-1',
      }),
    ).toBe(true);
    expect(
      isRuntimeMessage({
        type: 'SESSION_REACHED_END',
        courseId: 'course-1',
        sessionId: 'session-1',
        activationId: 'activation-1',
      }),
    ).toBe(true);
  });

  it('rejects malformed and unknown messages', () => {
    expect(isRuntimeMessage(null)).toBe(false);
    expect(isRuntimeMessage({})).toBe(false);
    expect(isRuntimeMessage({ type: 'DELETE_EVERYTHING' })).toBe(false);
    expect(isRuntimeMessage({ type: 'OPEN_SESSION' })).toBe(false);
  });
});

describe('content message validation', () => {
  it('accepts metadata and session activation messages', () => {
    expect(isContentMessage({ type: 'GET_VIDEO_METADATA' })).toBe(true);
    expect(
      isContentMessage({ type: 'ACTIVATE_SESSION', activationId: 'activation-1' }),
    ).toBe(true);
  });

  it('rejects unknown content messages', () => {
    expect(isContentMessage({ type: 'OPEN_SESSION' })).toBe(false);
  });
});
