# Job Application Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome extension that one-click records any job posting (no site-specific parsers) into Supabase, plus a Next.js dashboard to review and count applications.

**Architecture:** Extraction is a layered, generic chain (`JSON-LD JobPosting → OG/meta+title → text selection → OpenAI fallback → manual`). The extension runs the client-side layers in a content script; when required fields are still missing it calls a managed Supabase Edge Function that uses OpenAI `gpt-4o-mini` (Structured Outputs). Records land in a Postgres `jobs` table protected by RLS. A separate Next.js dashboard reads them.

**Tech Stack:** Chrome MV3 + Vite + `@crxjs/vite-plugin` + TypeScript; Vitest + jsdom for tests; Supabase (Postgres, Auth, Edge Functions/Deno); OpenAI `gpt-4o-mini`; Next.js (App Router) + `@supabase/ssr`.

**Reference:** Full design in `design-spec.md`.

**Conventions used in this plan:**
- Steps marked **🧑 YOU RUN** are commands Samir runs himself (they need secrets or live project access). The implementing agent provides the exact command and waits.
- Project config (public-safe): `SUPABASE_URL=https://jcneolycvbspepjcodec.supabase.co`, publishable key `sb_publishable_-IKt6Nbo_htLjgeU5cwb3A_JCSj2L7f`, GitHub `origin=https://github.com/abdulsami123/job-tracker.git`.

**Repo layout produced by this plan:**
```
job-tracker/
  design-spec.md
  implementation-plan.md
  supabase/
    migrations/0001_init.sql
    functions/extract-job/index.ts
  extension/
    package.json  tsconfig.json  vite.config.ts  vitest.config.ts  manifest.json  .env.example
    src/
      types.ts
      extraction/{platform,html,jsonld,meta,extract}.ts + *.test.ts
      content.ts  popup.html  popup.ts  supabaseClient.ts  styles.css
  dashboard/
    (Next.js app)  .env.example
    src/lib/{groupByWeek.ts,groupByWeek.test.ts, supabase/{server.ts,client.ts}}
    src/app/{login/page.tsx, page.tsx, actions.ts}
    src/middleware.ts
```

---

## Phase 0 — Repo skeleton

### Task 0: Create folders and push skeleton to GitHub

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README**

```markdown
# Job Tracker

One-click job-application recorder. Chrome extension (no site-specific parsers) →
Supabase → Next.js dashboard. See `design-spec.md` and `implementation-plan.md`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md && git commit -m "docs: add README"
```

- [ ] **Step 3: 🧑 YOU RUN — push the skeleton to GitHub**

```bash
git push -u origin master
```
Expected: branch `master` appears on github.com/abdulsami123/job-tracker.

---

## Phase 1 — Database (Supabase)

### Task 1: Create the `jobs` table + RLS

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0001_init.sql
create extension if not exists pgcrypto;

create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  company         text not null,
  position        text not null,
  link            text not null,
  description     text,
  source_platform text not null default 'other',
  applied_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- one row per (user, posting URL); basis for dedup
create unique index jobs_user_link_uniq on public.jobs (user_id, link);
create index jobs_user_applied_idx on public.jobs (user_id, applied_at desc);

alter table public.jobs enable row level security;

create policy "select own jobs" on public.jobs
  for select using (auth.uid() = user_id);
create policy "insert own jobs" on public.jobs
  for insert with check (auth.uid() = user_id);
create policy "update own jobs" on public.jobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own jobs" on public.jobs
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0001_init.sql && git commit -m "feat(db): jobs table + RLS"
```

- [ ] **Step 3: 🧑 YOU RUN — link project and apply migration**

```bash
npm i -g supabase                       # if not already installed
supabase login                          # opens browser
supabase link --project-ref jcneolycvbspepjcodec   # prompts for DB password
supabase db push                        # applies 0001_init.sql
```
Expected: "Applying migration 0001_init.sql..." then success. Verify in Supabase Studio → Table Editor that `jobs` exists with RLS enabled.

- [ ] **Step 4: 🧑 YOU RUN — create your login user**

In Supabase Studio → Authentication → Users → **Add user** → email `samirizvi25@gmail.com`, set a password (you'll use it in the extension and dashboard). Check "Auto Confirm User".

---

## Phase 2 — Extraction core (pure, fully unit-tested)

This is the heart of the "no parser per site" promise. All functions are pure and
tested with Vitest + jsdom. No platform branches anywhere.

### Task 2: Initialize the extension project

**Files:**
- Create: `extension/package.json`, `extension/tsconfig.json`, `extension/vitest.config.ts`, `extension/.env.example`

- [ ] **Step 1: package.json**

```json
{
  "name": "job-tracker-extension",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.25",
    "@types/chrome": "^0.0.270",
    "jsdom": "^25.0.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": true,
    "types": ["chrome", "vite/client"],
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: .env.example**

```bash
VITE_SUPABASE_URL=https://jcneolycvbspepjcodec.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_-IKt6Nbo_htLjgeU5cwb3A_JCSj2L7f
```

- [ ] **Step 5: 🧑 YOU RUN — install deps**

```bash
cd extension && npm install
```
Expected: `node_modules/` created, no errors. (If `@crxjs/vite-plugin` beta version 404s, run `npm i -D @crxjs/vite-plugin@latest`.)

- [ ] **Step 6: Commit**

```bash
git add extension/package.json extension/tsconfig.json extension/vitest.config.ts extension/.env.example
git commit -m "chore(ext): scaffold extension project"
```

### Task 3: Shared types

**Files:**
- Create: `extension/src/types.ts`

- [ ] **Step 1: Write the types** (no test — type-only file)

```ts
// extension/src/types.ts
export interface JobFields {
  company: string;
  position: string;
  description: string;
}

export interface ExtractionResult {
  fields: JobFields;        // best-effort client-side fill (may have empty strings)
  pageText: string;         // trimmed visible text for the LLM fallback
  url: string;
  sourcePlatform: string;   // label from URL host — stats only
  needsLlm: boolean;        // true when company or position is still empty
}
```

- [ ] **Step 2: Commit**

```bash
git add extension/src/types.ts && git commit -m "feat(ext): shared extraction types"
```

### Task 4: Platform detection (TDD)

**Files:**
- Create: `extension/src/extraction/platform.ts`, `extension/src/extraction/platform.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// extension/src/extraction/platform.test.ts
import { describe, it, expect } from 'vitest';
import { detectPlatform } from './platform';

describe('detectPlatform', () => {
  it('maps known ATS hosts', () => {
    expect(detectPlatform('https://acme.wd1.myworkdayjobs.com/job/123')).toBe('workday');
    expect(detectPlatform('https://boards.greenhouse.io/acme/jobs/1')).toBe('greenhouse');
    expect(detectPlatform('https://jobs.lever.co/acme/abc')).toBe('lever');
    expect(detectPlatform('https://jobs.ashbyhq.com/acme/xyz')).toBe('ashby');
  });
  it('falls back to other', () => {
    expect(detectPlatform('https://careers.acme.com/role')).toBe('other');
  });
  it('never throws on a bad url', () => {
    expect(detectPlatform('not a url')).toBe('other');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/extraction/platform.test.ts`
Expected: FAIL — "Cannot find module './platform'".

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/extraction/platform.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/src/extraction/platform.* && git commit -m "feat(ext): platform detection from URL host"
```

### Task 5: HTML helpers — stripHtml & splitTitle (TDD)

**Files:**
- Create: `extension/src/extraction/html.ts`, `extension/src/extraction/html.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// extension/src/extraction/html.test.ts
import { describe, it, expect } from 'vitest';
import { stripHtml, splitTitle } from './html';

describe('stripHtml', () => {
  it('removes tags and collapses whitespace', () => {
    expect(stripHtml('<p>Hello   <b>world</b></p>\n<p>Bye</p>')).toBe('Hello world Bye');
  });
  it('decodes common entities', () => {
    expect(stripHtml('R&amp;D &lt;team&gt;')).toBe('R&D <team>');
  });
  it('handles empty/undefined', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(undefined)).toBe('');
  });
});

describe('splitTitle', () => {
  it('splits "Position - Company"', () => {
    expect(splitTitle('Senior Engineer - Acme')).toEqual({ position: 'Senior Engineer', company: 'Acme' });
  });
  it('splits "Position | Company"', () => {
    expect(splitTitle('Designer | Globex Careers')).toEqual({ position: 'Designer', company: 'Globex Careers' });
  });
  it('splits "Position at Company"', () => {
    expect(splitTitle('Data Analyst at Initech')).toEqual({ position: 'Data Analyst', company: 'Initech' });
  });
  it('returns only position when no separator', () => {
    expect(splitTitle('Product Manager')).toEqual({ position: 'Product Manager', company: '' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/extraction/html.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/extraction/html.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/src/extraction/html.* && git commit -m "feat(ext): stripHtml + splitTitle helpers"
```

### Task 6: JSON-LD JobPosting reader (TDD)

**Files:**
- Create: `extension/src/extraction/jsonld.ts`, `extension/src/extraction/jsonld.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// extension/src/extraction/jsonld.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readJsonLd } from './jsonld';

function setLd(json: unknown) {
  document.head.innerHTML = '';
  const s = document.createElement('script');
  s.type = 'application/ld+json';
  s.textContent = JSON.stringify(json);
  document.head.appendChild(s);
}

describe('readJsonLd', () => {
  beforeEach(() => { document.head.innerHTML = ''; });

  it('reads a top-level JobPosting', () => {
    setLd({
      '@type': 'JobPosting',
      title: 'Backend Engineer',
      hiringOrganization: { name: 'Acme Corp' },
      description: '<p>Build <b>things</b></p>',
    });
    expect(readJsonLd(document)).toEqual({
      company: 'Acme Corp', position: 'Backend Engineer', description: 'Build things',
    });
  });

  it('finds JobPosting inside @graph', () => {
    setLd({ '@graph': [{ '@type': 'WebSite' }, {
      '@type': 'JobPosting', title: 'PM', hiringOrganization: { name: 'Globex' }, description: 'Lead',
    }]});
    expect(readJsonLd(document)?.position).toBe('PM');
  });

  it('returns null when no JobPosting present', () => {
    setLd({ '@type': 'Organization', name: 'Acme' });
    expect(readJsonLd(document)).toBeNull();
  });

  it('ignores malformed JSON without throwing', () => {
    document.head.innerHTML = '';
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = '{ not valid json';
    document.head.appendChild(s);
    expect(readJsonLd(document)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/extraction/jsonld.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// extension/src/extraction/jsonld.ts
import type { JobFields } from '../types';
import { stripHtml } from './html';

function* candidates(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) {
    for (const n of node) yield* candidates(n);
  } else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if ('@graph' in obj) yield* candidates(obj['@graph']);
    yield obj;
  }
}

function isJobPosting(obj: Record<string, unknown>): boolean {
  const t = obj['@type'];
  return t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'));
}

export function readJsonLd(doc: Document): JobFields | null {
  const blocks = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const block of Array.from(blocks)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block.textContent || '');
    } catch {
      continue;
    }
    for (const obj of candidates(parsed)) {
      if (!isJobPosting(obj)) continue;
      const org = obj['hiringOrganization'];
      const company =
        org && typeof org === 'object' ? String((org as Record<string, unknown>)['name'] ?? '') : '';
      return {
        company: company.trim(),
        position: String(obj['title'] ?? '').trim(),
        description: stripHtml(String(obj['description'] ?? '')),
      };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/extraction/jsonld.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/src/extraction/jsonld.* && git commit -m "feat(ext): generic JSON-LD JobPosting reader"
```

### Task 7: OG/meta + title reader (TDD)

**Files:**
- Create: `extension/src/extraction/meta.ts`, `extension/src/extraction/meta.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// extension/src/extraction/meta.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readMeta } from './meta';

describe('readMeta', () => {
  beforeEach(() => { document.head.innerHTML = ''; document.title = ''; });

  it('prefers og:title + og:site_name', () => {
    document.head.innerHTML =
      '<meta property="og:title" content="Senior Engineer">' +
      '<meta property="og:site_name" content="Acme">' +
      '<meta property="og:description" content="Join us">';
    expect(readMeta(document)).toEqual({
      company: 'Acme', position: 'Senior Engineer', description: 'Join us',
    });
  });

  it('falls back to document.title split when og missing', () => {
    document.title = 'Data Analyst at Initech';
    expect(readMeta(document)).toEqual({
      company: 'Initech', position: 'Data Analyst', description: '',
    });
  });

  it('uses og:title for position but title-split for company when site_name absent', () => {
    document.head.innerHTML = '<meta property="og:title" content="Designer - Globex">';
    const r = readMeta(document);
    expect(r.position).toBe('Designer');
    expect(r.company).toBe('Globex');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/extraction/meta.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/extraction/meta.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/src/extraction/meta.* && git commit -m "feat(ext): OG/meta + title reader"
```

### Task 8: Extraction orchestrator (TDD)

**Files:**
- Create: `extension/src/extraction/extract.ts`, `extension/src/extraction/extract.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// extension/src/extraction/extract.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { extractFromDocument } from './extract';

describe('extractFromDocument', () => {
  beforeEach(() => { document.head.innerHTML = ''; document.body.innerHTML = ''; document.title = ''; });

  it('uses JSON-LD when present and marks needsLlm=false', () => {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify({
      '@type': 'JobPosting', title: 'SRE', hiringOrganization: { name: 'Acme' }, description: 'Run prod',
    });
    document.head.appendChild(s);
    const r = extractFromDocument(document, '', 'https://jobs.lever.co/acme/1');
    expect(r.fields).toEqual({ company: 'Acme', position: 'SRE', description: 'Run prod' });
    expect(r.needsLlm).toBe(false);
    expect(r.sourcePlatform).toBe('lever');
  });

  it('falls back to meta and fills description from selection', () => {
    document.head.innerHTML = '<meta property="og:title" content="PM - Globex">';
    const r = extractFromDocument(document, 'Selected JD text', 'https://careers.globex.com/x');
    expect(r.fields.company).toBe('Globex');
    expect(r.fields.position).toBe('PM');
    expect(r.fields.description).toBe('Selected JD text');
    expect(r.needsLlm).toBe(false);
  });

  it('sets needsLlm=true when company or position missing', () => {
    document.title = 'Careers';
    const r = extractFromDocument(document, '', 'https://acme.myworkdayjobs.com/job/9');
    expect(r.needsLlm).toBe(true);
    expect(r.sourcePlatform).toBe('workday');
  });

  it('caps pageText length', () => {
    document.body.innerHTML = '<div>' + 'x'.repeat(20000) + '</div>';
    const r = extractFromDocument(document, '', 'https://x.com');
    expect(r.pageText.length).toBeLessThanOrEqual(12000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/extraction/extract.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
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
```

> Note: runtime uses `doc.body.innerText`; tests use jsdom where `innerText` is undefined, so we read `textContent` here — it is equivalent for our purpose (LLM input) and keeps the function testable. The content script (Task 12) passes the live `document`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/extraction/extract.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full extraction suite**

Run: `npx vitest run`
Expected: all tests across platform/html/jsonld/meta/extract PASS.

- [ ] **Step 6: Commit**

```bash
git add extension/src/extraction/extract.* && git commit -m "feat(ext): extraction orchestrator with layered fallback"
```

---

## Phase 3 — Edge Function (OpenAI fallback)

### Task 9: `extract-job` Edge Function

**Files:**
- Create: `supabase/functions/extract-job/index.ts`

- [ ] **Step 1: Write the function**

```ts
// supabase/functions/extract-job/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import OpenAI from 'npm:openai@4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const JOB_SCHEMA = {
  name: 'job_fields',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      company: { type: 'string' },
      position: { type: 'string' },
      description: { type: 'string' },
    },
    required: ['company', 'position', 'description'],
  },
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function extractWithRetry(openai: OpenAI, pageText: string) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You extract structured data from a job posting page. Return company (the hiring employer name), ' +
              'position (the job title), and description (the job description as plain text). ' +
              'If a field is genuinely absent, return an empty string.',
          },
          { role: 'user', content: pageText.slice(0, 12000) },
        ],
        response_format: { type: 'json_schema', json_schema: JOB_SCHEMA },
      });
      return JSON.parse(completion.choices[0].message.content ?? '{}');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    // Require an authenticated Supabase user.
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const pageText = body?.pageText;
    if (typeof pageText !== 'string' || pageText.length < 20) {
      return json({ error: 'pageText required' }, 400);
    }

    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! });
    const fields = await extractWithRetry(openai, pageText);
    return json(fields, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/extract-job/index.ts && git commit -m "feat(fn): extract-job OpenAI fallback"
```

- [ ] **Step 3: 🧑 YOU RUN — set the OpenAI secret and deploy**

```bash
supabase secrets set OPENAI_API_KEY=sk-...   --project-ref jcneolycvbspepjcodec
supabase functions deploy extract-job        --project-ref jcneolycvbspepjcodec
```
Expected: "Deployed Function extract-job". (`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically — do not set them.)

- [ ] **Step 4: 🧑 YOU RUN — smoke test with your user's token**

Get an access token: in Supabase Studio → Authentication → your user → there's no copy-token button, so easiest is to test end-to-end from the extension in Task 14. To test now via curl, first mint a token:
```bash
curl -X POST 'https://jcneolycvbspepjcodec.supabase.co/auth/v1/token?grant_type=password' \
  -H "apikey: sb_publishable_-IKt6Nbo_htLjgeU5cwb3A_JCSj2L7f" \
  -H "Content-Type: application/json" \
  -d '{"email":"samirizvi25@gmail.com","password":"YOUR_PASSWORD"}'
```
Copy `access_token` from the response, then:
```bash
curl -X POST 'https://jcneolycvbspepjcodec.supabase.co/functions/v1/extract-job' \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pageText":"Acme Corp is hiring a Senior Backend Engineer. You will build distributed systems in Go. Remote. Apply now."}'
```
Expected: JSON like `{"company":"Acme Corp","position":"Senior Backend Engineer","description":"..."}`.

---

## Phase 4 — Extension runtime (capture flow)

### Task 10: Manifest + Vite/CRXJS config

**Files:**
- Create: `extension/manifest.json`, `extension/vite.config.ts`

- [ ] **Step 1: manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Job Tracker",
  "version": "0.1.0",
  "description": "One-click record of every job you apply to.",
  "action": { "default_popup": "src/popup.html", "default_title": "Record this job" },
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": ["https://jcneolycvbspepjcodec.supabase.co/*"],
  "content_scripts": [
    { "matches": ["<all_urls>"], "js": ["src/content.ts"], "run_at": "document_idle" }
  ]
}
```

- [ ] **Step 2: vite.config.ts**

```ts
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  // CRXJS needs a fixed port for HMR; harmless for build.
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
});
```

- [ ] **Step 3: Commit**

```bash
git add extension/manifest.json extension/vite.config.ts && git commit -m "chore(ext): MV3 manifest + crxjs vite config"
```

### Task 11: Supabase client with chrome.storage auth

**Files:**
- Create: `extension/src/supabaseClient.ts`

- [ ] **Step 1: Implement** (no unit test — thin wrapper over the SDK; verified in E2E Task 14)

```ts
// extension/src/supabaseClient.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Persist the auth session in chrome.storage.local so it survives popup closes.
const chromeStorage = {
  getItem: (key: string): Promise<string | null> =>
    new Promise((res) => chrome.storage.local.get(key, (r) => res(r[key] ?? null))),
  setItem: (key: string, value: string): Promise<void> =>
    new Promise((res) => chrome.storage.local.set({ [key]: value }, () => res())),
  removeItem: (key: string): Promise<void> =>
    new Promise((res) => chrome.storage.local.remove(key, () => res())),
};

export const supabase: SupabaseClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: chromeStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);
```

- [ ] **Step 2: Commit**

```bash
git add extension/src/supabaseClient.ts && git commit -m "feat(ext): supabase client with chrome.storage session"
```

### Task 12: Content script

**Files:**
- Create: `extension/src/content.ts`

- [ ] **Step 1: Implement**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add extension/src/content.ts && git commit -m "feat(ext): content script returns extraction result"
```

### Task 13: Popup UI + capture flow

**Files:**
- Create: `extension/src/popup.html`, `extension/src/popup.ts`, `extension/src/styles.css`

- [ ] **Step 1: popup.html**

```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><link rel="stylesheet" href="./styles.css" /></head>
  <body>
    <div id="app">
      <!-- Login view -->
      <form id="login" hidden>
        <h1>Sign in</h1>
        <input id="email" type="email" placeholder="email" autocomplete="username" />
        <input id="password" type="password" placeholder="password" autocomplete="current-password" />
        <button type="submit">Sign in</button>
        <p id="login-error" class="error"></p>
      </form>

      <!-- Capture view -->
      <form id="capture" hidden>
        <h1 id="status">Reading page…</h1>
        <label>Company<input id="f-company" /></label>
        <label>Position<input id="f-position" /></label>
        <label>Applied<input id="f-applied" type="date" /></label>
        <label>Description<textarea id="f-description" rows="4"></textarea></label>
        <input id="f-link" type="hidden" />
        <button type="submit" id="save">Save (Enter)</button>
        <p id="capture-msg" class="msg"></p>
      </form>
    </div>
    <script type="module" src="./popup.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: styles.css**

```css
body { width: 340px; font: 13px system-ui, sans-serif; margin: 0; }
#app { padding: 12px; }
h1 { font-size: 14px; margin: 0 0 8px; }
form { display: flex; flex-direction: column; gap: 6px; }
label { display: flex; flex-direction: column; gap: 2px; font-weight: 600; }
input, textarea { font: inherit; padding: 5px; border: 1px solid #ccc; border-radius: 4px; }
button { padding: 7px; border: 0; border-radius: 4px; background: #2563eb; color: #fff; cursor: pointer; }
button:hover { background: #1d4ed8; }
.error { color: #b91c1c; }
.msg { color: #047857; }
```

- [ ] **Step 3: popup.ts**

```ts
// extension/src/popup.ts
import { supabase } from './supabaseClient';
import type { ExtractionResult, JobFields } from './types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const loginForm = $('login') as HTMLFormElement;
const captureForm = $('capture') as HTMLFormElement;

function show(view: 'login' | 'capture') {
  loginForm.hidden = view !== 'login';
  captureForm.hidden = view !== 'capture';
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab.id!;
}

async function runExtraction(): Promise<ExtractionResult> {
  const tabId = await activeTabId();
  return await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT' });
}

async function llmFill(result: ExtractionResult): Promise<JobFields> {
  const { data, error } = await supabase.functions.invoke('extract-job', {
    body: { pageText: result.pageText, url: result.url },
  });
  if (error) throw error;
  return data as JobFields;
}

function fillForm(fields: JobFields, link: string) {
  ($('f-company') as HTMLInputElement).value = fields.company;
  ($('f-position') as HTMLInputElement).value = fields.position;
  ($('f-description') as HTMLTextAreaElement).value = fields.description;
  ($('f-applied') as HTMLInputElement).value = todayISO();
  ($('f-link') as HTMLInputElement).value = link;
}

let sourcePlatform = 'other';

async function startCapture() {
  show('capture');
  const status = $('status');
  try {
    const result = await runExtraction();
    sourcePlatform = result.sourcePlatform;
    let fields = result.fields;
    if (result.needsLlm) {
      status.textContent = 'Asking AI to read the page…';
      try {
        const llm = await llmFill(result);
        // fill only the gaps
        fields = {
          company: fields.company || llm.company,
          position: fields.position || llm.position,
          description: fields.description || llm.description,
        };
      } catch {
        status.textContent = 'AI unavailable — fill manually.';
      }
    }
    fillForm(fields, result.url);
    if (status.textContent?.startsWith('Reading') || status.textContent?.startsWith('Asking')) {
      status.textContent = 'Review & save';
    }
    ($('f-company') as HTMLInputElement).focus();
  } catch {
    status.textContent = 'Could not read this tab. Reload the page and retry.';
  }
}

async function save(e: Event) {
  e.preventDefault();
  const msg = $('capture-msg');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { show('login'); return; }

  const row = {
    user_id: user.id,
    company: ($('f-company') as HTMLInputElement).value.trim(),
    position: ($('f-position') as HTMLInputElement).value.trim(),
    link: ($('f-link') as HTMLInputElement).value,
    description: ($('f-description') as HTMLTextAreaElement).value.trim() || null,
    source_platform: sourcePlatform,
    applied_at: ($('f-applied') as HTMLInputElement).value,
  };

  const { error } = await supabase.from('jobs').insert(row);
  if (!error) { msg.textContent = 'Saved ✓'; setTimeout(() => window.close(), 700); return; }

  if ((error as { code?: string }).code === '23505') {
    if (confirm('Already saved this link. Update it?')) {
      const { error: upErr } = await supabase
        .from('jobs').update(row).eq('user_id', user.id).eq('link', row.link);
      msg.textContent = upErr ? 'Update failed' : 'Updated ✓';
      if (!upErr) setTimeout(() => window.close(), 700);
    }
    return;
  }

  // Network/other failure: stash so the user's input is not lost.
  await chrome.storage.local.set({ pendingJob: row });
  msg.className = 'error';
  msg.textContent = 'Save failed — kept your input. Retry when online.';
}

async function doLogin(e: Event) {
  e.preventDefault();
  const email = ($('email') as HTMLInputElement).value;
  const password = ($('password') as HTMLInputElement).value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { $('login-error').textContent = error.message; return; }
  await startCapture();
}

async function main() {
  loginForm.addEventListener('submit', doLogin);
  captureForm.addEventListener('submit', save);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { show('login'); return; }
  await startCapture();
}

main();
```

- [ ] **Step 4: Build to verify it compiles**

Run: `cd extension && npm run build`
Expected: `dist/` produced with no TypeScript/Vite errors.

- [ ] **Step 5: Commit**

```bash
git add extension/src/popup.html extension/src/popup.ts extension/src/styles.css
git commit -m "feat(ext): popup capture flow (auth, extract, LLM fill, save, dedup)"
```

### Task 14: Load & end-to-end test

- [ ] **Step 1: 🧑 YOU RUN — create real env file**

```bash
cd extension
cp .env.example .env        # values are already public-safe and correct
npm run build
```

- [ ] **Step 2: 🧑 YOU RUN — load the extension**

Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `extension/dist`.

- [ ] **Step 3: 🧑 YOU RUN — manual E2E**

1. Open a real posting on Greenhouse/Lever/Ashby → click the extension → sign in (your email + password) → confirm company/position/description pre-fill → press Enter → "Saved ✓".
2. Open a Workday posting (thin structured data) → click → confirm the "Asking AI…" path fills fields → save.
3. Re-click a saved posting → confirm the "Already saved — Update?" prompt.
4. In Supabase Studio → Table Editor → `jobs`: confirm rows exist with correct `source_platform`.

Expected: all four behave as described. Note any field that comes out wrong for plan follow-up.

---

## Phase 5 — Dashboard (Next.js)

### Task 15: Scaffold Next.js + Supabase SSR

**Files:**
- Create: dashboard app via generator, then `dashboard/.env.example`, `dashboard/src/lib/supabase/server.ts`, `dashboard/src/lib/supabase/client.ts`, `dashboard/src/middleware.ts`

- [ ] **Step 1: 🧑 YOU RUN — generate the app**

```bash
# from repo root
npx create-next-app@latest dashboard --typescript --app --eslint --no-tailwind --src-dir --import-alias "@/*"
cd dashboard && npm i @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: .env.example**

```bash
# dashboard/.env.example
NEXT_PUBLIC_SUPABASE_URL=https://jcneolycvbspepjcodec.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_-IKt6Nbo_htLjgeU5cwb3A_JCSj2L7f
```

- [ ] **Step 3: server + client supabase helpers**

```ts
// dashboard/src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* called from a Server Component; middleware refreshes instead */ }
        },
      },
    },
  );
}
```

```ts
// dashboard/src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
```

```ts
// dashboard/src/middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  await supabase.auth.getUser(); // refresh session
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/.env.example dashboard/src/lib dashboard/src/middleware.ts
git commit -m "chore(dash): next.js + supabase ssr scaffolding"
```

### Task 16: `groupByWeek` (TDD)

**Files:**
- Create: `dashboard/src/lib/groupByWeek.ts`, `dashboard/src/lib/groupByWeek.test.ts`
- Modify: `dashboard/package.json` (add vitest)

- [ ] **Step 1: 🧑 YOU RUN — add vitest**

```bash
cd dashboard && npm i -D vitest && npm pkg set scripts.test="vitest run"
```

- [ ] **Step 2: Write the failing test**

```ts
// dashboard/src/lib/groupByWeek.test.ts
import { describe, it, expect } from 'vitest';
import { groupByWeek } from './groupByWeek';

describe('groupByWeek', () => {
  it('buckets dates into ISO weeks (Mon start) and counts', () => {
    const out = groupByWeek([
      '2026-06-08T10:00:00Z', // Mon
      '2026-06-10T09:00:00Z', // Wed (same week)
      '2026-06-15T09:00:00Z', // next Mon
    ]);
    expect(out).toEqual([
      { week: '2026-06-08', count: 2 },
      { week: '2026-06-15', count: 1 },
    ]);
  });
  it('returns empty array for no dates', () => {
    expect(groupByWeek([])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd dashboard && npx vitest run src/lib/groupByWeek.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/groupByWeek.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/lib/groupByWeek.* dashboard/package.json
git commit -m "feat(dash): groupByWeek weekly bucketing"
```

### Task 17: Login page

**Files:**
- Create: `dashboard/src/app/login/page.tsx`

- [ ] **Step 1: Implement**

```tsx
// dashboard/src/app/login/page.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); return; }
    router.replace('/');
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 320, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1>Job Tracker</h1>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit">Sign in</button>
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/login/page.tsx && git commit -m "feat(dash): login page"
```

### Task 18: Dashboard page (list + weekly counts)

**Files:**
- Create: `dashboard/src/app/page.tsx`
- Modify: `dashboard/src/app/layout.tsx` (keep generator default; no change required)

- [ ] **Step 1: Implement**

```tsx
// dashboard/src/app/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { groupByWeek } from '@/lib/groupByWeek';
import { deleteJob } from './actions';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: jobs = [] } = await supabase
    .from('jobs')
    .select('id, company, position, link, source_platform, applied_at')
    .order('applied_at', { ascending: false });

  const weeks = groupByWeek((jobs ?? []).map((j) => j.applied_at));
  const max = Math.max(1, ...weeks.map((w) => w.count));

  return (
    <main style={{ maxWidth: 900, margin: '32px auto', fontFamily: 'system-ui' }}>
      <h1>Applications ({jobs?.length ?? 0})</h1>

      <section style={{ margin: '16px 0' }}>
        <h2 style={{ fontSize: 16 }}>Applied per week</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 120 }}>
          {weeks.map((w) => (
            <div key={w.week} style={{ textAlign: 'center' }}>
              <div title={`${w.count}`} style={{
                width: 28, background: '#2563eb',
                height: `${(w.count / max) * 100}px`, borderRadius: 4,
              }} />
              <small>{w.week.slice(5)}</small>
            </div>
          ))}
        </div>
      </section>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
            <th>Company</th><th>Position</th><th>Platform</th><th>Applied</th><th></th>
          </tr>
        </thead>
        <tbody>
          {(jobs ?? []).map((j) => (
            <tr key={j.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{j.company}</td>
              <td><a href={j.link} target="_blank" rel="noreferrer">{j.position}</a></td>
              <td>{j.source_platform}</td>
              <td>{j.applied_at.slice(0, 10)}</td>
              <td>
                <form action={deleteJob}>
                  <input type="hidden" name="id" value={j.id} />
                  <button type="submit">Delete</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/page.tsx && git commit -m "feat(dash): list + weekly bar chart"
```

### Task 19: Delete server action

**Files:**
- Create: `dashboard/src/app/actions.ts`

- [ ] **Step 1: Implement**

```ts
// dashboard/src/app/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function deleteJob(formData: FormData) {
  const id = String(formData.get('id'));
  const supabase = await createClient();
  await supabase.from('jobs').delete().eq('id', id); // RLS guarantees own-row only
  revalidatePath('/');
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/actions.ts && git commit -m "feat(dash): delete job server action"
```

### Task 20: Run & verify the dashboard

- [ ] **Step 1: 🧑 YOU RUN — env + run**

```bash
cd dashboard
cp .env.example .env.local
npm run test          # groupByWeek passes
npm run dev           # http://localhost:3000
```

- [ ] **Step 2: 🧑 YOU RUN — verify**

1. Visit `http://localhost:3000` → redirected to `/login` → sign in.
2. See the rows you saved via the extension, the count, and the weekly bars.
3. Click a position link → opens the posting. Click Delete → row disappears, count drops.

Expected: all pass. (Optional later: `vercel` deploy — set the two `NEXT_PUBLIC_*` env vars in the Vercel project.)

- [ ] **Step 3: 🧑 YOU RUN — push everything**

```bash
git push
```

---

## Self-Review

**Spec coverage check (spec section → task):**
- Extraction chain JSON-LD→OG→selection→LLM→manual → Tasks 6, 7, 8 (client) + 9 (LLM) + 13 (manual form). ✔
- No site-specific parsers (generic readers only) → Tasks 4–8 have zero platform branches; `source_platform` is a stats label (Task 4). ✔
- Data model `jobs` + unique `(user_id, link)` + RLS → Task 1. ✔
- Edge Function holds OpenAI key, requires auth, Structured Outputs, retry-once, stateless → Task 9. ✔
- `gpt-4o-mini` + 12k char cap → Tasks 8 (cap), 9 (model + cap). ✔
- Capture flow: confirm popup, Enter to save, dedup warn→update, don't-lose-work stash → Task 13. ✔
- Supabase Auth email+password, extension session in chrome.storage → Tasks 11, 13; dashboard auth Tasks 15, 17, 18. ✔
- Dashboard: list + applied-per-week + delete → Tasks 16, 18, 19. ✔
- Chrome only; pure applied-log (no status pipeline) → manifest Task 10; schema has no status. ✔
- Testing: extraction unit tests, groupByWeek test, edge-function curl smoke, manual E2E → Tasks 4–8, 16, 9, 14/20. ✔

**Placeholder scan:** No "TBD"/"add error handling"/"similar to" — every code step contains complete code. ✔

**Type consistency:** `JobFields {company,position,description}` and `ExtractionResult` used identically across types.ts, jsonld.ts, meta.ts, extract.ts, content.ts, popup.ts. Edge Function returns the same three fields. `groupByWeek` signature consistent between Tasks 16 and 18. ✔

**Known deferrals (from spec, intentionally not built):** Firefox/Safari, `status` pipeline, `gpt-4.1-nano` A/B, Vercel deploy (optional Task 20 note).
