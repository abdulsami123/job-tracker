// extension/src/extraction/platform.test.ts
import { describe, it, expect } from 'vitest';
import { detectPlatform } from './platform';

describe('detectPlatform', () => {
  it('maps known ATS hosts', () => {
    expect(detectPlatform('https://acme.wd1.myworkdayjobs.com/job/123')).toBe('workday');
    expect(detectPlatform('https://boards.greenhouse.io/acme/jobs/1')).toBe('greenhouse');
    expect(detectPlatform('https://jobs.lever.co/acme/abc')).toBe('lever');
    expect(detectPlatform('https://jobs.ashbyhq.com/acme/xyz')).toBe('ashby');
  });
  it('falls back to other', () => {
    expect(detectPlatform('https://careers.acme.com/role')).toBe('other');
  });
  it('never throws on a bad url', () => {
    expect(detectPlatform('not a url')).toBe('other');
  });
});
