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
    vscode.commands.registerCommand("purebasic.formDesigner.openAsText", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await vscode.commands.executeCommand("vscode.openWith", editor.document.uri, "default", editor.viewColumn);
    })
  );
}

export function deactivate() {}
