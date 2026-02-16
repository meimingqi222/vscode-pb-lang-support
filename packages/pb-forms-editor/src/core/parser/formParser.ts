import { FormDocument, Gadget, GadgetKind } from "../model";
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
  const doc: FormDocument = { gadgets: [] };

  const calls = scanCalls(text);
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
