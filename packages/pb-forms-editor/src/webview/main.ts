type Gadget = {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
};

type Model = {
  window?: { id: string; x: number; y: number; w: number; h: number; title?: string };
  gadgets: Gadget[];
};

type GridMode = "dots" | "lines";
type SnapMode = "live" | "drop";

type DesignerSettings = {
  showGrid: boolean;
  gridMode: GridMode;
  gridSize: number;
  gridOpacity: number;

  snapToGrid: boolean;
  snapMode: SnapMode;

  windowFillOpacity: number;
  outsideDimOpacity: number;
  titleBarHeight: number;

  canvasBackground: string;
};

// Backwards compatible:
// - init may come without settings (your current provider)
// - optional "settings" message for live updates (when you add it in the provider)
type ExtensionToWebviewMessage =
  | { type: "init"; model: Model; settings?: DesignerSettings }
  | { type: "settings"; settings: DesignerSettings }
  | { type: "error"; message: string };

type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "moveGadget"; id: string; x: number; y: number };

declare const acquireVsCodeApi: () => { postMessage: (msg: WebviewToExtensionMessage) => void };

const vscode = acquireVsCodeApi();

const canvas = document.getElementById("designer") as HTMLCanvasElement;
const propsEl = document.getElementById("props") as HTMLDivElement;
const listEl = document.getElementById("list") as HTMLDivElement;
const errEl = document.getElementById("err") as HTMLDivElement;

let model: Model = { gadgets: [] };
let selectedId: string | null = null;

let settings: DesignerSettings = {
  showGrid: true,
  gridMode: "dots",
  gridSize: 10,
  gridOpacity: 0.14,

  snapToGrid: false,
  snapMode: "drop",

  windowFillOpacity: 0.05,
  outsideDimOpacity: 0.12,
  titleBarHeight: 26,

  canvasBackground: ""
};

let drag:
  | { id: string; startMx: number; startMy: number; startX: number; startY: number }
  | null = null;

function applySettings(s: DesignerSettings) {
  settings = s;

  const bg = (settings.canvasBackground ?? "").trim();
  document.documentElement.style.setProperty(
    "--pbfd-canvas-bg",
    bg.length ? bg : "var(--vscode-editor-background)"
  );

  render();
  renderProps();
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

window.addEventListener("resize", resizeCanvas);

window.addEventListener("message", (ev: MessageEvent<ExtensionToWebviewMessage>) => {
  const msg = ev.data;

  if (msg.type === "init") {
    errEl.textContent = "";
    model = msg.model;

    if (msg.settings) {
      applySettings(msg.settings);
    }

    if (selectedId && !model.gadgets.some(g => g.id === selectedId)) {
      selectedId = null;
    }

    render();
    renderList();
    renderProps();
    return;
  }

  if (msg.type === "settings") {
    applySettings(msg.settings);
    return;
  }

  if (msg.type === "error") {
    errEl.textContent = msg.message;
  }
});

function hitTest(mx: number, my: number): Gadget | null {
  for (let i = model.gadgets.length - 1; i >= 0; i--) {
    const g = model.gadgets[i];
    if (mx >= g.x && mx <= g.x + g.w && my >= g.y && my <= g.y + g.h) return g;
  }
  return null;
}

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const g = hitTest(mx, my);
  if (g) {
    selectedId = g.id;
    drag = { id: g.id, startMx: mx, startMy: my, startX: g.x, startY: g.y };
  } else {
    selectedId = null;
    drag = null;
  }

  render();
  renderList();
  renderProps();
});

window.addEventListener("mousemove", (e) => {
  if (!drag) return;

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const g = model.gadgets.find(it => it.id === drag!.id);
  if (!g) return;

  let nx = Math.trunc(drag.startX + (mx - drag.startMx));
  let ny = Math.trunc(drag.startY + (my - drag.startMy));

  if (settings.snapToGrid && settings.snapMode === "live" && settings.gridSize > 1) {
    const gs = settings.gridSize;
    nx = Math.round(nx / gs) * gs;
    ny = Math.round(ny / gs) * gs;
  }

  g.x = nx;
  g.y = ny;

  render();
  renderProps();
});

window.addEventListener("mouseup", () => {
  if (!drag) return;

  const g = model.gadgets.find(it => it.id === drag!.id);
  if (g) {
    if (settings.snapToGrid && settings.snapMode === "drop" && settings.gridSize > 1) {
      const gs = settings.gridSize;
      g.x = Math.round(g.x / gs) * gs;
      g.y = Math.round(g.y / gs) * gs;
      render();
      renderProps();
    }

    vscode.postMessage({ type: "moveGadget", id: g.id, x: g.x, y: g.y });
  }

  drag = null;
});

function render() {
  const ctx = canvas.getContext("2d")!;
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  // IMPORTANT: use theme colors (otherwise canvas defaults to black)
  const fg = getComputedStyle(document.body).color;
  const focus = getCssVar("--vscode-focusBorder") || fg;

  ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.lineWidth = 1;
  ctx.strokeStyle = fg;
  ctx.fillStyle = fg;

  const winW = clampPos(model.window?.w ?? rect.width);
  const winH = clampPos(model.window?.h ?? rect.height);
  const winTitle = model.window?.title ?? "";

  // Outside dim (PB-like)
  if (settings.outsideDimOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(settings.outsideDimOpacity, 0, 1);
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.restore();
  }

  // Window fill (so the window area is visually separated)
  if (settings.windowFillOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(settings.windowFillOpacity, 0, 1);
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, winW, winH);
    ctx.restore();
  } else {
    // ensure window area is not dimmed by outside fill
    ctx.clearRect(0, 0, winW, winH);
  }

  // Grid only inside window
  if (settings.showGrid) {
    drawGrid(ctx, winW, winH, settings.gridSize, settings.gridOpacity, settings.gridMode, fg);
  }

  // Optional title bar
  const tbH = Math.trunc(settings.titleBarHeight);
  if (tbH > 0) {
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = focus;
    ctx.fillRect(0, 0, winW, tbH);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = focus;
    ctx.strokeRect(0.5, 0.5, winW - 1, tbH - 1);
    ctx.restore();

    ctx.fillStyle = fg;
    ctx.fillText(winTitle, 8, Math.min(tbH - 8, 18));
  }

  // Window border
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = focus;
  ctx.strokeRect(0.5, 0.5, winW - 1, winH - 1);
  ctx.restore();

  // Gadgets
  for (const g of model.gadgets) {
    ctx.strokeStyle = fg;
    ctx.fillStyle = fg;
    ctx.lineWidth = 1;

    ctx.strokeRect(g.x + 0.5, g.y + 0.5, g.w, g.h);
    ctx.fillText(`${g.kind} ${g.id}`, g.x + 4, g.y + 14);

    if (g.id === selectedId) {
      // Selection border
      ctx.save();
      ctx.strokeStyle = focus;
      ctx.lineWidth = 2;
      ctx.strokeRect(g.x + 0.5, g.y + 0.5, g.w, g.h);
      ctx.restore();

      // Handles (8 points)
      drawHandles(ctx, g.x, g.y, g.w, g.h, focus);
    }
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  size: number,
  opacity: number,
  mode: GridMode,
  color: string
) {
  if (size < 2) return;

  ctx.save();
  ctx.globalAlpha = clamp(opacity, 0, 1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;

  if (mode === "lines") {
    ctx.beginPath();
    for (let x = 0; x <= w; x += size) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
    }
    for (let y = 0; y <= h; y += size) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    ctx.stroke();
  } else {
    const r = 1;
    const maxDots = 350_000;
    let dots = 0;

    for (let y = 0; y <= h; y += size) {
      for (let x = 0; x <= w; x += size) {
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        dots++;
        if (dots >= maxDots) break;
      }
      if (dots >= maxDots) break;
    }
  }

  ctx.restore();
}

function drawHandles(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, stroke: string) {
  const s = 6;
  const hs = s / 2;

  const pts: Array<[number, number]> = [
    [x, y],
    [x + w / 2, y],
    [x + w, y],
    [x, y + h / 2],
    [x + w, y + h / 2],
    [x, y + h],
    [x + w / 2, y + h],
    [x + w, y + h],
  ];

  const fill = getCssVar("--vscode-editor-background") || "transparent";

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;

  for (const [px, py] of pts) {
    const rx = Math.round(px - hs) + 0.5;
    const ry = Math.round(py - hs) + 0.5;
    ctx.fillRect(rx, ry, s, s);
    ctx.strokeRect(rx, ry, s, s);
  }

  ctx.restore();
}

function renderList() {
  listEl.innerHTML = "";
  for (const g of model.gadgets) {
    const div = document.createElement("div");
    div.className = "item" + (g.id === selectedId ? " sel" : "");
    div.textContent = `${g.kind}  ${g.id}`;
    div.onclick = () => {
      selectedId = g.id;
      render();
      renderList();
      renderProps();
    };
    listEl.appendChild(div);
  }
}

function renderProps() {
  propsEl.innerHTML = "";
  const g = selectedId ? model.gadgets.find(it => it.id === selectedId) : null;
  if (!g) {
    propsEl.innerHTML = "<div class='muted'>No selection</div>";
    return;
  }

  propsEl.appendChild(row("Id", readonlyInput(g.id)));
  propsEl.appendChild(row("Kind", readonlyInput(g.kind)));
  propsEl.appendChild(row("X", numberInput(g.x, v => { g.x = v; render(); })));
  propsEl.appendChild(row("Y", numberInput(g.y, v => { g.y = v; render(); })));
  propsEl.appendChild(row("W", numberInput(g.w, v => { g.w = v; render(); })));
  propsEl.appendChild(row("H", numberInput(g.h, v => { g.h = v; render(); })));
}

function row(label: string, input: HTMLElement) {
  const wrap = document.createElement("div");
  wrap.className = "row";
  const l = document.createElement("div");
  l.textContent = label;
  wrap.appendChild(l);
  wrap.appendChild(input);
  return wrap;
}

function readonlyInput(value: string) {
  const i = document.createElement("input");
  i.value = value;
  i.readOnly = true;
  return i;
}

function numberInput(value: number, onChange: (v: number) => void) {
  const i = document.createElement("input");
  i.type = "number";
  i.value = String(value);
  i.onchange = () => onChange(Number(i.value));
  return i;
}

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function clampPos(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(1, Math.trunc(v));
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

resizeCanvas();
vscode.postMessage({ type: "ready" });
