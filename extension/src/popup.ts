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
