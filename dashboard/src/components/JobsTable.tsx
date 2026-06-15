// dashboard/src/components/JobsTable.tsx
'use client';
import { useMemo, useState } from 'react';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, flexRender,
  createColumnHelper, type SortingState, type ColumnDef,
} from '@tanstack/react-table';
import type { Job } from '@/lib/types';
import { deleteJob } from '@/app/actions';
import styles from './JobsTable.module.css';

const ch = createColumnHelper<Job>();

export default function JobsTable({ rows, onRowClick }: { rows: Job[]; onRowClick: (job: Job) => void }) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<Job, unknown>[]>(() => [
    ch.accessor('company', { header: 'Company', cell: (i) => i.getValue() }) as ColumnDef<Job, unknown>,
    ch.accessor('position', {
      header: 'Position',
      cell: (i) => (
        <a href={i.row.original.link} target="_blank" rel="noreferrer" className={styles.link} onClick={(e) => e.stopPropagation()}>
          {i.getValue()}
        </a>
      ),
    }) as ColumnDef<Job, unknown>,
    ch.accessor('source_platform', { header: 'Platform', cell: (i) => <span className={styles.badge}>{i.getValue()}</span> }) as ColumnDef<Job, unknown>,
    ch.accessor('applied_at', { header: 'Applied', cell: (i) => String(i.getValue()).slice(0, 10) }) as ColumnDef<Job, unknown>,
    ch.display({
      id: 'actions', header: '',
      cell: (i) => (
        <form action={deleteJob} onClick={(e) => e.stopPropagation()}>
          <input type="hidden" name="id" value={i.row.original.id} />
          <button type="submit" className={styles.del}>Delete</button>
        </form>
      ),
    }),
  ], []);

  const table = useReactTable({
    data: rows, columns, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  if (rows.length === 0) return <p className={styles.empty}>No applications match.</p>;

  return (
    <table className={styles.table}>
      <thead>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id}>
            {hg.headers.map((h) => (
              <th key={h.id} className={styles.th}
                onClick={h.column.getToggleSortingHandler()}
                style={{ cursor: h.column.getCanSort() ? 'pointer' : 'default' }}>
                {flexRender(h.column.columnDef.header, h.getContext())}
                {({ asc: ' ▲', desc: ' ▼' } as Record<string, string>)[h.column.getIsSorted() as string] ?? ''}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} className={styles.row} onClick={() => onRowClick(row.original)}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} className={styles.td}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
