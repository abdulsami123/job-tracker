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
