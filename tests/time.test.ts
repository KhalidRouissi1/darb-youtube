import { describe, expect, it } from 'vitest';
import { formatDuration, formatTimestamp } from '@/lib/utils/time';

describe('time formatting', () => {
  it('formats readable durations', () => {
    expect(formatDuration(3665)).toBe('1h 1m 5s');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(0)).toBe('0s');
  });

  it('formats fixed-width timestamps', () => {
    expect(formatTimestamp(3665)).toBe('01:01:05');
    expect(formatTimestamp(65)).toBe('00:01:05');
  });
});
