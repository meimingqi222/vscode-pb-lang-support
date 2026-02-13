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

type ExtensionToWebviewMessage =
  | { type: "init"; model: Model }
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

let drag:
  | { id: string; startMx: number; startMy: number; startX: number; startY: number }
  | null = null;

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
    if (selectedId && !model.gadgets.some(g => g.id === selectedId)) {
      selectedId = null;
    }
    render();
    renderList();
    renderProps();
  } else if (msg.type === "error") {
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

  g.x = Math.trunc(drag.startX + (mx - drag.startMx));
  g.y = Math.trunc(drag.startY + (my - drag.startMy));
  render();
  renderProps();
});

window.addEventListener("mouseup", () => {
  if (!drag) return;
  const g = model.gadgets.find(it => it.id === drag!.id);
  if (g) {
    vscode.postMessage({ type: "moveGadget", id: g.id, x: g.x, y: g.y });
  }
  drag = null;
});

function render() {
  const ctx = canvas.getContext("2d")!;
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  const winW = model.window?.w ?? rect.width;
  const winH = model.window?.h ?? rect.height;
  ctx.strokeRect(0.5, 0.5, Math.max(1, winW) - 1, Math.max(1, winH) - 1);

  for (const g of model.gadgets) {
    ctx.strokeRect(g.x + 0.5, g.y + 0.5, g.w, g.h);

    if (g.id === selectedId) {
      ctx.lineWidth = 2;
      ctx.strokeRect(g.x + 0.5, g.y + 0.5, g.w, g.h);
      ctx.lineWidth = 1;
    }

    const label = `${g.kind} ${g.id}`;
    ctx.fillText(label, g.x + 4, g.y + 14);
  }
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

resizeCanvas();
vscode.postMessage({ type: "ready" });
