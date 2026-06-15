# Dashboard UI Refactor — Design Spec

**Date:** 2026-06-14
**Status:** Approved design, pre-implementation
**Scope:** Refactor the existing job-tracker dashboard into a Drizzle-Studio-style data dashboard.

## Goal

Turn the current bare dashboard (single `page.tsx`, inline styles, no filtering) into a clean, dense data dashboard with global search, date-range filtering, column sorting, a platform quick-filter, a summary stats bar, CSV export, a slide-over detail drawer, and a light/dark theme toggle. Personal single-user tool, modest data (hundreds of rows).

## Non-goals (YAGNI)

- Server-side pagination/filtering — data is small enough to filter client-side.
- Editing job fields in the dashboard (delete stays; edits happen via re-capture).
- Saved filter presets, column reordering/hiding, multi-row selection, bulk actions.

## Stack decision

- **`@tanstack/react-table`** (headless) for sorting, global text search, and row model — avoids hand-rolled filter/sort bugs.
- **CSS Modules** for styling (no Tailwind migration). One `*.module.css` per component.
- Only new dependency: `@tanstack/react-table`.

## Architecture & data flow

The server component keeps doing auth + fetch (RLS-scoped); a client `<Dashboard>` does all interactivity in the browser on the fetched array.

```
src/app/page.tsx  (server: getUser -> redirect /login if none; fetch jobs)
  └─ <Dashboard jobs={Job[]}>                       (client; owns all UI state)
       ├─ <StatsBar jobs={filtered}>                total · this week · weekly bars
       ├─ <Toolbar ...>                             search · date from/to · platform pills · CSV · theme toggle
       ├─ <JobsTable rows={filtered} onRowClick=>   TanStack: sort · global search · delete
       └─ <JobDrawer job={selected|null}>           slide-over detail + full description
```

**Filter split (for testability):** date-range and platform filtering are **pure functions** applied to the array before it reaches the table; **global text search + column sorting** are handled by TanStack on that pre-filtered array. CSV exports the current filtered+searched view.

## Data model (client `Job` type)

`src/lib/types.ts`:
```ts
export interface Job {
  id: string;
  company: string;
  position: string;
  link: string;
  description: string | null;
  source_platform: string;
  applied_at: string;   // ISO timestamp from Postgres
}
```
The server query in `page.tsx` selects exactly these columns (adds `description` to the current select).

## Components & files

Each file has one responsibility:

- **`src/app/page.tsx`** *(server)* — auth + fetch `Job[]` (now including `description`), render `<Dashboard>`. Thin.
- **`src/components/Dashboard.tsx`** *(client)* — owns state: `search`, `from`, `to`, `platforms: string[]`, `selected: Job | null`. Derives `filtered = filterByPlatform(filterByDateRange(jobs, from, to), platforms)`. Lays out StatsBar + Toolbar + JobsTable + JobDrawer.
- **`src/components/Toolbar.tsx`** — search input (bound to a `search` state used as TanStack global filter), two `<input type="date">` (from/to), platform toggle pills, CSV export button, `<ThemeToggle>`.
- **`src/components/JobsTable.tsx`** — `useReactTable` with column defs (inline), `getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel`; global filter = `search`; sortable headers; per-row Delete (calls `deleteJob` server action); clicking a row calls `onRowClick(job)`.
- **`src/components/JobDrawer.tsx`** — right-side slide-over. Shows company, position (linked), platform badge, applied date, and full `description`. Closes via close button, overlay click, or Esc. Renders nothing when `job` is null.
- **`src/components/StatsBar.tsx`** — total count, count this week (`countThisWeek`), and weekly mini-bars (reuses `groupByWeek`). Reflects the *filtered* set.
- **`src/components/ThemeToggle.tsx`** — button toggling `data-theme` (`light`/`dark`) on `document.documentElement`, persisted to `localStorage` (`jobtracker-theme`); applies stored/`prefers-color-scheme` default on mount.
- **Pure helpers (unit-tested):**
  - `src/lib/filterJobs.ts` — `filterByDateRange(jobs, from, to)` (inclusive; either bound optional/empty), `filterByPlatform(jobs, platforms)` (empty array = all).
  - `src/lib/toCsv.ts` — `toCsv(jobs)` → CSV string with proper escaping (commas, quotes, newlines), header row `id,company,position,link,source_platform,applied_at`.
  - `src/lib/stats.ts` — `countThisWeek(jobs, now)` → number (current ISO week, Monday start, UTC).
  - `src/lib/groupByWeek.ts` — existing, reused.
- **`src/app/actions.ts`** — existing `deleteJob` server action, unchanged.
- **Styling:** `src/app/globals.css` gains CSS custom properties for both themes (`:root` light defaults; `[data-theme="dark"]` overrides) — surface, text, border, muted, accent, badge colors. Each component imports its own `*.module.css` referencing those vars.

## Behavior details

- **Search:** case-insensitive substring across `company`, `position`, `link`, `source_platform` (TanStack `globalFilterFn` that joins those fields).
- **Date filter:** `from`/`to` inclusive on `applied_at` (compared by calendar date). Empty bound = unbounded on that side.
- **Platform filter:** toggle pills for the platforms present in the data; multi-select; none selected = show all.
- **Sort:** click column headers (company, position, platform, applied); shows ▲/▼; toggles asc/desc/none.
- **Drawer:** row click (outside the Delete button / link) opens the slide-over with the full description; Esc/overlay/close dismisses.
- **CSV:** exports the current filtered+searched rows as `jobs-export.csv` via a Blob download.
- **Delete:** per-row button → `deleteJob` server action → `revalidatePath('/')`; row click on the button does **not** open the drawer (stop propagation).
- **Theme:** toggle persists; default = `localStorage` value, else `prefers-color-scheme`, else light. Applied on `document.documentElement` to avoid per-component theming.
- **Empty state:** when `jobs` is empty or filters match nothing, the table area shows a friendly "No applications match" message.

## Theme handling note

To avoid a hydration mismatch, the toggle applies the theme in a `useEffect` on mount (initial server render is the light default). Acceptable for a personal tool; a blocking inline `<script>` in `layout.tsx` could eliminate the first-paint flash later if desired (out of scope now).

## Testing

Vitest (Node env) on the pure helpers:
- `filterByDateRange` — inside/at boundaries (inclusive), open-ended from-only and to-only, empty result.
- `filterByPlatform` — single, multiple, empty-array = all, no-match.
- `toCsv` — header present; escaping of fields containing commas, double-quotes, and newlines; null description → empty cell.
- `countThisWeek` — counts only current ISO week (Monday start), excludes last week/next week.
- `groupByWeek` — already covered.

React components are validated by running the app (manual: search, date range, platform pills, sort, drawer open/close, CSV download, theme toggle persists across reload, delete).

## Out-of-scope follow-ups

- First-paint theme flash elimination (inline script).
- Pagination if row counts grow large.
- Column visibility / reordering, saved views.
