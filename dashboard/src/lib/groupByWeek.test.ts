// dashboard/src/lib/groupByWeek.test.ts
import { describe, it, expect } from 'vitest';
import { groupByWeek } from './groupByWeek';

describe('groupByWeek', () => {
  it('buckets dates into ISO weeks (Mon start) and counts', () => {
    const out = groupByWeek([
      '2026-06-08T10:00:00Z', // Mon
      '2026-06-10T09:00:00Z', // Wed (same week)
      '2026-06-15T09:00:00Z', // next Mon
    ]);
    expect(out).toEqual([
      { week: '2026-06-08', count: 2 },
      { week: '2026-06-15', count: 1 },
    ]);
  });
  it('returns empty array for no dates', () => {
    expect(groupByWeek([])).toEqual([]);
  });
});
