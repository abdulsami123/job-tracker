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
