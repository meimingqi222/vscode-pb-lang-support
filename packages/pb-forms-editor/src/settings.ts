import * as vscode from "vscode";

export type GridMode = "dots" | "lines";
export type SnapMode = "live" | "drop";

export interface DesignerSettings {
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
}

export const SETTINGS_SECTION = "purebasicFormsDesigner";

export function readDesignerSettings(): DesignerSettings {
  const cfg = vscode.workspace.getConfiguration(SETTINGS_SECTION);

  return {
    showGrid: cfg.get<boolean>("showGrid", true),
    gridMode: cfg.get<GridMode>("gridMode", "dots"),
    gridSize: clamp(cfg.get<number>("gridSize", 10), 2, 100),
    gridOpacity: clamp(cfg.get<number>("gridOpacity", 0.14), 0.02, 0.5),

    snapToGrid: cfg.get<boolean>("snapToGrid", false),
    snapMode: cfg.get<SnapMode>("snapMode", "drop"),

    windowFillOpacity: clamp(cfg.get<number>("windowFillOpacity", 0.05), 0, 0.25),
    outsideDimOpacity: clamp(cfg.get<number>("outsideDimOpacity", 0.12), 0, 0.35),
    titleBarHeight: clamp(cfg.get<number>("titleBarHeight", 26), 0, 60),

    canvasBackground: cfg.get<string>("canvasBackground", "")
  };
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}
