import * as vscode from "vscode";
import { PureBasicFormDesignerProvider } from "./formsDesignerProvider";

export function activate(context: vscode.ExtensionContext) {
  const provider = new PureBasicFormDesignerProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      PureBasicFormDesignerProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("purebasic.formDesigner.openAsText", async (uri?: vscode.Uri) => {
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!targetUri) return;

      const viewColumn = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Active;

      // Best effort: replace custom editor tab with text editor
      try {
        await vscode.commands.executeCommand("workbench.action.reopenTextEditor", targetUri);
        if (vscode.window.activeTextEditor?.document.uri.toString() === targetUri.toString()) {
          return;
        }
      } catch {
        // fall through to explicit open
      }

      // Fallback: force text editor explicitly
      const doc = await vscode.workspace.openTextDocument(targetUri);
      await vscode.window.showTextDocument(doc, { viewColumn, preview: false });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("purebasic.formDesigner.openInDesigner", async (uri?: vscode.Uri) => {
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!targetUri) return;

      const viewColumn = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Active;
      await vscode.commands.executeCommand("vscode.openWith", targetUri, "purebasic.formDesigner", viewColumn);
    })
  );
}

export function deactivate() {}
