import { FormDocument, FormIssue, FormMeta, Gadget, GadgetKind, ScanRange } from "../model";
import { splitParams, unquoteString, asNumber } from "./tokenizer";
import { scanCalls } from "./callScanner";

const GADGET_KINDS: Record<string, GadgetKind> = {
  ButtonGadget: "ButtonGadget",
  ButtonImageGadget: "ButtonImageGadget",
  StringGadget: "StringGadget",
  TextGadget: "TextGadget",
  CheckBoxGadget: "CheckBoxGadget",
  OptionGadget: "OptionGadget",
  FrameGadget: "FrameGadget",
  ComboBoxGadget: "ComboBoxGadget",
  ListViewGadget: "ListViewGadget",
  ListIconGadget: "ListIconGadget",
  TreeGadget: "TreeGadget",
  EditorGadget: "EditorGadget",
  SpinGadget: "SpinGadget",
  TrackBarGadget: "TrackBarGadget",
  ProgressBarGadget: "ProgressBarGadget",
  ImageGadget: "ImageGadget",
  HyperLinkGadget: "HyperLinkGadget",
  CalendarGadget: "CalendarGadget",
  DateGadget: "DateGadget",
  ContainerGadget: "ContainerGadget",
  PanelGadget: "PanelGadget",
  ScrollAreaGadget: "ScrollAreaGadget",
  SplitterGadget: "SplitterGadget",
  WebViewGadget: "WebViewGadget",
  WebGadget: "WebGadget",
  OpenGLGadget: "OpenGLGadget",
  CanvasGadget: "CanvasGadget",
  ExplorerTreeGadget: "ExplorerTreeGadget",
  ExplorerListGadget: "ExplorerListGadget",
  ExplorerComboGadget: "ExplorerComboGadget",
  IPAddressGadget: "IPAddressGadget",
  ScrollBarGadget: "ScrollBarGadget",
  ScintillaGadget: "ScintillaGadget"
};

export function parseFormDocument(text: string): FormDocument {
  const issues: FormIssue[] = [];

  const header = parseFormHeader(text);
  if (!header) {
    issues.push({
      severity: "warning",
      message: "Missing Form Designer header ('; Form Designer for PureBasic - x.xx').",
      line: 0
    });
  } else if (!header.hasStrictSyntaxWarning) {
    issues.push({
      severity: "info",
      message: "Strict syntax warning line not found. The PureBasic IDE usually writes it as the second header comment.",
      line: header.line
    });
  }

  const scanRange = detectFormScanRange(text, header?.line);

  const meta: FormMeta = {
    header: header ?? undefined,
    scanRange,
    issues
  };

  const doc: FormDocument = { gadgets: [], meta };

  const calls = scanCalls(text, scanRange);
  for (const c of calls) {
    if (c.name === "OpenWindow") {
      const win = parseOpenWindow(c.assignedVar, c.args);
      if (win) doc.window = win;
      continue;
    }

    const kind = GADGET_KINDS[c.name];
    if (!kind) continue;

    const gadget = parseGadgetCall(kind, c.assignedVar, c.args, c.range);
    if (gadget) doc.gadgets.push(gadget);
  }

  return doc;
}

function parseFormHeader(text: string): { version?: string; line: number; hasStrictSyntaxWarning: boolean } | null {
  const headerRe = /^;\s*Form\s+Designer\s+for\s+PureBasic\s*-\s*([0-9]+(?:\.[0-9]+)*)\s*$/im;
  const m = headerRe.exec(text);
  if (!m || m.index === undefined) return null;

  const line = indexToLine(text, m.index);
  const version = m[1];

  // The next line in PureBasic output is typically the strict syntax warning.
  const lines = text.split(/\r?\n/);
  const nextLine = lines[line + 1] ?? "";
  const hasStrictSyntaxWarning = /strict\s+syntax/i.test(nextLine) && /Form\s+Designer/i.test(nextLine);

  return { version, line, hasStrictSyntaxWarning };
}

function detectFormScanRange(text: string, headerLine: number | undefined): ScanRange {
  let start = 0;
  if (typeof headerLine === "number" && headerLine >= 0) {
    start = lineToIndex(text, headerLine);
  }

  const ideOptionsRe = /^;\s*IDE\s+Options\b.*$/im;
  const m = ideOptionsRe.exec(text);
  const end = m?.index ?? text.length;

  return { start, end };
}

function indexToLine(text: string, idx: number): number {
  let line = 0;
  for (let i = 0; i < idx && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

function lineToIndex(text: string, targetLine: number): number {
  let line = 0;
  let i = 0;
  if (targetLine <= 0) return 0;
  while (i < text.length) {
    if (text[i] === "\n") {
      line++;
      if (line === targetLine) return i + 1;
    }
    i++;
  }
  return text.length;
}

function parseOpenWindow(assignedVar: string | undefined, args: string) {
  const p = splitParams(args);
  // OpenWindow(id, x, y, w, h, "title", flags)
  if (p.length < 6) return undefined;

  const firstParam = (p[0] ?? "").trim();
  const pbAny = firstParam === "#PB_Any";
  const id = pbAny ? (assignedVar ?? "#PB_Any") : firstParam;

  const x = asNumber(p[1] ?? "0") ?? 0;
  const y = asNumber(p[2] ?? "0") ?? 0;
  const w = asNumber(p[3] ?? "0") ?? 0;
  const h = asNumber(p[4] ?? "0") ?? 0;

  const title = unquoteString(p[5] ?? "");
  const flagsExpr = p[6]?.trim();

  return { id, pbAny, assignedVar, firstParam, x, y, w, h, title, flagsExpr };
}

function parseGadgetCall(kind: GadgetKind, assignedVar: string | undefined, args: string, range: any): Gadget | undefined {
  const p = splitParams(args);
  if (p.length < 5) return undefined;

  const firstParam = (p[0] ?? "").trim();
  const pbAny = firstParam === "#PB_Any";
  const id = pbAny ? (assignedVar ?? "#PB_Any") : firstParam;

  const x = asNumber(p[1] ?? "") ?? 0;
  const y = asNumber(p[2] ?? "") ?? 0;
  const w = asNumber(p[3] ?? "") ?? 0;
  const h = asNumber(p[4] ?? "") ?? 0;

  const text = unquoteString(p[5] ?? "");
  const flagsExpr = p[6]?.trim();

  return { id, kind, pbAny, assignedVar, firstParam, x, y, w, h, text, flagsExpr, source: range };
}
