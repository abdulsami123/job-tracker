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
