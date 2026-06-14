// extension/src/extraction/jsonld.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readJsonLd } from './jsonld';

function setLd(json: unknown) {
  document.head.innerHTML = '';
  const s = document.createElement('script');
  s.type = 'application/ld+json';
  s.textContent = JSON.stringify(json);
  document.head.appendChild(s);
}

describe('readJsonLd', () => {
  beforeEach(() => { document.head.innerHTML = ''; });

  it('reads a top-level JobPosting', () => {
    setLd({
      '@type': 'JobPosting',
      title: 'Backend Engineer',
      hiringOrganization: { name: 'Acme Corp' },
      description: '<p>Build <b>things</b></p>',
    });
    expect(readJsonLd(document)).toEqual({
      company: 'Acme Corp', position: 'Backend Engineer', description: 'Build things',
    });
  });

  it('finds JobPosting inside @graph', () => {
    setLd({ '@graph': [{ '@type': 'WebSite' }, {
      '@type': 'JobPosting', title: 'PM', hiringOrganization: { name: 'Globex' }, description: 'Lead',
    }]});
    expect(readJsonLd(document)?.position).toBe('PM');
  });

  it('returns null when no JobPosting present', () => {
    setLd({ '@type': 'Organization', name: 'Acme' });
    expect(readJsonLd(document)).toBeNull();
  });

  it('ignores malformed JSON without throwing', () => {
    document.head.innerHTML = '';
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = '{ not valid json';
    document.head.appendChild(s);
    expect(readJsonLd(document)).toBeNull();
  });
});
