import * as vscode from "vscode";
import { parseFormDocument } from "./core/parser/formParser";
import { applyMovePatch, applyRectPatch, applyWindowRectPatch } from "./core/emitter/patchEmitter";
import { readDesignerSettings, SETTINGS_SECTION, DesignerSettings } from "./settings";
import { FormDocument } from "./core/model";

type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "moveGadget"; id: string; x: number; y: number }
  | { type: "setGadgetRect"; id: string; x: number; y: number; w: number; h: number }
  | { type: "setWindowRect"; id: string; x: number; y: number; w: number; h: number };

type ExtensionToWebviewMessage =
  | { type: "init"; model: any; settings: DesignerSettings }
  | { type: "settings"; settings: DesignerSettings }
  | { type: "error"; message: string };

export class PureBasicFormDesignerProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "purebasic.formDesigner";

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewPanel.webview.html = this.getWebviewHtml(webviewPanel.webview);

    const post = (msg: ExtensionToWebviewMessage) => webviewPanel.webview.postMessage(msg);

    let lastModel: FormDocument | undefined;
    let initTimer: ReturnType<typeof setTimeout> | undefined;

    function safeParse(text: string): FormDocument {
      try {
        return parseFormDocument(text);
      } catch (e: any) {
        return {
          gadgets: [],
          meta: {
            scanRange: { start: 0, end: text.length },
            issues: [{ severity: "error", message: e?.message ?? String(e) }]
          }
        };
      }
    }

    const scheduleInit = () => {
      if (initTimer) clearTimeout(initTimer);
      initTimer = setTimeout(() => sendInit(), 200);
    };

    const sendInit = () => {
      try {
        const model = safeParse(document.getText());
        lastModel = model;

        // Optional: warn if the header PB version differs from the configured expectation.
        const expectedPbVersion = vscode.workspace
          .getConfiguration(SETTINGS_SECTION)
          .get<string>("expectedPbVersion", "")
          .trim();

        if (expectedPbVersion.length) {
          const actual = model.meta.header?.version;
          if (!actual) {
            model.meta.issues.push({
              severity: "warning",
              message: `Expected PureBasic version '${expectedPbVersion}', but the Form Designer header has no version.`
            });
          } else if (actual !== expectedPbVersion) {
            model.meta.issues.push({
              severity: "warning",
              message: `Form header version is '${actual}', but 'purebasicFormsDesigner.expectedPbVersion' is set to '${expectedPbVersion}'.`,
              line: model.meta.header?.line
            });
          }
        }

        const settings = readDesignerSettings();
        post({ type: "init", model, settings });
      } catch (e: any) {
        // Keep the webview alive with a minimal model and a structured error.
        const model: FormDocument = {
          gadgets: [],
          meta: {
            scanRange: { start: 0, end: document.getText().length },
            issues: [{ severity: "error", message: e?.message ?? String(e) }]
          }
        };
        lastModel = model;
        post({ type: "init", model, settings: readDesignerSettings() });
      }
    };

    const sendSettings = () => {
      post({ type: "settings", settings: readDesignerSettings() });
    };

    sendInit();

    const cfgSub = vscode.workspace.onDidChangeConfiguration((e: any) => {
      if (e.affectsConfiguration(SETTINGS_SECTION)) {
        post({ type: "settings", settings: readDesignerSettings() });
      }
    });

    const docSub = vscode.workspace.onDidChangeTextDocument((e: any) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        scheduleInit();
      }
    });

    webviewPanel.onDidDispose(() => {
      cfgSub.dispose();
      docSub.dispose();
      if (initTimer) clearTimeout(initTimer);
    });

    webviewPanel.webview.onDidReceiveMessage(async (msg: WebviewToExtensionMessage) => {
      if (msg.type === "ready") {
        sendInit();
        return;
      }

      if (msg.type === "moveGadget") {
        const edit = applyMovePatch(document, msg.id, msg.x, msg.y, lastModel?.meta.scanRange);
        if (!edit) {
          const sr = lastModel?.meta.scanRange;
          const rangeInfo = sr ? ` (scanRange: ${sr.start}-${sr.end})` : "";
          post({
            type: "error",
            message: `Could not patch gadget '${msg.id}'. No matching call found${rangeInfo}.`
          });
          return;
        }
        await vscode.workspace.applyEdit(edit);
      }


      if (msg.type === "setGadgetRect") {
        const edit = applyRectPatch(document, msg.id, msg.x, msg.y, msg.w, msg.h, lastModel?.meta.scanRange);
        if (!edit) {
          const sr = lastModel?.meta.scanRange;
          const rangeInfo = sr ? ` (scanRange: ${sr.start}-${sr.end})` : "";
          post({
            type: "error",
            message: `Could not patch gadget '${msg.id}'. No matching call found${rangeInfo}.`
          });
          return;
        }
        await vscode.workspace.applyEdit(edit);
      }

      if (msg.type === "setWindowRect") {
        const edit = applyWindowRectPatch(document, msg.id, msg.x, msg.y, msg.w, msg.h, lastModel?.meta.scanRange);
        if (!edit) {
          const sr = lastModel?.meta.scanRange;
          const rangeInfo = sr ? ` (scanRange: ${sr.start}-${sr.end})` : "";
          post({
            type: "error",
            message: `Could not patch window '${msg.id}'. No matching OpenWindow call found${rangeInfo}.`
          });
          return;
        }
        await vscode.workspace.applyEdit(edit);
      }
    });
  }

  private getWebviewHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "out", "webview", "main.js")
    );
    const nonce = getNonce();

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               img-src ${webview.cspSource} data:;
               style-src ${webview.cspSource} 'unsafe-inline';
               script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PureBasic Form Designer</title>
    <style>
      :root {
        color-scheme: light dark;
        --pbfd-canvas-bg: var(--vscode-editor-background);
      }

      body {
        margin: 0;
        padding: 0;
        font-family: system-ui, -apple-system, Segoe UI, sans-serif;
        background: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
      }

      .root {
        display: grid;
        grid-template-columns: 1fr 320px;
        height: 100vh;
      }

      .canvasWrap {
        position: relative;
        overflow: hidden;
        background: var(--pbfd-canvas-bg);
      }

      canvas {
        width: 100%;
        height: 100%;
        display: block;
      }

      .panel {
        border-left: 1px solid var(--vscode-panel-border);
        background: var(--vscode-sideBar-background);
        color: var(--vscode-sideBar-foreground);
        padding: 10px;
        overflow: auto;
      }

      .row {
        display: grid;
        grid-template-columns: 90px 1fr;
        gap: 8px;
        margin-bottom: 8px;
        align-items: center;
      }

      input {
        width: 100%;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        padding: 2px 6px;
      }

      .list { margin-top: 12px; }

      .item {
        padding: 6px 8px;
        border-radius: 8px;
        cursor: pointer;
      }

      .item:hover {
        background: var(--vscode-list-hoverBackground);
      }

      .item.sel {
        background: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
      }

      .muted { opacity: .75; font-size: 12px; }

      .diag {
        margin: 10px 0 8px;
        padding: 8px;
        border-radius: 8px;
        border: 1px solid var(--vscode-panel-border);
        background: var(--vscode-editorWidget-background);
        color: var(--vscode-editorWidget-foreground);
      }

      .diag .row { display: flex; gap: 8px; align-items: flex-start; margin: 4px 0; }
      .diag .sev { width: 18px; text-align: center; }
      .diag .msg { flex: 1; }

      .sev.warn { color: var(--vscode-notificationsWarningIcon-foreground); }
      .sev.err { color: var(--vscode-notificationsErrorIcon-foreground); }
      .sev.info { color: var(--vscode-notificationsInfoIcon-foreground); }

      .err {
        color: #b00020;
        font-size: 12px;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <div class="root">
      <div class="canvasWrap"><canvas id="designer"></canvas></div>
      <div class="panel">
        <div id="diag" class="diag" style="display:none"></div>
        <div><b>Properties</b></div>
        <div class="muted">Drag/resize gadgets. This Version patches only x/y/w/h.</div>
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
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
