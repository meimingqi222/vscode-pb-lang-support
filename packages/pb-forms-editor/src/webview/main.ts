type Gadget = {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
};

type WindowModel = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
};

type Model = {
  window?: WindowModel;
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
// - init may come without settings
type ExtensionToWebviewMessage =
  | { type: "init"; model: Model; settings?: DesignerSettings }
  | { type: "settings"; settings: DesignerSettings }
  | { type: "error"; message: string };

type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "moveGadget"; id: string; x: number; y: number }
  | { type: "setGadgetRect"; id: string; x: number; y: number; w: number; h: number }
  | { type: "setWindowRect"; id: string; x: number; y: number; w: number; h: number };

declare const acquireVsCodeApi: () => { postMessage: (msg: WebviewToExtensionMessage) => void };

const vscode = acquireVsCodeApi();

const canvas = document.getElementById("designer") as HTMLCanvasElement;
const propsEl = document.getElementById("props") as HTMLDivElement;
const listEl = document.getElementById("list") as HTMLDivElement;
const errEl = document.getElementById("err") as HTMLDivElement;

let model: Model = { gadgets: [] };

type DesignerSelection = { kind: "gadget"; id: string } | { kind: "window" } | null;
let selection: DesignerSelection = null;

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

type Handle = "nw" | "n" | "ne" | "w" | "e" | "sw" | "s" | "se";

const HANDLE_SIZE = 6;
const HANDLE_HIT = 10;

const MIN_GADGET_W = 8;
const MIN_GADGET_H = 8;

// Keep this permissive; PB allows small windows, but avoid 0/negative sizes.
const MIN_WIN_W = 40;
const MIN_WIN_H = 40;

type DragState =
  | { target: "gadget"; mode: "move"; id: string; startMx: number; startMy: number; startX: number; startY: number }
  | {
      target: "gadget";
      mode: "resize";
      id: string;
      handle: Handle;
      startMx: number;
      startMy: number;
      startX: number;
      startY: number;
      startW: number;
      startH: number;
    }
  | { target: "window"; mode: "move"; startMx: number; startMy: number; startX: number; startY: number }
  | {
      target: "window";
      mode: "resize";
      handle: Handle;
      startMx: number;
      startMy: number;
      startX: number;
      startY: number;
      startW: number;
      startH: number;
    };

let drag: DragState | null = null;

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

    // Validate selection after model refresh
    if (selection?.kind === "gadget") {
      const selId = selection.id;
      if (!model.gadgets.some(g => g.id === selId)) {
        selection = null;
      }
    } else if (selection?.kind === "window") {
      if (!model.window) selection = null;
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

function getWinRect(): { x: number; y: number; w: number; h: number; title: string; id: string; tbH: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (!model.window) return null;

  const x = asInt(model.window.x ?? 0);
  const y = asInt(model.window.y ?? 0);
  const w = clampPos(model.window.w ?? rect.width);
  const h = clampPos(model.window.h ?? rect.height);

  return {
    x,
    y,
    w,
    h,
    title: model.window.title ?? "",
    id: model.window.id,
    tbH: Math.max(0, asInt(settings.titleBarHeight))
  };
}

function hitWindow(mx: number, my: number): boolean {
  const wr = getWinRect();
  if (!wr) return false;
  return mx >= wr.x && mx <= wr.x + wr.w && my >= wr.y && my <= wr.y + wr.h;
}

function toLocal(mx: number, my: number): { lx: number; ly: number } {
  const wr = getWinRect();
  const ox = wr?.x ?? 0;
  const oy = wr?.y ?? 0;
  return { lx: mx - ox, ly: my - oy };
}

function toGlobal(lx: number, ly: number): { gx: number; gy: number } {
  const wr = getWinRect();
  const ox = wr?.x ?? 0;
  const oy = wr?.y ?? 0;
  return { gx: lx + ox, gy: ly + oy };
}

function hitTestGadget(mx: number, my: number): Gadget | null {
  if (!hitWindow(mx, my)) return null;

  const { lx, ly } = toLocal(mx, my);
  for (let i = model.gadgets.length - 1; i >= 0; i--) {
    const g = model.gadgets[i];
    if (lx >= g.x && lx <= g.x + g.w && ly >= g.y && ly <= g.y + g.h) return g;
  }
  return null;
}

function handlePointsLocal(x: number, y: number, w: number, h: number): Array<[Handle, number, number]> {
  return [
    ["nw", x, y],
    ["n", x + w / 2, y],
    ["ne", x + w, y],
    ["w", x, y + h / 2],
    ["e", x + w, y + h / 2],
    ["sw", x, y + h],
    ["s", x + w / 2, y + h],
    ["se", x + w, y + h]
  ];
}

function hitHandlePoints(points: Array<[Handle, number, number]>, mx: number, my: number): Handle | null {
  const half = HANDLE_HIT / 2;
  for (const [h, px, py] of points) {
    if (mx >= px - half && mx <= px + half && my >= py - half && my <= py + half) {
      return h;
    }
  }
  return null;
}

function hitHandleGadget(g: Gadget, mx: number, my: number): Handle | null {
  const { gx: ox, gy: oy } = toGlobal(0, 0);
  const pts = handlePointsLocal(g.x + ox, g.y + oy, g.w, g.h);
  return hitHandlePoints(pts, mx, my);
}

function hitHandleWindow(mx: number, my: number): Handle | null {
  const wr = getWinRect();
  if (!wr) return null;

  // Handles are around the outer window rect
  const pts = handlePointsLocal(wr.x, wr.y, wr.w, wr.h);
  return hitHandlePoints(pts, mx, my);
}

function isInTitleBar(mx: number, my: number): boolean {
  const wr = getWinRect();
  if (!wr) return false;
  const tbH = wr.tbH;
  if (tbH <= 0) return false;

  return mx >= wr.x && mx <= wr.x + wr.w && my >= wr.y && my <= wr.y + tbH;
}

function getHandleCursor(h: Handle): string {
  switch (h) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "w":
    case "e":
      return "ew-resize";
  }
}

function clampRect(
  x: number,
  y: number,
  w: number,
  h: number,
  minW: number,
  minH: number
): { x: number; y: number; w: number; h: number } {
  let nx = asInt(x);
  let ny = asInt(y);
  let nw = asInt(w);
  let nh = asInt(h);

  if (nw < minW) nw = minW;
  if (nh < minH) nh = minH;

  return { x: nx, y: ny, w: nw, h: nh };
}

function applyResize(
  x: number,
  y: number,
  w: number,
  h: number,
  dx: number,
  dy: number,
  handle: Handle,
  minW: number,
  minH: number
): { x: number; y: number; w: number; h: number } {
  let nx = x;
  let ny = y;
  let nw = w;
  let nh = h;

  const west = handle === "nw" || handle === "w" || handle === "sw";
  const east = handle === "ne" || handle === "e" || handle === "se";
  const north = handle === "nw" || handle === "n" || handle === "ne";
  const south = handle === "sw" || handle === "s" || handle === "se";

  if (east) nw = w + dx;
  if (south) nh = h + dy;

  if (west) {
    nx = x + dx;
    nw = w - dx;
  }

  if (north) {
    ny = y + dy;
    nh = h - dy;
  }

  if (nw < minW) {
    if (west) nx = x + (w - minW);
    nw = minW;
  }

  if (nh < minH) {
    if (north) ny = y + (h - minH);
    nh = minH;
  }

  return clampRect(nx, ny, nw, nh, minW, minH);
}

function snapValue(v: number, gridSize: number): number {
  if (gridSize <= 1) return Math.trunc(v);
  return Math.round(v / gridSize) * gridSize;
}

function postGadgetRect(g: Gadget) {
  const r = clampRect(g.x, g.y, g.w, g.h, MIN_GADGET_W, MIN_GADGET_H);
  g.x = r.x;
  g.y = r.y;
  g.w = r.w;
  g.h = r.h;

  vscode.postMessage({ type: "setGadgetRect", id: g.id, x: g.x, y: g.y, w: g.w, h: g.h });
}

function postWindowRect() {
  if (!model.window) return;

  const r = clampRect(model.window.x, model.window.y, model.window.w, model.window.h, MIN_WIN_W, MIN_WIN_H);
  model.window.x = r.x;
  model.window.y = r.y;
  model.window.w = r.w;
  model.window.h = r.h;

  vscode.postMessage({ type: "setWindowRect", id: model.window.id, x: r.x, y: r.y, w: r.w, h: r.h });
}

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const g = hitTestGadget(mx, my);
  if (g) {
    selection = { kind: "gadget", id: g.id };

    const h = hitHandleGadget(g, mx, my);
    if (h) {
      drag = {
        target: "gadget",
        mode: "resize",
        id: g.id,
        handle: h,
        startMx: mx,
        startMy: my,
        startX: g.x,
        startY: g.y,
        startW: g.w,
        startH: g.h
      };
      canvas.style.cursor = getHandleCursor(h);
    } else {
      drag = {
        target: "gadget",
        mode: "move",
        id: g.id,
        startMx: mx,
        startMy: my,
        startX: g.x,
        startY: g.y
      };
      canvas.style.cursor = "move";
    }

    render();
    renderList();
    renderProps();
    return;
  }

  // Window interaction (no gadget hit)
  const wr = getWinRect();
  if (wr && hitWindow(mx, my)) {
    selection = { kind: "window" };

    const wh = hitHandleWindow(mx, my);
    if (wh) {
      drag = {
        target: "window",
        mode: "resize",
        handle: wh,
        startMx: mx,
        startMy: my,
        startX: wr.x,
        startY: wr.y,
        startW: wr.w,
        startH: wr.h
      };
      canvas.style.cursor = getHandleCursor(wh);
    } else if (isInTitleBar(mx, my)) {
      drag = {
        target: "window",
        mode: "move",
        startMx: mx,
        startMy: my,
        startX: wr.x,
        startY: wr.y
      };
      canvas.style.cursor = "move";
    } else {
      drag = null;
      canvas.style.cursor = "default";
    }

    render();
    renderList();
    renderProps();
    return;
  }

  selection = null;
  drag = null;
  canvas.style.cursor = "default";

  render();
  renderList();
  renderProps();
});

window.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  if (!drag) {
    // Window handles have priority
    const wh = hitHandleWindow(mx, my);
    if (wh) {
      canvas.style.cursor = getHandleCursor(wh);
      return;
    }

    if (isInTitleBar(mx, my)) {
      canvas.style.cursor = "move";
      return;
    }

    // Gadget handle only when selected (like typical designers)
    if (selection?.kind === "gadget") {
      const selId = selection.id;
      const sel = model.gadgets.find(it => it.id === selId);
      if (sel) {
        const gh = hitHandleGadget(sel, mx, my);
        if (gh) {
          canvas.style.cursor = getHandleCursor(gh);
          return;
        }
      }
    }

    const g = hitTestGadget(mx, my);
    canvas.style.cursor = g ? "move" : "default";
    return;
  }

  const d = drag;
  const dx = mx - d.startMx;
  const dy = my - d.startMy;

  if (d.target === "gadget") {
    const g = model.gadgets.find(it => it.id === d.id);
    if (!g) return;

    if (d.mode === "move") {
      let nx = asInt(d.startX + dx);
      let ny = asInt(d.startY + dy);

      if (settings.snapToGrid && settings.snapMode === "live") {
        const gs = settings.gridSize;
        nx = snapValue(nx, gs);
        ny = snapValue(ny, gs);
      }

      g.x = nx;
      g.y = ny;
      canvas.style.cursor = "move";
    } else {
      const r0 = applyResize(d.startX, d.startY, d.startW, d.startH, dx, dy, d.handle, MIN_GADGET_W, MIN_GADGET_H);

      let nx = r0.x;
      let ny = r0.y;
      let nw = r0.w;
      let nh = r0.h;

      if (settings.snapToGrid && settings.snapMode === "live") {
        const gs = settings.gridSize;
        nx = snapValue(nx, gs);
        ny = snapValue(ny, gs);
        nw = snapValue(nw, gs);
        nh = snapValue(nh, gs);

        const r1 = clampRect(nx, ny, nw, nh, MIN_GADGET_W, MIN_GADGET_H);
        nx = r1.x;
        ny = r1.y;
        nw = r1.w;
        nh = r1.h;
      }

      g.x = nx;
      g.y = ny;
      g.w = nw;
      g.h = nh;

      canvas.style.cursor = getHandleCursor(d.handle);
    }

    render();
    renderProps();
    return;
  }

  // Window dragging
  if (!model.window) return;

  if (d.mode === "move") {
    let nx = asInt(d.startX + dx);
    let ny = asInt(d.startY + dy);

    if (settings.snapToGrid && settings.snapMode === "live") {
      const gs = settings.gridSize;
      nx = snapValue(nx, gs);
      ny = snapValue(ny, gs);
    }

    model.window.x = nx;
    model.window.y = ny;

    canvas.style.cursor = "move";
  } else {
    const r0 = applyResize(d.startX, d.startY, d.startW, d.startH, dx, dy, d.handle, MIN_WIN_W, MIN_WIN_H);

    let nx = r0.x;
    let ny = r0.y;
    let nw = r0.w;
    let nh = r0.h;

    if (settings.snapToGrid && settings.snapMode === "live") {
      const gs = settings.gridSize;
      nx = snapValue(nx, gs);
      ny = snapValue(ny, gs);
      nw = snapValue(nw, gs);
      nh = snapValue(nh, gs);

      const r1 = clampRect(nx, ny, nw, nh, MIN_WIN_W, MIN_WIN_H);
      nx = r1.x;
      ny = r1.y;
      nw = r1.w;
      nh = r1.h;
    }

    model.window.x = nx;
    model.window.y = ny;
    model.window.w = nw;
    model.window.h = nh;

    canvas.style.cursor = getHandleCursor(d.handle);
  }

  render();
  renderProps();
});

window.addEventListener("mouseup", () => {
  const d = drag;
  if (!d) return;

  if (d.target === "gadget") {
    const g = model.gadgets.find(it => it.id === d.id);
    if (g) {
      if (settings.snapToGrid && settings.snapMode === "drop") {
        const gs = settings.gridSize;
        g.x = snapValue(g.x, gs);
        g.y = snapValue(g.y, gs);
        g.w = snapValue(g.w, gs);
        g.h = snapValue(g.h, gs);

        const r = clampRect(g.x, g.y, g.w, g.h, MIN_GADGET_W, MIN_GADGET_H);
        g.x = r.x;
        g.y = r.y;
        g.w = r.w;
        g.h = r.h;
      }

      postGadgetRect(g);
    }
  } else {
    if (model.window) {
      if (settings.snapToGrid && settings.snapMode === "drop") {
        const gs = settings.gridSize;
        model.window.x = snapValue(model.window.x, gs);
        model.window.y = snapValue(model.window.y, gs);
        model.window.w = snapValue(model.window.w, gs);
        model.window.h = snapValue(model.window.h, gs);

        const r = clampRect(model.window.x, model.window.y, model.window.w, model.window.h, MIN_WIN_W, MIN_WIN_H);
        model.window.x = r.x;
        model.window.y = r.y;
        model.window.w = r.w;
        model.window.h = r.h;
      }

      postWindowRect();
    }
  }

  drag = null;
});

function render() {
  const ctx = canvas.getContext("2d")!;
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  const fg = getComputedStyle(document.body).color;
  const focus = getCssVar("--vscode-focusBorder") || fg;

  ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.lineWidth = 1;

  const wr = getWinRect();
  if (!wr) return;

  const winX = wr.x;
  const winY = wr.y;
  const winW = wr.w;
  const winH = wr.h;
  const winTitle = wr.title;
  const tbH = wr.tbH;

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
    ctx.fillRect(winX, winY, winW, winH);
    ctx.restore();
  } else {
    // Ensure window area is not dimmed by outside fill
    ctx.clearRect(winX, winY, winW, winH);
  }

  // Grid only inside window
  if (settings.showGrid) {
    drawGrid(ctx, winX, winY, winW, winH, settings.gridSize, settings.gridOpacity, settings.gridMode, fg);
  }

  // Optional title bar
  if (tbH > 0) {
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = focus;
    ctx.fillRect(winX, winY, winW, tbH);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = focus;
    ctx.strokeRect(winX + 0.5, winY + 0.5, winW - 1, tbH - 1);
    ctx.restore();

    ctx.fillStyle = fg;
    ctx.fillText(winTitle, winX + 8, winY + Math.min(tbH - 8, 18));
  }

  // Window border
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = focus;
  ctx.strokeRect(winX + 0.5, winY + 0.5, winW - 1, winH - 1);
  ctx.restore();

  // Window selection overlay
  if (selection?.kind === "window") {
    ctx.save();
    ctx.strokeStyle = focus;
    ctx.lineWidth = 2;
    ctx.strokeRect(winX + 0.5, winY + 0.5, winW - 1, winH - 1);
    ctx.restore();

    drawHandles(ctx, winX, winY, winW, winH, focus);
  }

  // Gadgets (offset by window origin)
  for (const g of model.gadgets) {
    const gx = winX + g.x;
    const gy = winY + g.y;

    ctx.strokeStyle = fg;
    ctx.fillStyle = fg;
    ctx.lineWidth = 1;

    ctx.strokeRect(gx + 0.5, gy + 0.5, g.w, g.h);
    ctx.fillText(`${g.kind} ${g.id}`, gx + 4, gy + 14);

    if (selection?.kind === "gadget" && g.id === selection.id) {
      ctx.save();
      ctx.strokeStyle = focus;
      ctx.lineWidth = 2;
      ctx.strokeRect(gx + 0.5, gy + 0.5, g.w, g.h);
      ctx.restore();

      drawHandles(ctx, gx, gy, g.w, g.h, focus);
    }
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
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
      ctx.moveTo(ox + x + 0.5, oy);
      ctx.lineTo(ox + x + 0.5, oy + h);
    }
    for (let y = 0; y <= h; y += size) {
      ctx.moveTo(ox, oy + y + 0.5);
      ctx.lineTo(ox + w, oy + y + 0.5);
    }
    ctx.stroke();
  } else {
    const r = 1;
    const maxDots = 350_000;
    let dots = 0;

    for (let y = 0; y <= h; y += size) {
      for (let x = 0; x <= w; x += size) {
        ctx.fillRect(ox + x - r, oy + y - r, r * 2, r * 2);
        dots++;
        if (dots >= maxDots) break;
      }
      if (dots >= maxDots) break;
    }
  }

  ctx.restore();
}

function drawHandles(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, stroke: string) {
  const s = HANDLE_SIZE;
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

  if (model.window) {
    const div = document.createElement("div");
    const sel = selection?.kind === "window";
    div.className = "item" + (sel ? " sel" : "");
    div.textContent = `Window  ${model.window.id}`;
    div.onclick = () => {
      selection = { kind: "window" };
      render();
      renderList();
      renderProps();
    };
    listEl.appendChild(div);
  }

  for (const g of model.gadgets) {
    const div = document.createElement("div");
    const sel = selection?.kind === "gadget" && g.id === selection.id;
    div.className = "item" + (sel ? " sel" : "");
    div.textContent = `${g.kind}  ${g.id}`;
    div.onclick = () => {
      selection = { kind: "gadget", id: g.id };
      render();
      renderList();
      renderProps();
    };
    listEl.appendChild(div);
  }
}

function renderProps() {
  propsEl.innerHTML = "";

  if (!selection) {
    propsEl.innerHTML = "<div class='muted'>No selection</div>";
    return;
  }

  if (selection.kind === "window") {
    if (!model.window) {
      propsEl.innerHTML = "<div class='muted'>No window</div>";
      return;
    }

    propsEl.appendChild(row("Id", readonlyInput(model.window.id)));
    propsEl.appendChild(row("Title", readonlyInput(model.window.title ?? "")));
    propsEl.appendChild(
      row("X", numberInput(model.window.x, v => { if (!model.window) return; model.window.x = asInt(v); postWindowRect(); render(); renderProps(); }))
    );
    propsEl.appendChild(
      row("Y", numberInput(model.window.y, v => { if (!model.window) return; model.window.y = asInt(v); postWindowRect(); render(); renderProps(); }))
    );
    propsEl.appendChild(
      row("W", numberInput(model.window.w, v => { if (!model.window) return; model.window.w = asInt(v); postWindowRect(); render(); renderProps(); }))
    );
    propsEl.appendChild(
      row("H", numberInput(model.window.h, v => { if (!model.window) return; model.window.h = asInt(v); postWindowRect(); render(); renderProps(); }))
    );
    return;
  }

  if (selection.kind !== "gadget") {
    propsEl.innerHTML = "<div class='muted'>No selection</div>";
    return;
  }

  const selId = selection.id;
  const g = model.gadgets.find(it => it.id === selId);
  if (!g) {
    propsEl.innerHTML = "<div class='muted'>No selection</div>";
    return;
  }

  propsEl.appendChild(row("Id", readonlyInput(g.id)));
  propsEl.appendChild(row("Kind", readonlyInput(g.kind)));
  propsEl.appendChild(row("X", numberInput(g.x, v => { g.x = asInt(v); postGadgetRect(g); render(); renderProps(); })));
  propsEl.appendChild(row("Y", numberInput(g.y, v => { g.y = asInt(v); postGadgetRect(g); render(); renderProps(); })));
  propsEl.appendChild(row("W", numberInput(g.w, v => { g.w = asInt(v); postGadgetRect(g); render(); renderProps(); })));
  propsEl.appendChild(row("H", numberInput(g.h, v => { g.h = asInt(v); postGadgetRect(g); render(); renderProps(); })));
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

function asInt(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

resizeCanvas();
vscode.postMessage({ type: "ready" });