# Dashboard UI Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the job-tracker dashboard into a Drizzle-Studio-style data view: global search, date-range filter, platform quick-filter, sortable columns, a summary stats bar, CSV export, a slide-over detail drawer, and a light/dark theme toggle.

**Architecture:** Server `page.tsx` keeps auth + fetch (RLS-scoped); a client `<Dashboard>` holds filter state and derives the visible rows with **pure, unit-tested filter functions** (date → platform → search). `@tanstack/react-table` handles **sorting** on that pre-filtered array. One `filtered` array drives the stats bar, table, and CSV export so they always agree.

**Tech Stack:** Next.js 16 App Router, `@supabase/ssr`, `@tanstack/react-table` (new), CSS Modules + CSS-variable theming, Vitest (Node) for the pure helpers.

**Reference spec:** `dashboard-ui-spec.md`.

**Conventions:**
- Work from `C:\Users\samir\job-tracker\dashboard` unless noted. Branch: `feat/mvp-build`.
- Repo git identity is already configured — use plain `git commit`, NO `-c` overrides.
- Steps marked **🧑 YOU RUN** are run by Samir (npm install / dev server).
- Alias `@/*` → `dashboard/src/*`.

**Files created/modified:**
```
dashboard/src/
  lib/types.ts                 (new)  Job type
  lib/filterJobs.ts            (new)  filterByDateRange / filterByPlatform / filterBySearch (+test)
  lib/toCsv.ts                 (new)  toCsv (+test)
  lib/stats.ts                 (new)  countThisWeek (+test)
  lib/groupByWeek.ts           (reuse, unchanged)
  components/ThemeToggle.tsx    (new) + .module.css
  components/StatsBar.tsx       (new) + .module.css
  components/JobDrawer.tsx      (new) + .module.css
  components/JobsTable.tsx      (new) + .module.css
  components/Toolbar.tsx        (new) + .module.css
  components/Dashboard.tsx      (new) + .module.css
  app/globals.css              (overwrite)  theme CSS variables + base
  app/page.tsx                 (modify)  fetch description, render <Dashboard>
  app/actions.ts               (reuse, unchanged)  deleteJob
```

---

## Phase A — Pure helpers (TDD, no new deps)

### Task 1: `Job` type

**Files:** Create `src/lib/types.ts`

- [ ] **Step 1: Write the type** (no test — type only)

```ts
// dashboard/src/lib/types.ts
export interface Job {
  id: string;
  company: string;
  position: string;
  link: string;
  description: string | null;
  source_platform: string;
  applied_at: string; // ISO timestamp
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts && git commit -m "feat(dash): Job type for the UI"
```

### Task 2: Filter helpers (TDD)

**Files:** Create `src/lib/filterJobs.ts`, `src/lib/filterJobs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// dashboard/src/lib/filterJobs.test.ts
import { describe, it, expect } from 'vitest';
import { filterByDateRange, filterByPlatform, filterBySearch } from './filterJobs';
import type { Job } from './types';

const job = (over: Partial<Job>): Job => ({
  id: '1', company: 'Acme', position: 'Engineer', link: 'https://x', description: null,
  source_platform: 'lever', applied_at: '2026-06-10T12:00:00Z', ...over,
});

describe('filterByDateRange', () => {
  const jobs = [
    job({ id: 'a', applied_at: '2026-06-08T00:00:00Z' }),
    job({ id: 'b', applied_at: '2026-06-10T23:00:00Z' }),
    job({ id: 'c', applied_at: '2026-06-12T06:00:00Z' }),
  ];
  it('includes boundaries (inclusive)', () => {
    expect(filterByDateRange(jobs, '2026-06-08', '2026-06-12').map((j) => j.id)).toEqual(['a', 'b', 'c']);
  });
  it('filters to an inner range', () => {
    expect(filterByDateRange(jobs, '2026-06-09', '2026-06-11').map((j) => j.id)).toEqual(['b']);
  });
  it('from only', () => {
    expect(filterByDateRange(jobs, '2026-06-11', '').map((j) => j.id)).toEqual(['c']);
  });
  it('to only', () => {
    expect(filterByDateRange(jobs, '', '2026-06-09').map((j) => j.id)).toEqual(['a']);
  });
  it('empty bounds returns all', () => {
    expect(filterByDateRange(jobs, '', '')).toHaveLength(3);
  });
});

describe('filterByPlatform', () => {
  const jobs = [job({ id: 'a', source_platform: 'lever' }), job({ id: 'b', source_platform: 'ashby' }), job({ id: 'c', source_platform: 'workday' })];
  it('empty array returns all', () => { expect(filterByPlatform(jobs, [])).toHaveLength(3); });
  it('single platform', () => { expect(filterByPlatform(jobs, ['ashby']).map((j) => j.id)).toEqual(['b']); });
  it('multiple platforms', () => { expect(filterByPlatform(jobs, ['lever', 'workday']).map((j) => j.id)).toEqual(['a', 'c']); });
  it('no match returns empty', () => { expect(filterByPlatform(jobs, ['greenhouse'])).toEqual([]); });
});

describe('filterBySearch', () => {
  const jobs = [job({ id: 'a', company: 'Acme', position: 'Backend Engineer' }), job({ id: 'b', company: 'Globex', position: 'Designer', source_platform: 'ashby' })];
  it('empty query returns all', () => { expect(filterBySearch(jobs, '')).toHaveLength(2); });
  it('matches company case-insensitively', () => { expect(filterBySearch(jobs, 'globex').map((j) => j.id)).toEqual(['b']); });
  it('matches position', () => { expect(filterBySearch(jobs, 'backend').map((j) => j.id)).toEqual(['a']); });
  it('matches platform', () => { expect(filterBySearch(jobs, 'ashby').map((j) => j.id)).toEqual(['b']); });
  it('no match returns empty', () => { expect(filterBySearch(jobs, 'zzz')).toEqual([]); });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/filterJobs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// dashboard/src/lib/filterJobs.ts
import type { Job } from './types';

// Inclusive range on the calendar date (YYYY-MM-DD) of applied_at. Empty bound = unbounded.
export function filterByDateRange(jobs: Job[], from: string, to: string): Job[] {
  return jobs.filter((j) => {
    const day = j.applied_at.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}

// Empty list = no platform filter (all pass).
export function filterByPlatform(jobs: Job[], platforms: string[]): Job[] {
  if (platforms.length === 0) return jobs;
  const set = new Set(platforms);
  return jobs.filter((j) => set.has(j.source_platform));
}

// Case-insensitive substring across company/position/link/platform. Empty query = all.
export function filterBySearch(jobs: Job[], query: string): Job[] {
  const q = query.trim().toLowerCase();
  if (!q) return jobs;
  return jobs.filter((j) =>
    `${j.company} ${j.position} ${j.link} ${j.source_platform}`.toLowerCase().includes(q),
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/filterJobs.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/filterJobs.ts src/lib/filterJobs.test.ts
git commit -m "feat(dash): pure date/platform/search filters"
```

### Task 3: CSV export helper (TDD)

**Files:** Create `src/lib/toCsv.ts`, `src/lib/toCsv.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// dashboard/src/lib/toCsv.test.ts
import { describe, it, expect } from 'vitest';
import { toCsv } from './toCsv';
import type { Job } from './types';

const job = (over: Partial<Job>): Job => ({
  id: '1', company: 'Acme', position: 'Engineer', link: 'https://x', description: 'desc',
  source_platform: 'lever', applied_at: '2026-06-10T12:00:00Z', ...over,
});

describe('toCsv', () => {
  it('includes a header row', () => {
    expect(toCsv([])).toBe('id,company,position,link,description,source_platform,applied_at');
  });
  it('serializes a simple row', () => {
    expect(toCsv([job({ id: 'a' })]).split('\n')[1])
      .toBe('a,Acme,Engineer,https://x,desc,lever,2026-06-10T12:00:00Z');
  });
  it('escapes commas, quotes, and newlines', () => {
    const csv = toCsv([job({ id: 'a', company: 'Acme, Inc', position: 'Eng "Sr"', description: 'line1\nline2' })]);
    const row = csv.split('\n').slice(1).join('\n');
    expect(row).toContain('"Acme, Inc"');
    expect(row).toContain('"Eng ""Sr"""');
    expect(row).toContain('"line1\nline2"');
  });
  it('null description becomes an empty cell', () => {
    expect(toCsv([job({ id: 'a', description: null })]).split('\n')[1])
      .toBe('a,Acme,Engineer,https://x,,lever,2026-06-10T12:00:00Z');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/toCsv.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// dashboard/src/lib/toCsv.ts
import type { Job } from './types';

const HEADERS = ['id', 'company', 'position', 'link', 'description', 'source_platform', 'applied_at'] as const;

function escape(value: string): string {
  return /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

export function toCsv(jobs: Job[]): string {
  const rows = jobs.map((j) => HEADERS.map((h) => escape(String(j[h] ?? ''))).join(','));
  return [HEADERS.join(','), ...rows].join('\n');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/toCsv.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/toCsv.ts src/lib/toCsv.test.ts
git commit -m "feat(dash): CSV export helper with escaping"
```

### Task 4: This-week counter (TDD)

**Files:** Create `src/lib/stats.ts`, `src/lib/stats.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// dashboard/src/lib/stats.test.ts
import { describe, it, expect } from 'vitest';
import { countThisWeek } from './stats';
import type { Job } from './types';

const job = (id: string, applied_at: string): Job => ({
  id, company: 'A', position: 'B', link: 'l', description: null, source_platform: 'lever', applied_at,
});

describe('countThisWeek', () => {
  // now = Wed 2026-06-10 -> ISO week Mon 2026-06-08 .. Sun 2026-06-14
  const now = new Date('2026-06-10T12:00:00Z');
  it('counts only jobs in the current ISO week', () => {
    const jobs = [
      job('mon', '2026-06-08T00:00:00Z'),
      job('sun', '2026-06-14T23:00:00Z'),
      job('lastweek', '2026-06-07T23:00:00Z'),
      job('nextweek', '2026-06-15T00:00:00Z'),
    ];
    expect(countThisWeek(jobs, now)).toBe(2);
  });
  it('returns 0 when none fall in the week', () => {
    expect(countThisWeek([job('x', '2026-01-01T00:00:00Z')], now)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// dashboard/src/lib/stats.ts
import type { Job } from './types';

// Jobs whose applied_at is in the ISO week (Monday start, UTC) containing `now`.
export function countThisWeek(jobs: Job[], now: Date): number {
  const dayFromMon = (now.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayFromMon));
  const nextMonday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 7));
  return jobs.filter((j) => {
    const t = new Date(j.applied_at);
    return t >= monday && t < nextMonday;
  }).length;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: PASS — groupByWeek (2) + filterJobs (14) + toCsv (4) + stats (2) = 22.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(dash): countThisWeek stat"
```

---

## Phase B — Install the table dependency

### Task 5: 🧑 YOU RUN — add `@tanstack/react-table`

- [ ] **Step 1: Install**

```powershell
cd C:\Users\samir\job-tracker\dashboard
npm i @tanstack/react-table
```
Expected: added to `dependencies`, no errors.

- [ ] **Step 2: Commit the lockfile/manifest**

```bash
git add package.json package-lock.json
git commit -m "chore(dash): add @tanstack/react-table"
```

---

## Phase C — Theming + components

### Task 6: Theme variables + toggle

**Files:** Overwrite `src/app/globals.css`; create `src/components/ThemeToggle.tsx`, `src/components/ThemeToggle.module.css`

- [ ] **Step 1: Overwrite `globals.css`**

```css
/* dashboard/src/app/globals.css */
:root,
[data-theme='light'] {
  --bg: #ffffff; --surface: #ffffff; --text: #18181b; --muted: #71717a;
  --border: #e4e4e7; --accent: #2563eb; --row-hover: #f4f4f5; --badge-bg: #f4f4f5;
}
[data-theme='dark'] {
  --bg: #0b0b0c; --surface: #141416; --text: #ededed; --muted: #a1a1aa;
  --border: #27272a; --accent: #3b82f6; --row-hover: #1c1c1f; --badge-bg: #27272a;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, sans-serif; }
a { color: inherit; }
```

- [ ] **Step 2: ThemeToggle component**

```tsx
// dashboard/src/components/ThemeToggle.tsx
'use client';
import { useEffect, useState } from 'react';
import styles from './ThemeToggle.module.css';

type Theme = 'light' | 'dark';
const KEY = 'jobtracker-theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const stored = localStorage.getItem(KEY) as Theme | null;
    const initial: Theme = stored ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  function toggle() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(KEY, next);
  }

  return (
    <button type="button" className={styles.toggle} onClick={toggle} title="Toggle theme" aria-label="Toggle theme">
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
```

```css
/* dashboard/src/components/ThemeToggle.module.css */
.toggle { padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); cursor: pointer; font-size: 14px; }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (ignore any `.next/types` generated noise).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/components/ThemeToggle.tsx src/components/ThemeToggle.module.css
git commit -m "feat(dash): theme variables + light/dark toggle"
```

### Task 7: StatsBar

**Files:** Create `src/components/StatsBar.tsx`, `src/components/StatsBar.module.css`

- [ ] **Step 1: Implement**

```tsx
// dashboard/src/components/StatsBar.tsx
import { groupByWeek } from '@/lib/groupByWeek';
import { countThisWeek } from '@/lib/stats';
import type { Job } from '@/lib/types';
import styles from './StatsBar.module.css';

export default function StatsBar({ jobs }: { jobs: Job[] }) {
  const weeks = groupByWeek(jobs.map((j) => j.applied_at));
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const thisWeek = countThisWeek(jobs, new Date());

  return (
    <div className={styles.bar}>
      <div className={styles.stat}><span className={styles.num}>{jobs.length}</span><span className={styles.label}>total</span></div>
      <div className={styles.stat}><span className={styles.num}>{thisWeek}</span><span className={styles.label}>this week</span></div>
      <div className={styles.chart}>
        {weeks.map((w) => (
          <div key={w.week} className={styles.barCol} title={`${w.week}: ${w.count}`}>
            <div className={styles.barFill} style={{ height: `${(w.count / max) * 100}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

```css
/* dashboard/src/components/StatsBar.module.css */
.bar { display: flex; align-items: flex-end; gap: 24px; padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); margin-bottom: 12px; }
.stat { display: flex; flex-direction: column; }
.num { font-size: 22px; font-weight: 700; }
.label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.chart { display: flex; align-items: flex-end; gap: 3px; height: 40px; margin-left: auto; }
.barCol { width: 8px; height: 100%; display: flex; align-items: flex-end; }
.barFill { width: 100%; background: var(--accent); border-radius: 2px 2px 0 0; min-height: 2px; }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/StatsBar.tsx src/components/StatsBar.module.css
git commit -m "feat(dash): summary stats bar"
```

### Task 8: JobDrawer (slide-over)

**Files:** Create `src/components/JobDrawer.tsx`, `src/components/JobDrawer.module.css`

- [ ] **Step 1: Implement**

```tsx
// dashboard/src/components/JobDrawer.tsx
'use client';
import { useEffect } from 'react';
import type { Job } from '@/lib/types';
import styles from './JobDrawer.module.css';

export default function JobDrawer({ job, onClose }: { job: Job | null; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    if (job) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [job, onClose]);

  if (!job) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <aside className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
        <h2 className={styles.company}>{job.company}</h2>
        <a className={styles.position} href={job.link} target="_blank" rel="noreferrer">{job.position}</a>
        <div className={styles.meta}>
          <span className={styles.badge}>{job.source_platform}</span>
          <span className={styles.date}>Applied {job.applied_at.slice(0, 10)}</span>
        </div>
        <div className={styles.description}>
          {job.description ? job.description : <em className={styles.muted}>No description captured.</em>}
        </div>
      </aside>
    </div>
  );
}
```

```css
/* dashboard/src/components/JobDrawer.module.css */
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; justify-content: flex-end; z-index: 50; }
.drawer { width: min(480px, 90vw); height: 100%; background: var(--surface); color: var(--text); border-left: 1px solid var(--border); padding: 20px; overflow-y: auto; box-shadow: -8px 0 24px rgba(0,0,0,.15); }
.close { float: right; border: 0; background: transparent; font-size: 22px; line-height: 1; cursor: pointer; color: var(--muted); }
.company { font-size: 18px; margin: 0 0 4px; }
.position { color: var(--accent); text-decoration: none; font-size: 14px; }
.meta { display: flex; gap: 10px; align-items: center; margin: 12px 0; }
.badge { font: 11px monospace; padding: 2px 6px; border-radius: 4px; background: var(--badge-bg); color: var(--muted); }
.date { font-size: 12px; color: var(--muted); }
.description { margin-top: 12px; white-space: pre-wrap; line-height: 1.5; font-size: 13px; }
.muted { color: var(--muted); }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/JobDrawer.tsx src/components/JobDrawer.module.css
git commit -m "feat(dash): slide-over job detail drawer"
```

### Task 9: JobsTable (TanStack, sorting + delete + row click)

**Files:** Create `src/components/JobsTable.tsx`, `src/components/JobsTable.module.css`

- [ ] **Step 1: Implement**

```tsx
// dashboard/src/components/JobsTable.tsx
'use client';
import { useMemo, useState } from 'react';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, flexRender,
  createColumnHelper, type SortingState, type ColumnDef,
} from '@tanstack/react-table';
import type { Job } from '@/lib/types';
import { deleteJob } from '@/app/actions';
import styles from './JobsTable.module.css';

const ch = createColumnHelper<Job>();

export default function JobsTable({ rows, onRowClick }: { rows: Job[]; onRowClick: (job: Job) => void }) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<Job, unknown>[]>(() => [
    ch.accessor('company', { header: 'Company', cell: (i) => i.getValue() }) as ColumnDef<Job, unknown>,
    ch.accessor('position', {
      header: 'Position',
      cell: (i) => (
        <a href={i.row.original.link} target="_blank" rel="noreferrer" className={styles.link} onClick={(e) => e.stopPropagation()}>
          {i.getValue()}
        </a>
      ),
    }) as ColumnDef<Job, unknown>,
    ch.accessor('source_platform', { header: 'Platform', cell: (i) => <span className={styles.badge}>{i.getValue()}</span> }) as ColumnDef<Job, unknown>,
    ch.accessor('applied_at', { header: 'Applied', cell: (i) => String(i.getValue()).slice(0, 10) }) as ColumnDef<Job, unknown>,
    ch.display({
      id: 'actions', header: '',
      cell: (i) => (
        <form action={deleteJob} onClick={(e) => e.stopPropagation()}>
          <input type="hidden" name="id" value={i.row.original.id} />
          <button type="submit" className={styles.del}>Delete</button>
        </form>
      ),
    }),
  ], []);

  const table = useReactTable({
    data: rows, columns, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  if (rows.length === 0) return <p className={styles.empty}>No applications match.</p>;

  return (
    <table className={styles.table}>
      <thead>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id}>
            {hg.headers.map((h) => (
              <th key={h.id} className={styles.th}
                onClick={h.column.getToggleSortingHandler()}
                style={{ cursor: h.column.getCanSort() ? 'pointer' : 'default' }}>
                {flexRender(h.column.columnDef.header, h.getContext())}
                {({ asc: ' ▲', desc: ' ▼' } as Record<string, string>)[h.column.getIsSorted() as string] ?? ''}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} className={styles.row} onClick={() => onRowClick(row.original)}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} className={styles.td}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

```css
/* dashboard/src/components/JobsTable.module.css */
.table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.th { text-align: left; padding: 9px 12px; font-size: 12px; color: var(--muted); border-bottom: 1px solid var(--border); background: var(--surface); user-select: none; }
.row { cursor: pointer; }
.row:hover { background: var(--row-hover); }
.td { padding: 9px 12px; font-size: 13px; border-bottom: 1px solid var(--border); }
.link { color: var(--accent); text-decoration: none; }
.link:hover { text-decoration: underline; }
.badge { font: 11px monospace; padding: 2px 6px; border-radius: 4px; background: var(--badge-bg); color: var(--muted); }
.del { padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; font-size: 12px; }
.del:hover { color: #ef4444; border-color: #ef4444; }
.empty { padding: 32px; text-align: center; color: var(--muted); border: 1px dashed var(--border); border-radius: 8px; }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (TanStack types resolve now that the dep is installed).

- [ ] **Step 3: Commit**

```bash
git add src/components/JobsTable.tsx src/components/JobsTable.module.css
git commit -m "feat(dash): sortable jobs table with row drawer + delete"
```

### Task 10: Toolbar (search, dates, platform pills, CSV, theme)

**Files:** Create `src/components/Toolbar.tsx`, `src/components/Toolbar.module.css`

- [ ] **Step 1: Implement**

```tsx
// dashboard/src/components/Toolbar.tsx
'use client';
import type { Job } from '@/lib/types';
import { toCsv } from '@/lib/toCsv';
import ThemeToggle from './ThemeToggle';
import styles from './Toolbar.module.css';

interface Props {
  search: string; setSearch: (s: string) => void;
  from: string; setFrom: (s: string) => void;
  to: string; setTo: (s: string) => void;
  platforms: string[]; setPlatforms: (p: string[]) => void;
  allPlatforms: string[];
  rows: Job[];
}

export default function Toolbar(p: Props) {
  function togglePlatform(name: string) {
    p.setPlatforms(p.platforms.includes(name) ? p.platforms.filter((x) => x !== name) : [...p.platforms, name]);
  }
  function exportCsv() {
    const blob = new Blob([toCsv(p.rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'jobs-export.csv'; a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className={styles.toolbar}>
      <input className={styles.search} placeholder="Search company, position…" value={p.search} onChange={(e) => p.setSearch(e.target.value)} />
      <label className={styles.date}>From<input type="date" value={p.from} onChange={(e) => p.setFrom(e.target.value)} /></label>
      <label className={styles.date}>To<input type="date" value={p.to} onChange={(e) => p.setTo(e.target.value)} /></label>
      <div className={styles.pills}>
        {p.allPlatforms.map((name) => (
          <button key={name} type="button"
            className={p.platforms.includes(name) ? `${styles.pill} ${styles.pillOn}` : styles.pill}
            onClick={() => togglePlatform(name)}>{name}</button>
        ))}
      </div>
      <button className={styles.csv} type="button" onClick={exportCsv}>Export CSV</button>
      <ThemeToggle />
    </div>
  );
}
```

```css
/* dashboard/src/components/Toolbar.module.css */
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.search { flex: 1 1 220px; padding: 7px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); }
.date { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); }
.date input { padding: 5px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); }
.pills { display: flex; gap: 4px; flex-wrap: wrap; }
.pill { padding: 5px 9px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--muted); cursor: pointer; font-size: 12px; }
.pillOn { background: var(--accent); color: #fff; border-color: var(--accent); }
.csv { padding: 7px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); cursor: pointer; }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/Toolbar.tsx src/components/Toolbar.module.css
git commit -m "feat(dash): toolbar — search, date range, platform pills, CSV"
```

### Task 11: Dashboard orchestrator + wire into page

**Files:** Create `src/components/Dashboard.tsx`, `src/components/Dashboard.module.css`; Modify `src/app/page.tsx`

- [ ] **Step 1: Dashboard component**

```tsx
// dashboard/src/components/Dashboard.tsx
'use client';
import { useMemo, useState } from 'react';
import type { Job } from '@/lib/types';
import { filterByDateRange, filterByPlatform, filterBySearch } from '@/lib/filterJobs';
import StatsBar from './StatsBar';
import Toolbar from './Toolbar';
import JobsTable from './JobsTable';
import JobDrawer from './JobDrawer';
import styles from './Dashboard.module.css';

export default function Dashboard({ jobs }: { jobs: Job[] }) {
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);

  const allPlatforms = useMemo(() => [...new Set(jobs.map((j) => j.source_platform))].sort(), [jobs]);
  const filtered = useMemo(
    () => filterBySearch(filterByPlatform(filterByDateRange(jobs, from, to), platforms), search),
    [jobs, from, to, platforms, search],
  );

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Applications</h1>
      <StatsBar jobs={filtered} />
      <Toolbar
        search={search} setSearch={setSearch}
        from={from} setFrom={setFrom} to={to} setTo={setTo}
        platforms={platforms} setPlatforms={setPlatforms}
        allPlatforms={allPlatforms} rows={filtered}
      />
      <JobsTable rows={filtered} onRowClick={setSelected} />
      <JobDrawer job={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
```

```css
/* dashboard/src/components/Dashboard.module.css */
.main { max-width: 1000px; margin: 24px auto; padding: 0 16px; }
.title { font-size: 20px; font-weight: 600; margin: 0 0 12px; }
```

- [ ] **Step 2: Replace `page.tsx`** (overwrite the current dashboard page)

```tsx
// dashboard/src/app/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Dashboard from '@/components/Dashboard';
import type { Job } from '@/lib/types';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('jobs')
    .select('id, company, position, link, description, source_platform, applied_at')
    .order('applied_at', { ascending: false });

  return <Dashboard jobs={(data ?? []) as Job[]} />;
}
```

- [ ] **Step 3: Typecheck + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; vitest 22 passing.

- [ ] **Step 4: Commit**

```bash
git add src/components/Dashboard.tsx src/components/Dashboard.module.css src/app/page.tsx
git commit -m "feat(dash): wire Dashboard into page with filtering + drawer"
```

---

## Phase D — Run & verify

### Task 12: 🧑 YOU RUN — run the dashboard

- [ ] **Step 1: Run**

```powershell
cd C:\Users\samir\job-tracker\dashboard
npm run dev
```

- [ ] **Step 2: Verify** at http://localhost:3000 (sign in if needed):
  1. Your jobs render in the new table; clicking a column header sorts (▲/▼ toggles).
  2. Typing in search narrows rows live; clearing restores them.
  3. Setting From/To dates filters by applied date (inclusive).
  4. Platform pills toggle on/off and filter; multiple can be active.
  5. Stats bar total + "this week" + weekly bars reflect the current filtered view.
  6. Clicking a row (not the link or Delete) opens the slide-over drawer with the full description; Esc / overlay / × closes it.
  7. "Export CSV" downloads `jobs-export.csv` of the filtered rows; open it to confirm escaping.
  8. Theme toggle (🌙/☀️) flips light/dark and **persists across a page reload**.
  9. Delete removes a row and the count updates.

Report any issue; otherwise the refactor is complete and we do a final review + merge `feat/mvp-build` → master.

---

## Self-Review

**Spec coverage (spec section → task):**
- TanStack + CSS Modules stack → Tasks 5, 9. ✔
- Server fetch → client `<Dashboard>` with in-browser filtering → Tasks 11, 2. ✔
- `Job` type incl. description → Task 1; `page.tsx` selects description → Task 11. ✔
- Global search across company/position/link/platform → `filterBySearch` Task 2, wired Task 11. ✔
- Inclusive date-range filter, optional bounds → `filterByDateRange` Task 2. ✔
- Platform multi-select (empty = all) → `filterByPlatform` Task 2; pills Task 10. ✔
- Column sorting with indicators → Task 9. ✔
- Summary stats bar (total / this week / weekly bars) → `countThisWeek` Task 4, `groupByWeek` reuse, StatsBar Task 7. ✔
- CSV export of filtered view with escaping → `toCsv` Task 3, button Task 10. ✔
- Slide-over drawer with full description, Esc/overlay/close → Task 8. ✔
- Light/dark theme toggle, persisted, OS default → Task 6. ✔
- Delete retained → Task 9 (reuses `deleteJob`). ✔
- Empty state → Task 9. ✔
- Only new dep `@tanstack/react-table` → Task 5. ✔
- Tests on pure helpers → Tasks 2,3,4 (groupByWeek already covered). ✔

**Placeholder scan:** none — every code/CSS step is complete.

**Type consistency:** `Job` (id, company, position, link, description, source_platform, applied_at) used identically across types/filterJobs/toCsv/stats/all components/page. Helper signatures `filterByDateRange(jobs,from,to)`, `filterByPlatform(jobs,platforms)`, `filterBySearch(jobs,query)`, `toCsv(jobs)`, `countThisWeek(jobs,now)` match call sites in Dashboard/StatsBar/Toolbar. CSV header (7 cols incl. description) matches its test.

**Deferred (out of scope):** first-paint theme flash, pagination, column hide/reorder, saved views.
