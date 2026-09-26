import type { ScannedFile } from "./scan.js";

/** How strongly a file references the changed field. */
export type ImpactLevel = "direct" | "indirect" | "none";

/** One classified file in the impact report. */
export interface ImpactEntry {
  file: string;
  level: ImpactLevel;
  /** Matching lines (1-based line number + trimmed text). */
  matches: Array<{ line: number; text: string }>;
}

/** Full report returned by classifyImpact. */
export interface ImpactReport {
  changedField: string;
  scannedFileCount: number;
  directCount: number;
  indirectCount: number;
  impacts: ImpactEntry[];
}

/**
 * Patterns that indicate an *indirect* reference — the file doesn't use the
 * field by name but is structurally coupled (type alias, spread, mapped type,
 * Prisma include, GraphQL fragment spread, SQL wildcard select, etc.).
 */
const INDIRECT_PATTERNS: RegExp[] = [
  // TypeScript: type alias or interface that includes the surrounding type
  /\btype\s+\w+\s*=\s*\w+/,
  // Spread / pick / omit utilities
  /\bPick\b|\bOmit\b|\bPartial\b|\bRequired\b|\bExtends\b/,
  // Object spread
  /\.\.\.\s*\w+/,
  // SQL SELECT *
  /SELECT\s+\*/i,
  // GraphQL fragment spread
  /\.\.\.\w+/,
  // Prisma include / select blocks
  /\binclude\s*:\s*\{|\bselect\s*:\s*\{/,
];

/**
 * Classify every scanned file for references to `changedField`.
 *
 * A file is **direct** when `changedField` appears as a whole word (property
 * access, key literal, column name, etc.).
 *
 * A file is **indirect** when it doesn't mention the field by name but
 * contains a pattern that structurally couples it to the parent schema
 * (wildcard select, spread operator, type alias of the parent type, etc.).
 */
export function classifyImpact(
  files: ScannedFile[],
  changedField: string
): ImpactReport {
  // Build a word-boundary regex for the exact field name.
  const escaped = changedField.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const directPattern = new RegExp(`\\b${escaped}\\b`);

  const impacts: ImpactEntry[] = [];
  let directCount = 0;
  let indirectCount = 0;

  for (const file of files) {
    const lines = file.content.split("\n");
    const directMatches: ImpactEntry["matches"] = [];

    for (let i = 0; i < lines.length; i++) {
      if (directPattern.test(lines[i])) {
        directMatches.push({ line: i + 1, text: lines[i].trim() });
      }
    }

    if (directMatches.length > 0) {
      directCount++;
      impacts.push({ file: file.path, level: "direct", matches: directMatches });
      continue;
    }

    // Check for indirect patterns only if there were no direct hits.
    const indirectMatches: ImpactEntry["matches"] = [];
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of INDIRECT_PATTERNS) {
        if (pattern.test(lines[i])) {
          indirectMatches.push({ line: i + 1, text: lines[i].trim() });
          break; // one indirect hit per line is enough
        }
      }
    }

    if (indirectMatches.length > 0) {
      indirectCount++;
      impacts.push({
        file: file.path,
        level: "indirect",
        matches: indirectMatches,
      });
    }
    // Files with no matches are simply omitted from the report.
  }

  return {
    changedField,
    scannedFileCount: files.length,
    directCount,
    indirectCount,
    impacts,
  };
}
