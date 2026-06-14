// extension/src/extraction/meta.ts
import type { JobFields } from '../types';
import { splitTitle } from './html';

function meta(doc: Document, property: string): string {
  const el = doc.querySelector(`meta[property="${property}"]`)
    ?? doc.querySelector(`meta[name="${property}"]`);
  return (el?.getAttribute('content') ?? '').trim();
}

export function readMeta(doc: Document): JobFields {
  const ogTitle = meta(doc, 'og:title');
  const ogSite = meta(doc, 'og:site_name');
  const ogDesc = meta(doc, 'og:description');

  const rawTitle = ogTitle || doc.title || '';
  const split = splitTitle(rawTitle);

  return {
    position: split.position,
    company: ogSite || split.company,
    description: ogDesc,
  };
}
