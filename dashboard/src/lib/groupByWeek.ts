// dashboard/src/lib/groupByWeek.ts
export function groupByWeek(isoDates: string[]): { week: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const iso of isoDates) {
    const d = new Date(iso);
    const dayFromMon = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dayFromMon));
    const key = monday.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week, count]) => ({ week, count }));
}
