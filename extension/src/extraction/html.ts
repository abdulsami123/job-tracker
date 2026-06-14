// extension/src/extraction/html.ts
export function stripHtml(html: string | undefined | null): string {
  if (!html) return '';
  const noTags = html.replace(/<[^>]*>/g, ' ');
  const decoded = noTags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  return decoded.replace(/\s+/g, ' ').trim();
}

// Best-effort split of a document title into {position, company}.
const SEPARATORS = [' - ', ' – ', ' — ', ' | ', ' at '];

export function splitTitle(title: string): { position: string; company: string } {
  const t = (title || '').trim();
  for (const sep of SEPARATORS) {
    const i = t.indexOf(sep);
    if (i !== -1) {
      return {
        position: t.slice(0, i).trim(),
        company: t.slice(i + sep.length).trim(),
      };
    }
  }
  return { position: t, company: '' };
}
