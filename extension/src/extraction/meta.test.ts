// extension/src/extraction/meta.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readMeta } from './meta';

describe('readMeta', () => {
  beforeEach(() => { document.head.innerHTML = ''; document.title = ''; });

  it('prefers og:title + og:site_name', () => {
    document.head.innerHTML =
      '<meta property="og:title" content="Senior Engineer">' +
      '<meta property="og:site_name" content="Acme">' +
      '<meta property="og:description" content="Join us">';
    expect(readMeta(document)).toEqual({
      company: 'Acme', position: 'Senior Engineer', description: 'Join us',
    });
  });

  it('falls back to document.title split when og missing', () => {
    document.title = 'Data Analyst at Initech';
    expect(readMeta(document)).toEqual({
      company: 'Initech', position: 'Data Analyst', description: '',
    });
  });

  it('uses og:title for position but title-split for company when site_name absent', () => {
    document.head.innerHTML = '<meta property="og:title" content="Designer - Globex">';
    const r = readMeta(document);
    expect(r.position).toBe('Designer');
    expect(r.company).toBe('Globex');
  });
});
