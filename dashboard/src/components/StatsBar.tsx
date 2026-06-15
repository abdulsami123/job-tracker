// dashboard/src/components/StatsBar.tsx
import { groupByWeek } from '@/lib/groupByWeek';
import { countThisWeek } from '@/lib/stats';
import type { Job } from '@/lib/types';
import styles from './StatsBar.module.css';

export default function StatsBar({ jobs }: { jobs: Job[] }) {
  const weeks = groupByWeek(jobs.map((j) => j.applied_at));
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const thisWeek = countThisWeek(jobs, new Date());

  return (
    <div className={styles.bar}>
      <div className={styles.stat}><span className={styles.num}>{jobs.length}</span><span className={styles.label}>total</span></div>
      <div className={styles.stat}><span className={styles.num}>{thisWeek}</span><span className={styles.label}>this week</span></div>
      <div className={styles.chart}>
        {weeks.map((w) => (
          <div key={w.week} className={styles.barCol} title={`${w.week}: ${w.count}`}>
            <div className={styles.barFill} style={{ height: `${(w.count / max) * 100}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
