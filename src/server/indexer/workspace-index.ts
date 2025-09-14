import * as fs from 'fs';
import * as path from 'path';
import { uriToFsPath } from '../utils/fs-utils';

// 简易工作区文件索引，仅维护 .pb/.pbi 文件列表（缓存）

let roots: string[] = [];
let cachedFiles: string[] = [];
let lastBuild = 0;

const MAX_FILES = 1000; // 防止扫描过多文件
const REBUILD_INTERVAL_MS = 5000; // 最小重建间隔

export function setWorkspaceRoots(uris: string[]) {
  roots = uris.map(uriToFsPath).filter(Boolean);
  // 强制触发重建
  lastBuild = 0;
}

export function getWorkspaceFiles(): string[] {
  const now = Date.now();
  if (now - lastBuild > REBUILD_INTERVAL_MS) {
    try {
      cachedFiles = buildFileList(roots);
    } catch {}
    lastBuild = now;
  }
  return cachedFiles;
}

function buildFileList(rootPaths: string[]): string[] {
  const files: string[] = [];
  const seen = new Set<string>();
  for (const root of rootPaths) {
    try {
      walk(root, files, seen);
      if (files.length >= MAX_FILES) break;
    } catch {}
  }
  return files.slice(0, MAX_FILES);
}

function walk(dir: string, out: string[], seen: Set<string>) {
  if (!dir || seen.has(dir)) return;
  seen.add(dir);
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith('.')) continue; // 跳过隐藏目录
      walk(p, out, seen);
      if (out.length >= MAX_FILES) return;
    } else if (e.isFile()) {
      if (p.endsWith('.pb') || p.endsWith('.pbi')) {
        out.push(p);
        if (out.length >= MAX_FILES) return;
      }
    }
  }
}

