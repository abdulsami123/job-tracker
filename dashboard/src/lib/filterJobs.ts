// dashboard/src/lib/filterJobs.ts
import type { Job } from './types';

// Inclusive range on the calendar date (YYYY-MM-DD) of applied_at. Empty bound = unbounded.
export function filterByDateRange(jobs: Job[], from: string, to: string): Job[] {
  return jobs.filter((j) => {
    const day = j.applied_at.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}

// Empty list = no platform filter (all pass).
export function filterByPlatform(jobs: Job[], platforms: string[]): Job[] {
  if (platforms.length === 0) return jobs;
  const set = new Set(platforms);
  return jobs.filter((j) => set.has(j.source_platform));
}

// Case-insensitive substring across company/position/link/platform. Empty query = all.
export function filterBySearch(jobs: Job[], query: string): Job[] {
  const q = query.trim().toLowerCase();
  if (!q) return jobs;
  return jobs.filter((j) =>
    `${j.company} ${j.position} ${j.link} ${j.source_platform}`.toLowerCase().includes(q),
  );
}
