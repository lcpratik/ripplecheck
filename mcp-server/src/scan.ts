import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

/** A single file collected from the target directory. */
export interface ScannedFile {
  /** Absolute path to the file. */
  path: string;
  /** Raw UTF-8 content of the file. */
  content: string;
}

/** Extensions we care about for schema-impact analysis. */
const RELEVANT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".sql",
  ".graphql",
  ".gql",
  ".prisma",
]);

/**
 * Recursively walks `rootDir` and returns every file whose extension
 * is in RELEVANT_EXTENSIONS.  Skips node_modules and .git folders.
 */
export async function scanDirectory(rootDir: string): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      // If we can't read a directory, skip it silently.
      return;
    }

    for (const entry of entries) {
      // Skip noise directories that are never relevant.
      if (entry === "node_modules" || entry === ".git" || entry === "dist") {
        continue;
      }

      const fullPath = join(dir, entry);
      let info;
      try {
        info = await stat(fullPath);
      } catch {
        continue;
      }

      if (info.isDirectory()) {
        await walk(fullPath);
      } else if (RELEVANT_EXTENSIONS.has(extname(entry).toLowerCase())) {
        try {
          const content = await readFile(fullPath, "utf-8");
          results.push({ path: fullPath, content });
        } catch {
          // Unreadable file — skip.
        }
      }
    }
  }

  await walk(rootDir);
  return results;
}
