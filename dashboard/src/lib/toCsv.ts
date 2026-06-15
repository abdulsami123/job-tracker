// dashboard/src/lib/toCsv.ts
import type { Job } from './types';

const HEADERS = ['id', 'company', 'position', 'link', 'description', 'source_platform', 'applied_at'] as const;

function escape(value: string): string {
  return /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

export function toCsv(jobs: Job[]): string {
  const rows = jobs.map((j) => HEADERS.map((h) => escape(String(j[h] ?? ''))).join(','));
  return [HEADERS.join(','), ...rows].join('\n');
}
