import * as fs from 'fs';

type CacheEntry = {
  mtimeMs: number;
  content: string;
  lastAccess: number; // 最后访问时间戳
};

const MAX_CACHE_SIZE = 100; // 最大缓存文件数
const fileCache = new Map<string, CacheEntry>();

/**
 * 清理最旧的缓存条目
 */
function evictOldestIfNeeded(): void {
  if (fileCache.size < MAX_CACHE_SIZE) {
    return;
  }

  // 找到最旧的条目
  let oldestKey: string | null = null;
  let oldestTime = Infinity;

  for (const [key, entry] of fileCache.entries()) {
    if (entry.lastAccess < oldestTime) {
      oldestTime = entry.lastAccess;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    fileCache.delete(oldestKey);
  }
}

export function readFileCached(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    const mtimeMs = stat.mtimeMs;
    const cached = fileCache.get(filePath);
    const now = Date.now();

    if (cached && cached.mtimeMs === mtimeMs) {
      // 更新访问时间
      cached.lastAccess = now;
      return cached.content;
    }

    // 清理旧缓存
    evictOldestIfNeeded();

    const content = fs.readFileSync(filePath, 'utf8');
    fileCache.set(filePath, { mtimeMs, content, lastAccess: now });
    return content;
  } catch (err) {
    // 记录错误但不抛出
    console.error(`[file-cache] Failed to read ${filePath}:`, err);
    return null;
  }
}

export function clearFileCache() {
  fileCache.clear();
}

export function getFileCacheSize(): number {
  return fileCache.size;
}

