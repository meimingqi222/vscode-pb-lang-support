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

export function resolveIncludePath(
  fromDocumentUri: string,
  includeRelPath: string,
  includeDirs: string[] = []
): string | null {
  const fromFs = uriToFsPath(fromDocumentUri);
  const fromDir = path.dirname(fromFs);

  const candList: string[] = [];

  // Absolute include provided
  if (path.isAbsolute(includeRelPath)) {
    candList.push(includeRelPath);
  }

  // Search using provided IncludePath directories (most recent first)
  for (const dir of includeDirs) {
    if (!dir) continue;
    candList.push(path.resolve(dir, includeRelPath));
  }

  // Relative to current document directory
  candList.push(path.resolve(fromDir, includeRelPath));

  // As-is relative to CWD (rare in LSP), keep last
  candList.push(path.resolve(includeRelPath));

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
