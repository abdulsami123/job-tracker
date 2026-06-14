// extension/src/extraction/jsonld.ts
import type { JobFields } from '../types';
import { stripHtml } from './html';

function* candidates(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) {
    for (const n of node) yield* candidates(n);
  } else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if ('@graph' in obj) yield* candidates(obj['@graph']);
    yield obj;
  }
}

function isJobPosting(obj: Record<string, unknown>): boolean {
  const t = obj['@type'];
  return t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'));
}

export function readJsonLd(doc: Document): JobFields | null {
  const blocks = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const block of Array.from(blocks)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block.textContent || '');
    } catch {
      continue;
    }
    for (const obj of candidates(parsed)) {
      if (!isJobPosting(obj)) continue;
      const org = obj['hiringOrganization'];
      const company =
        org && typeof org === 'object' ? String((org as Record<string, unknown>)['name'] ?? '') : '';
      return {
        company: company.trim(),
        position: String(obj['title'] ?? '').trim(),
        description: stripHtml(String(obj['description'] ?? '')),
      };
    }
  }
  return null;
}
