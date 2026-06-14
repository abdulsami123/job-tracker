// extension/src/extraction/html.test.ts
import { describe, it, expect } from 'vitest';
import { stripHtml, splitTitle } from './html';

describe('stripHtml', () => {
  it('removes tags and collapses whitespace', () => {
    expect(stripHtml('<p>Hello   <b>world</b></p>\n<p>Bye</p>')).toBe('Hello world Bye');
  });
  it('decodes common entities', () => {
    expect(stripHtml('R&amp;D &lt;team&gt;')).toBe('R&D <team>');
  });
  it('handles empty/undefined', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(undefined)).toBe('');
  });
});

describe('splitTitle', () => {
  it('splits "Position - Company"', () => {
    expect(splitTitle('Senior Engineer - Acme')).toEqual({ position: 'Senior Engineer', company: 'Acme' });
  });
  it('splits "Position | Company"', () => {
    expect(splitTitle('Designer | Globex Careers')).toEqual({ position: 'Designer', company: 'Globex Careers' });
  });
  it('splits "Position at Company"', () => {
    expect(splitTitle('Data Analyst at Initech')).toEqual({ position: 'Data Analyst', company: 'Initech' });
  });
  it('returns only position when no separator', () => {
    expect(splitTitle('Product Manager')).toEqual({ position: 'Product Manager', company: '' });
  });
});
