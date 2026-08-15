import { readdir } from "node:fs/promises";
import { join } from "node:path";

export const IGNORED_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "out", "coverage"]);

export async function collectFiles(
  dir: string,
  isScannable: (filePath: string) => boolean
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      files.push(...(await collectFiles(fullPath, isScannable)));
    } else if (entry.isFile() && isScannable(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}
