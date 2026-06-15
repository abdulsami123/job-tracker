// dashboard/src/lib/stats.test.ts
import { describe, it, expect } from 'vitest';
import { countThisWeek } from './stats';
import type { Job } from './types';

const job = (id: string, applied_at: string): Job => ({
  id, company: 'A', position: 'B', link: 'l', description: null, source_platform: 'lever', applied_at,
});

describe('countThisWeek', () => {
  // now = Wed 2026-06-10 -> ISO week Mon 2026-06-08 .. Sun 2026-06-14
  const now = new Date('2026-06-10T12:00:00Z');
  it('counts only jobs in the current ISO week', () => {
    const jobs = [
      job('mon', '2026-06-08T00:00:00Z'),
      job('sun', '2026-06-14T23:00:00Z'),
      job('lastweek', '2026-06-07T23:00:00Z'),
      job('nextweek', '2026-06-15T00:00:00Z'),
    ];
    expect(countThisWeek(jobs, now)).toBe(2);
  });
  it('returns 0 when none fall in the week', () => {
    expect(countThisWeek([job('x', '2026-01-01T00:00:00Z')], now)).toBe(0);
  });
  it('counts a job dated today using the local week (not UTC)', () => {
    // Local Sunday evening 2026-06-14 — in negative UTC offsets this is already
    // Monday in UTC, which previously pushed today's jobs out of "this week".
    const nowSundayEvening = new Date(2026, 5, 14, 19, 0, 0);
    const jobs = [job('today', '2026-06-14T00:00:00Z')];
    expect(countThisWeek(jobs, nowSundayEvening)).toBe(1);
  });
});
