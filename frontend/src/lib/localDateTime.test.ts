import { describe, expect, it } from 'vitest';
import { parseServerDate } from './localDateTime';

describe('parseServerDate', () => {
  it('treats naive timestamps as UTC', () => {
    const date = parseServerDate('2026-10-15T12:00:00');
    expect(date?.toISOString()).toBe('2026-10-15T12:00:00.000Z');
  });

  it('keeps explicit offsets', () => {
    const date = parseServerDate('2026-10-15T15:00:00+03:00');
    expect(date?.toISOString()).toBe('2026-10-15T12:00:00.000Z');
  });
});
