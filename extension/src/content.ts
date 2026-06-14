// extension/src/content.ts
import { extractFromDocument } from './extraction/extract';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'EXTRACT') {
    const selection = window.getSelection()?.toString() ?? '';
    const result = extractFromDocument(document, selection, location.href);
    result.pageText = (document.body?.innerText ?? result.pageText)
      .replace(/\s+/g, ' ').trim().slice(0, 12000);
    sendResponse(result);
    return true; // keep the channel open for this response
  }
  return false; // not ours — let other listeners handle it
});
