// extension/src/content.ts
import { extractFromDocument } from './extraction/extract';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'EXTRACT') {
    const selection = window.getSelection()?.toString() ?? '';
    // Prefer rendered text for the LLM fallback.
    const result = extractFromDocument(document, selection, location.href);
    result.pageText = (document.body?.innerText ?? result.pageText).replace(/\s+/g, ' ').trim().slice(0, 12000);
    sendResponse(result);
  }
  return true; // keep the message channel open for the sync response
});
