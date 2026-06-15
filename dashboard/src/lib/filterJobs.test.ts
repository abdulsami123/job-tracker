// dashboard/src/lib/filterJobs.test.ts
import { describe, it, expect } from 'vitest';
import { filterByDateRange, filterByPlatform, filterBySearch } from './filterJobs';
import type { Job } from './types';

const job = (over: Partial<Job>): Job => ({
  id: '1', company: 'Acme', position: 'Engineer', link: 'https://x', description: null,
  source_platform: 'lever', applied_at: '2026-06-10T12:00:00Z', ...over,
});

describe('filterByDateRange', () => {
  const jobs = [
    job({ id: 'a', applied_at: '2026-06-08T00:00:00Z' }),
    job({ id: 'b', applied_at: '2026-06-10T23:00:00Z' }),
    job({ id: 'c', applied_at: '2026-06-12T06:00:00Z' }),
  ];
  it('includes boundaries (inclusive)', () => {
    expect(filterByDateRange(jobs, '2026-06-08', '2026-06-12').map((j) => j.id)).toEqual(['a', 'b', 'c']);
  });
  it('filters to an inner range', () => {
    expect(filterByDateRange(jobs, '2026-06-09', '2026-06-11').map((j) => j.id)).toEqual(['b']);
  });
  it('from only', () => {
    expect(filterByDateRange(jobs, '2026-06-11', '').map((j) => j.id)).toEqual(['c']);
  });
  it('to only', () => {
    expect(filterByDateRange(jobs, '', '2026-06-09').map((j) => j.id)).toEqual(['a']);
  });
  it('empty bounds returns all', () => {
    expect(filterByDateRange(jobs, '', '')).toHaveLength(3);
  });
});

describe('filterByPlatform', () => {
  const jobs = [job({ id: 'a', source_platform: 'lever' }), job({ id: 'b', source_platform: 'ashby' }), job({ id: 'c', source_platform: 'workday' })];
  it('empty array returns all', () => { expect(filterByPlatform(jobs, [])).toHaveLength(3); });
  it('single platform', () => { expect(filterByPlatform(jobs, ['ashby']).map((j) => j.id)).toEqual(['b']); });
  it('multiple platforms', () => { expect(filterByPlatform(jobs, ['lever', 'workday']).map((j) => j.id)).toEqual(['a', 'c']); });
  it('no match returns empty', () => { expect(filterByPlatform(jobs, ['greenhouse'])).toEqual([]); });
});

describe('filterBySearch', () => {
  const jobs = [job({ id: 'a', company: 'Acme', position: 'Backend Engineer' }), job({ id: 'b', company: 'Globex', position: 'Designer', source_platform: 'ashby' })];
  it('empty query returns all', () => { expect(filterBySearch(jobs, '')).toHaveLength(2); });
  it('matches company case-insensitively', () => { expect(filterBySearch(jobs, 'globex').map((j) => j.id)).toEqual(['b']); });
  it('matches position', () => { expect(filterBySearch(jobs, 'backend').map((j) => j.id)).toEqual(['a']); });
  it('matches platform', () => { expect(filterBySearch(jobs, 'ashby').map((j) => j.id)).toEqual(['b']); });
  it('no match returns empty', () => { expect(filterBySearch(jobs, 'zzz')).toEqual([]); });
  it('matches on link', () => {
    const jobs = [job({ id: 'a', link: 'https://jobs.lever.co/acme/123' })];
    expect(filterBySearch(jobs, 'lever.co').map((j) => j.id)).toEqual(['a']);
  });
});
