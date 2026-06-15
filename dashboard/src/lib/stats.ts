// dashboard/src/lib/stats.ts
import type { Job } from './types';

// Count jobs whose applied date falls in the current week (Monday start),
// using the viewer's LOCAL calendar for "this week" so it matches the dates
// shown in the table, and comparing against each job's stored date (YYYY-MM-DD).
export function countThisWeek(jobs: Job[], now: Date): number {
  const dayFromMon = (now.getDay() + 6) % 7; // local day: Mon=0 … Sun=6
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayFromMon);
  const nextMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const lo = iso(monday);
  const hi = iso(nextMonday);
  return jobs.filter((j) => {
    const day = j.applied_at.slice(0, 10);
    return day >= lo && day < hi;
  }).length;
}
