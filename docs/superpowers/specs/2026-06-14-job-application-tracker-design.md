# Job Application Tracker — Design Spec

**Date:** 2026-06-14
**Status:** Approved design, pre-implementation
**Author:** Samir (with Claude)

## Goal

A personal tool for recording every job application with minimal friction,
optimizing for **applications recorded per unit time** while keeping a clean,
queryable record. Explicit non-goal: **no site-specific parsers** — capture must
work across any ATS (Workday, Ashby, Greenhouse, Lever, custom sites) through
generic, standardized data sources only.

## Scope

- **In scope:** Chrome extension for one-click capture; OpenAI fallback
  extraction via a managed Supabase Edge Function; Supabase Postgres store with
  auth; a Next.js dashboard to review and count applications.
- **Out of scope (deliberately):** Firefox/Safari ports (small follow-up);
  application-status pipeline (Applied→Interview→Offer); auto follow-up emails or
  any long-running async process; multi-user/team features.
- **Single user:** the tool is built for one person (the author).

## Architecture

Two clients sharing one managed Supabase backend.

```
┌─────────────────────┐   1. extract client-side (free):
│  Browser Extension  │      JSON-LD → OG/meta → text selection
│   (Chrome MV3, TS)  │   2. if thin → POST visible text to Edge Function → OpenAI
│                     │   3. confirm popup (Enter to save)
└─────────┬───────────┘
          │ insert row (authenticated, RLS)
          ▼
   ┌──────────────────┐        ┌───────────────────────────┐
   │     Supabase     │ ◄fetch─│   Dashboard (Next.js)     │
   │  Postgres: jobs  │        │  list + applied/week chart│
   │  Auth + RLS      │        │  inline edit / delete     │
   │  Edge Function   │        └───────────────────────────┘
   └──────────────────┘
```

The only backend components are (1) the managed Postgres database and (2) one
managed Edge Function. No self-hosted server.

## Data model — `jobs` table

| column            | type        | notes                                                        |
|-------------------|-------------|--------------------------------------------------------------|
| `id`              | uuid (pk)   | default `gen_random_uuid()`                                  |
| `user_id`         | uuid        | FK → `auth.users.id`; set from `auth.uid()` via RLS          |
| `company`         | text        | required                                                     |
| `position`        | text        | required                                                     |
| `link`            | text        | posting URL; basis for duplicate detection                   |
| `description`     | text (null) | full JD when available, else null                            |
| `source_platform` | text        | label derived from URL host (workday/ashby/greenhouse/lever/other) — **stats only, never drives extraction** |
| `applied_at`      | timestamptz | default `now()`, editable in the capture popup               |
| `created_at`      | timestamptz | default `now()`                                              |

- **Unique index** on `(user_id, link)` → re-capturing an already-saved posting
  warns and offers to update rather than creating a duplicate.
- `source_platform` is computed in the extension from the URL hostname purely so
  the dashboard can show a breakdown; it has no role in parsing.

## Extraction strategy (the parser-free chain)

We never read the page's visual DOM/CSS layout (the part that differs per
platform). We read standardized layers that have the **same shape on every
site**, falling back progressively. All layers are one generic code path each —
zero platform branches.

1. **JSON-LD `JobPosting`** — query `script[type="application/ld+json"]`,
   `JSON.parse`, find the object whose `@type` is `JobPosting` (handle arrays and
   `@graph`), read `title`, `hiringOrganization.name`, `description` (strip HTML).
   Covers most ATSs because Google for Jobs incentivizes employers to embed it.
2. **Open Graph / meta + `document.title`** — `og:title`, `og:site_name`,
   `og:description`, and title heuristics (split on `–`, `|`, `at`) to separate
   position from company. Generic, cross-site.
3. **Text selection** — if the user highlighted text before clicking,
   `window.getSelection().toString()` provides the description/title. Depends on
   the user's selection, not page structure.
4. **LLM fallback (OpenAI)** — when layers 1–3 are thin (notably some Workday
   pages), grab `document.body.innerText` (visible text only, layout discarded)
   and POST it to the Edge Function, which calls OpenAI and returns
   `{ company, position, description }`. The model absorbs cross-platform
   variability instead of hand-written parsers.
5. **Manual** — any field still empty is typed by the user in the popup.

Runtime order: `JSON-LD → OG/meta → selection → LLM → manual`.

### LLM fallback details

- **Model:** `gpt-4o-mini`. Chosen because the task is simple structured
  extraction from clean text (no reasoning/long-context), the model supports
  **Structured Outputs** (`response_format: json_schema`) for guaranteed-valid
  JSON, and it is only invoked on the fallback path (low volume, negligible cost).
  `gpt-4.1-nano` is a documented cheaper downgrade to evaluate later if accuracy
  proves sufficient.
- **Structured output schema:** `{ company: string, position: string,
  description: string }`, all required (empty string if genuinely absent).
- **Input trimming:** cap `innerText` to a sane character limit (e.g. ~12k chars)
  before sending, to bound token cost.

## Edge Function (`extract-job`)

- Managed Supabase Edge Function (Deno runtime, TypeScript). Deployed via
  `supabase functions deploy extract-job`; reachable at
  `https://<project>.supabase.co/functions/v1/extract-job`.
- Holds the **OpenAI API key as a secret** (`supabase secrets set
  OPENAI_API_KEY=...`) — the key never ships in the extension.
- **Stateless** request/response: receives `{ pageText, url }`, calls OpenAI with
  Structured Outputs, returns `{ company, position, description }`.
- **Auth:** requires the caller's Supabase JWT (the signed-in extension session);
  rejects unauthenticated calls so the endpoint can't be abused.
- **Resilience:** one retry on transient OpenAI/network error, then returns a
  clear error the extension surfaces in the popup. This is a simple serverless
  function — **not** a durable workflow; the capture is short and synchronous, so
  there is no multi-step progress to checkpoint.

## Capture flow (extension)

1. User is on a job posting and clicks the extension button (or hotkey).
2. Extraction chain runs (client-side layers first, Edge Function only if needed).
3. **Confirm popup** appears, pre-filled: `company`, `position`, `description`,
   `applied_at`. User glances, optionally edits a field, presses **Enter**.
4. On save, insert the row into Supabase (authenticated, RLS sets `user_id`).
5. A toast confirms. If `(user_id, link)` already exists, the popup warns and
   offers **Update** instead of insert.
6. **Don't-lose-work guarantee:** if the insert fails (offline/network), the
   popup retains the filled-in data and the extension stashes it in
   `chrome.storage` for retry. (This is local persistence of the user's input,
   not durable orchestration.)

Target time per capture: ~1–2 seconds.

## Dashboard (Next.js)

- **Stack:** Next.js (App Router) + `@supabase/supabase-js`, deployable to Vercel.
- **Auth:** Supabase Auth (email + password). Same account the extension uses.
- **Views:**
  - Sortable/searchable table: company, position, link (click-through),
    `source_platform`, `applied_at`.
  - **Applied-per-week/day** count + small bar chart (the throughput metric).
  - Breakdown by `source_platform` (nice-to-have, cheap given the column).
  - Inline edit and delete of a row.

## Auth & security

- **Supabase Auth (email + password)**, single user.
- The dashboard signs in normally; the **extension signs in once** and stores its
  session (refresh token) in `chrome.storage`, attaching the JWT to inserts and
  Edge Function calls.
- **RLS policy** on `jobs`: a user may read/write only rows where
  `user_id = auth.uid()`. Insert policy sets `user_id` from `auth.uid()`.
- The OpenAI key lives only in the Edge Function secret store; the extension is
  treated as public code and holds no third-party API keys.

## Tech stack summary

- **Extension:** Chrome Manifest V3, built with Vite, vanilla TypeScript (no UI
  framework needed for a small popup).
- **Backend:** Supabase — Postgres + Auth + one Edge Function (Deno/TS).
- **LLM:** OpenAI `gpt-4o-mini` via the Edge Function, Structured Outputs.
- **Dashboard:** Next.js (App Router) + `@supabase/supabase-js`, Vercel.

## Testing

- **Extraction layer (unit):** feed saved HTML samples — Greenhouse, Lever,
  Ashby, a Workday page (thin structured data), and a bare custom page — and
  assert the correct fallback layer fires and fields are extracted/cleaned.
- **Edge Function:** test with a sample `pageText` payload; assert the structured
  output schema is honored and the retry path behaves on a simulated failure.
- **Dashboard:** component/integration tests for the list render and the
  applied-per-week count.
- **Dedup:** test that re-saving the same `(user_id, link)` triggers the
  update-vs-insert path.

## Open follow-ups (explicitly deferred, not in this build)

- Firefox/Safari ports.
- Optional `status` column + pipeline view (single-column addition later).
- `gpt-4.1-nano` cost A/B once real accuracy data exists.
