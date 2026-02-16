import * as vscode from "vscode";
import { scanCalls } from "../parser/callScanner";
import { splitParams } from "../parser/tokenizer";

function stableKey(assignedVar: string | undefined, params: string[]): string | undefined {
  if (params.length < 1) return undefined;
  const first = params[0].trim();
  if (first === "#PB_Any") {
    return assignedVar ?? "#PB_Any";
  }
  return first;
}

export function applyMovePatch(document: vscode.TextDocument, gadgetKey: string, x: number, y: number): vscode.WorkspaceEdit | undefined {
  const text = document.getText();
  const calls = scanCalls(text);

  const call = calls.find(c => {
    const params = splitParams(c.args);
    const key = stableKey(c.assignedVar, params);
    return key === gadgetKey;
  });

  if (!call) return undefined;

  const params = splitParams(call.args);
  if (params.length < 3) return undefined;

  params[1] = String(Math.trunc(x));
  params[2] = String(Math.trunc(y));

  const rebuilt = `${call.name}(${params.join(", ")})`;
  const updated = call.assignedVar ? `${call.indent ?? ""}${call.assignedVar} = ${rebuilt}` : rebuilt;

  const replaceStart = call.assignedVar ? call.range.lineStart : call.range.start;

  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(document.positionAt(replaceStart), document.positionAt(call.range.end)),
    updated
  );

  return edit;
}
