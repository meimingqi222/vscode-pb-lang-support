import * as fs from 'fs';
import * as path from 'path';

export function uriToFsPath(uri: string): string {
  if (uri.startsWith('file://')) {
    // Remove file:// and decode
    let p = decodeURIComponent(uri.replace('file://', ''));
    // On Windows, leading slash may appear like /c:/...
    if (process.platform === 'win32' && p.startsWith('/')) {
      p = p.slice(1);
    }
    return p;
  }
  return uri;
}

export function fsPathToUri(p: string): string {
  let resolved = path.resolve(p);
  if (process.platform === 'win32') {
    // Ensure drive letter is uppercase and slashes are encoded
    resolved = resolved.replace(/\\/g, '/');
    if (!resolved.startsWith('/')) {
      resolved = '/' + resolved;
    }
  }
  return 'file://' + encodeURI(resolved);
}

export function readFileIfExistsSync(filePath: string): string | null {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch {}
  return null;
}

/**
 * Validates that a resolved path doesn't escape outside allowed directories
 */
function isPathAllowed(resolvedPath: string, allowedRoots: string[]): boolean {
  const normalizedPath = path.normalize(resolvedPath);
  for (const root of allowedRoots) {
    const normalizedRoot = path.normalize(root);
    if (normalizedPath.startsWith(normalizedRoot)) {
      return true;
    }
  }
  return false;
}

export function resolveIncludePath(
  fromDocumentUri: string,
  includeRelPath: string,
  includeDirs: string[] = [],
  workspaceRoot?: string
): string | null {
  const fromFs = uriToFsPath(fromDocumentUri);
  const fromDir = path.dirname(fromFs);

  // Build allowed root directories for path traversal protection
  const allowedRoots: string[] = [fromDir];
  if (workspaceRoot) {
    allowedRoots.push(workspaceRoot);
  }
  for (const dir of includeDirs) {
    if (dir) allowedRoots.push(path.normalize(dir));
  }

  const candList: string[] = [];

  // Absolute include provided - validate against allowed roots
  if (path.isAbsolute(includeRelPath)) {
    const resolved = path.resolve(includeRelPath);
    if (isPathAllowed(resolved, allowedRoots)) {
      candList.push(resolved);
    }
  }

  // Search using provided IncludePath directories (most recent first)
  for (const dir of includeDirs) {
    if (!dir) continue;
    const resolved = path.resolve(dir, includeRelPath);
    if (isPathAllowed(resolved, allowedRoots)) {
      candList.push(resolved);
    }
  }

  // Relative to current document directory - validate to prevent traversal
  const relativeResolved = path.resolve(fromDir, includeRelPath);
  // Allow paths within workspaceRoot (if provided) or fromDir
  const isAllowed = workspaceRoot
    ? isPathAllowed(relativeResolved, [workspaceRoot])
    : isPathAllowed(relativeResolved, [fromDir]);
  if (isAllowed) {
    candList.push(relativeResolved);
  }

  // As-is relative to CWD (rare in LSP), keep last - only if in allowed roots
  const cwdResolved = path.resolve(includeRelPath);
  if (isPathAllowed(cwdResolved, allowedRoots)) {
    candList.push(cwdResolved);
  }

  for (const cand of candList) {
    try {
      if (fs.existsSync(cand)) return cand;
    } catch {}
  }
  return null;
}

export function normalizeDirPath(baseUri: string, dir: string): string {
  const baseFs = uriToFsPath(baseUri);
  const baseDir = path.dirname(baseFs);
  return path.isAbsolute(dir) ? path.resolve(dir) : path.resolve(baseDir, dir);
}
