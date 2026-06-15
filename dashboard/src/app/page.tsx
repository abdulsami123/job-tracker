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
