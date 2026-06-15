// dashboard/src/lib/types.ts
export interface Job {
  id: string;
  company: string;
  position: string;
  link: string;
  description: string | null;
  source_platform: string;
  applied_at: string; // ISO timestamp
}
