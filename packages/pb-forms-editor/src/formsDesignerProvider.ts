import * as vscode from "vscode";
import { parseFormDocument } from "./core/parser/formParser";
import { applyMovePatch } from "./core/emitter/patchEmitter";

type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "moveGadget"; id: string; x: number; y: number };

type ExtensionToWebviewMessage =
  | { type: "init"; model: any }
  | { type: "error"; message: string };

export class PureBasicFormDesignerProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "purebasic.formDesigner";

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewPanel.webview.html = this.getWebviewHtml(webviewPanel.webview);

    const post = (msg: ExtensionToWebviewMessage) => webviewPanel.webview.postMessage(msg);

    const sendInit = () => {
      try {
        const model = parseFormDocument(document.getText());
        post({ type: "init", model });
      } catch (e: any) {
        post({ type: "error", message: e?.message ?? String(e) });
      }
    };

    sendInit();

    const docSub = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) sendInit();
    });

    webviewPanel.onDidDispose(() => docSub.dispose());

    webviewPanel.webview.onDidReceiveMessage(async (msg: WebviewToExtensionMessage) => {
      if (msg.type === "ready") return sendInit();

      if (msg.type === "moveGadget") {
        const edit = applyMovePatch(document, msg.id, msg.x, msg.y);
        if (!edit) return post({ type: "error", message: `Could not patch gadget ${msg.id}.` });
        await vscode.workspace.applyEdit(edit);
      }
    });
  }

  private getWebviewHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "main.js"));
    const nonce = getNonce();

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PureBasic Form Designer</title>
    <style>
      body { margin: 0; padding: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
      .root { display: grid; grid-template-columns: 1fr 320px; height: 100vh; }
      .canvasWrap { position: relative; overflow: hidden; }
      canvas { width: 100%; height: 100%; display: block; }
      .panel { border-left: 1px solid rgba(127,127,127,.25); padding: 10px; overflow: auto; }
      .row { display: grid; grid-template-columns: 90px 1fr; gap: 8px; margin-bottom: 8px; align-items: center; }
      input { width: 100%; }
      .list { margin-top: 12px; }
      .item { padding: 6px 8px; border-radius: 8px; cursor: pointer; }
      .item:hover { background: rgba(127,127,127,.15); }
      .item.sel { background: rgba(127,127,127,.25); }
      .muted { opacity: .75; font-size: 12px; }
      .err { color: #b00020; font-size: 12px; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <div class="root">
      <div class="canvasWrap"><canvas id="designer"></canvas></div>
      <div class="panel">
        <div><b>Properties</b></div>
        <div class="muted">Drag gadgets. This MVP patches x/y only.</div>
        <div id="props"></div>
        <div class="list">
          <div><b>Hierarchy</b></div>
          <div id="list"></div>
        </div>
        <div id="err" class="err"></div>
      </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
