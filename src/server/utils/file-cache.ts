import * as fs from 'fs';

type CacheEntry = {
  mtimeMs: number;
  content: string;
};

const fileCache = new Map<string, CacheEntry>();

export function readFileCached(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    const mtimeMs = stat.mtimeMs;
    const cached = fileCache.get(filePath);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.content;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    fileCache.set(filePath, { mtimeMs, content });
    return content;
  } catch {
    return null;
  }
}

export function clearFileCache() {
  fileCache.clear();
}

