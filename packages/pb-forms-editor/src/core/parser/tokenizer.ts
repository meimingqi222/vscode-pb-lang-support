export function splitParams(paramList: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inStr = false;
  let depth = 0;

  for (let i = 0; i < paramList.length; i++) {
    const ch = paramList[i];

    if (inStr) {
      cur += ch;
      // PureBasic string escaping: "" inside string
      if (ch === '"' && paramList[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inStr = false;
      }
      continue;
    }

    if (ch === '"') {
      inStr = true;
      cur += ch;
      continue;
    }

    if (ch === "(") { depth++; cur += ch; continue; }
    if (ch === ")") { depth = Math.max(0, depth - 1); cur += ch; continue; }

    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }

    cur += ch;
  }

  if (cur.trim().length > 0) out.push(cur.trim());
  return out;
}

export function unquoteString(s: string): string | undefined {
  const t = s.trim();
  const u = t.startsWith('~"') ? t.slice(1) : t;

  if (u.length >= 2 && u.startsWith('"') && u.endsWith('"')) {
    const raw = u.slice(1, -1);
    return raw.replace(/""/g, '"');
  }
  return undefined;
}

export function asNumber(s: string): number | undefined {
  const t = s.trim();
  if (!/^-?\d+$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
