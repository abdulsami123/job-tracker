// dashboard/src/components/ThemeToggle.tsx
'use client';
import { useEffect, useState } from 'react';
import styles from './ThemeToggle.module.css';

type Theme = 'light' | 'dark';
const KEY = 'jobtracker-theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const stored = localStorage.getItem(KEY) as Theme | null;
    const initial: Theme = stored ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  function toggle() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(KEY, next);
  }

  return (
    <button type="button" className={styles.toggle} onClick={toggle} title="Toggle theme" aria-label="Toggle theme">
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
