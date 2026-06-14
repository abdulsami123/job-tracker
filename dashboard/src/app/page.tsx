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
