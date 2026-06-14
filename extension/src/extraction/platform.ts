// extension/src/extraction/platform.ts
const HOST_MAP: [string, string][] = [
  ['myworkdayjobs.com', 'workday'],
  ['greenhouse.io', 'greenhouse'],
  ['lever.co', 'lever'],
  ['ashbyhq.com', 'ashby'],
];

export function detectPlatform(url: string): string {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return 'other';
  }
  for (const [needle, label] of HOST_MAP) {
    if (host.includes(needle)) return label;
  }
  return 'other';
}
