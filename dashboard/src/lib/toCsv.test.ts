// dashboard/src/lib/toCsv.test.ts
import { describe, it, expect } from 'vitest';
import { toCsv } from './toCsv';
import type { Job } from './types';

const job = (over: Partial<Job>): Job => ({
  id: '1', company: 'Acme', position: 'Engineer', link: 'https://x', description: 'desc',
  source_platform: 'lever', applied_at: '2026-06-10T12:00:00Z', ...over,
});

describe('toCsv', () => {
  it('includes a header row', () => {
    expect(toCsv([])).toBe('id,company,position,link,description,source_platform,applied_at');
  });
  it('serializes a simple row', () => {
    expect(toCsv([job({ id: 'a' })]).split('\n')[1])
      .toBe('a,Acme,Engineer,https://x,desc,lever,2026-06-10T12:00:00Z');
  });
  it('escapes commas, quotes, and newlines', () => {
    const csv = toCsv([job({ id: 'a', company: 'Acme, Inc', position: 'Eng "Sr"', description: 'line1\nline2' })]);
    const row = csv.split('\n').slice(1).join('\n');
    expect(row).toContain('"Acme, Inc"');
    expect(row).toContain('"Eng ""Sr"""');
    expect(row).toContain('"line1\nline2"');
  });
  it('null description becomes an empty cell', () => {
    expect(toCsv([job({ id: 'a', description: null })]).split('\n')[1])
      .toBe('a,Acme,Engineer,https://x,,lever,2026-06-10T12:00:00Z');
  });
});
