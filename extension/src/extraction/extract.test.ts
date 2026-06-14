// extension/src/extraction/extract.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { extractFromDocument } from './extract';

describe('extractFromDocument', () => {
  beforeEach(() => { document.head.innerHTML = ''; document.body.innerHTML = ''; document.title = ''; });

  it('uses JSON-LD when present and marks needsLlm=false', () => {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify({
      '@type': 'JobPosting', title: 'SRE', hiringOrganization: { name: 'Acme' }, description: 'Run prod',
    });
    document.head.appendChild(s);
    const r = extractFromDocument(document, '', 'https://jobs.lever.co/acme/1');
    expect(r.fields).toEqual({ company: 'Acme', position: 'SRE', description: 'Run prod' });
    expect(r.needsLlm).toBe(false);
    expect(r.sourcePlatform).toBe('lever');
  });

  it('falls back to meta and fills description from selection', () => {
    document.head.innerHTML = '<meta property="og:title" content="PM - Globex">';
    const r = extractFromDocument(document, 'Selected JD text', 'https://careers.globex.com/x');
    expect(r.fields.company).toBe('Globex');
    expect(r.fields.position).toBe('PM');
    expect(r.fields.description).toBe('Selected JD text');
    expect(r.needsLlm).toBe(false);
  });

  it('sets needsLlm=true when company or position missing', () => {
    document.title = 'Careers';
    const r = extractFromDocument(document, '', 'https://acme.myworkdayjobs.com/job/9');
    expect(r.needsLlm).toBe(true);
    expect(r.sourcePlatform).toBe('workday');
  });

  it('caps pageText length', () => {
    document.body.innerHTML = '<div>' + 'x'.repeat(20000) + '</div>';
    const r = extractFromDocument(document, '', 'https://x.com');
    expect(r.pageText.length).toBeLessThanOrEqual(12000);
  });
});
