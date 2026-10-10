import { sanitizeSvg } from "./render/sanitize-svg";

export interface ExportOptions {
  format: "svg" | "png" | "pdf";
  scale: number;
  margin: number;
  background: "authored" | "white";
}
export const exportPreferencesKey = "plantuml-studio.export-options.v1";
export const defaultExportOptions: ExportOptions = { format: "svg", scale: 2, margin: 16, background: "authored" };
export function loadExportOptions(): ExportOptions {
  try {
    const value = JSON.parse(localStorage.getItem(exportPreferencesKey) ?? "null");
    if (
      value &&
      ["svg", "png", "pdf"].includes(value.format) &&
      [1, 2, 3].includes(value.scale) &&
      [0, 16, 32, 64].includes(value.margin) &&
      ["authored", "white"].includes(value.background)
    )
      return value;
  } catch {
    /* Defaults remain usable when storage is unavailable. */
  }
  return defaultExportOptions;
}
export function prepareExportSvg(svg: string, options: ExportOptions) {
  const root = new DOMParser().parseFromString(sanitizeSvg(svg), "image/svg+xml").documentElement;
  const view = (root.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const width = view.length === 4 ? view[2]! : parseFloat(root.getAttribute("width") ?? "");
  const height = view.length === 4 ? view[3]! : parseFloat(root.getAttribute("height") ?? "");
  if (!(width > 0 && height > 0 && Number.isFinite(width + height)))
    throw new Error("Diagram dimensions are unavailable");
  const margin = options.margin;
  const outputWidth = width + margin * 2,
    outputHeight = height + margin * 2;
  const ns = "http://www.w3.org/2000/svg";
  const outer = document.createElementNS(ns, "svg");
  outer.setAttribute("width", String(outputWidth));
  outer.setAttribute("height", String(outputHeight));
  outer.setAttribute("viewBox", `0 0 ${outputWidth} ${outputHeight}`);
  if (options.background === "white" || options.format === "pdf") {
    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("width", "100%");
    rect.setAttribute("height", "100%");
    rect.setAttribute("fill", "#ffffff");
    outer.append(rect);
  }
  root.setAttribute("x", String(margin));
  root.setAttribute("y", String(margin));
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  outer.append(root);
  return { svg: new XMLSerializer().serializeToString(outer), width: outputWidth, height: outputHeight };
}
/** PlantUML's documented UTF-8 hexadecimal URL encoding. No network access. */
export function encodedDiagramUrl(source: string, server: string): string {
  const base = new URL(server);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash)
    throw new Error("Use an HTTPS renderer base URL without credentials, query or fragment");
  const hex = Array.from(new TextEncoder().encode(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const url = `${base.href.replace(/\/$/, "").replace(/\(/g, "%28").replace(/\)/g, "%29")}/svg/~h${hex}`;
  if (url.length > 8000) throw new Error("This diagram makes a long URL. Export a local image or source file instead.");
  return url;
}
