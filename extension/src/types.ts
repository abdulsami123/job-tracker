// extension/src/types.ts
export interface JobFields {
  company: string;
  position: string;
  description: string;
}

export interface ExtractionResult {
  fields: JobFields;        // best-effort client-side fill (may have empty strings)
  pageText: string;         // trimmed visible text for the LLM fallback
  url: string;
  sourcePlatform: string;   // label from URL host — stats only
  needsLlm: boolean;        // true when company or position is still empty
}
