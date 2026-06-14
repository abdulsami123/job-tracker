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
