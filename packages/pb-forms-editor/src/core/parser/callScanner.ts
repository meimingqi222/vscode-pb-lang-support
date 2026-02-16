import { SourceRange } from "../model";

export interface PbCall {
  name: string;
  args: string;
  range: SourceRange;
  assignedVar?: string;
  indent?: string;
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdent(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

export function scanCalls(text: string): PbCall[] {
  const calls: PbCall[] = [];

  let i = 0;
  let line = 0;
  let lineStart = 0;

  let inStr = false;
  let inComment = false;

  while (i < text.length) {
    const ch = text[i];

    if (ch === "\n") {
      line++;
      i++;
      lineStart = i;
      inComment = false;
      continue;
    }

    if (inComment) { i++; continue; }

    if (inStr) {
      if (ch === '"' && text[i + 1] === '"') { i += 2; continue; }
      if (ch === '"') inStr = false;
      i++;
      continue;
    }

    if (ch === ';') { inComment = true; i++; continue; }
    if (ch === '"') { inStr = true; i++; continue; }

    if (isIdentStart(ch)) {
      const start = i;
      let j = i + 1;
      while (j < text.length && isIdent(text[j])) j++;
      const name = text.slice(start, j);

      let k = j;
      while (k < text.length && /\s/.test(text[k]) && text[k] !== "\n") k++;

      if (text[k] === '(') {
        // Parse balanced parens with string/comment awareness inside call
        const argsStart = k + 1;
        let depth = 1;
        let p = k + 1;
        let localInStr = false;
        let localInComment = false;

        while (p < text.length) {
          const c2 = text[p];

          if (c2 === "\n") {
            localInComment = false;
            p++;
            continue;
          }

          if (localInComment) { p++; continue; }

          if (localInStr) {
            if (c2 === '"' && text[p + 1] === '"') { p += 2; continue; }
            if (c2 === '"') localInStr = false;
            p++;
            continue;
          }

          if (c2 === ';') { localInComment = true; p++; continue; }
          if (c2 === '"') { localInStr = true; p++; continue; }

          if (c2 === '(') depth++;
          else if (c2 === ')') {
            depth--;
            if (depth === 0) {
              const argsEnd = p;
              const fullEnd = p + 1;

              // Detect "Var = Name(" pattern on the same line (Form Designer output).
              const prefix = text.slice(lineStart, start);
              const m = /^(\s*)([A-Za-z_]\w*)\s*=\s*$/.exec(prefix);
              const indent = m?.[1];
              const assignedVar = m?.[2];

              calls.push({
                name,
                args: text.slice(argsStart, argsEnd),
                range: { start, end: fullEnd, line, lineStart },
                assignedVar,
                indent
              });

              i = fullEnd;
              break;
            }
          }

          p++;
        }

        continue;
      }
    }

    i++;
  }

  return calls;
}
