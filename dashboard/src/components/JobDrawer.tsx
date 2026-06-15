// dashboard/src/components/JobDrawer.tsx
'use client';
import { useEffect } from 'react';
import type { Job } from '@/lib/types';
import styles from './JobDrawer.module.css';

export default function JobDrawer({ job, onClose }: { job: Job | null; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    if (job) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [job, onClose]);

  if (!job) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <aside className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
        <h2 className={styles.company}>{job.company}</h2>
        <a className={styles.position} href={job.link} target="_blank" rel="noreferrer">{job.position}</a>
        <div className={styles.meta}>
          <span className={styles.badge}>{job.source_platform}</span>
          <span className={styles.date}>Applied {job.applied_at.slice(0, 10)}</span>
        </div>
        <div className={styles.description}>
          {job.description ? job.description : <em className={styles.muted}>No description captured.</em>}
        </div>
      </aside>
    </div>
  );
}
