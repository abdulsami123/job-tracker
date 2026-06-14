// extension/src/extraction/extract.ts
import type { ExtractionResult } from '../types';
import { readJsonLd } from './jsonld';
import { readMeta } from './meta';
import { detectPlatform } from './platform';

const MAX_PAGE_TEXT = 12000;

export function extractFromDocument(doc: Document, selectionText: string, url: string): ExtractionResult {
  const ld = readJsonLd(doc);
  const meta = readMeta(doc);

  const company = (ld?.company || meta.company || '').trim();
  const position = (ld?.position || meta.position || '').trim();
  const description = (ld?.description || selectionText || meta.description || '').trim();

  const pageText = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, MAX_PAGE_TEXT);

  return {
    fields: { company, position, description },
    pageText,
    url,
    sourcePlatform: detectPlatform(url),
    needsLlm: !(company && position),
  };
}
