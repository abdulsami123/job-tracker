// dashboard/src/lib/stats.ts
import type { Job } from './types';

// Jobs whose applied_at is in the ISO week (Monday start, UTC) containing `now`.
export function countThisWeek(jobs: Job[], now: Date): number {
  const dayFromMon = (now.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayFromMon));
  const nextMonday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 7));
  return jobs.filter((j) => {
    const t = new Date(j.applied_at);
    return t >= monday && t < nextMonday;
  }).length;
}
