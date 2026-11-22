import { sanitizeSvgFragment } from "../../render/sanitize-svg";

export interface SnapshotInput {
  /** Decorated export SVG, as produced for image export. */
  svg: string;
  /** Diagram source. Only its SHA-256 fingerprint is embedded, never the text. */
  source: string;
  /** Document name shown as the page heading. */
  documentName: string;
  /** Title of the diagram (usually the same as the document name). */
  diagramTitle: string;
  /** Diagram kind, for example "gantt". */
  diagramKind: string;
  snapshotDate: Date;
  /** Shown only when the current source matches a pinned or named version. */
  versionLabel?: string | undefined;
}

const kindLabels: Record<string, string> = {
  gantt: "Gantt chart",
  sequence: "Sequence diagram",
  usecase: "Use case diagram",
  class: "Class diagram",
  component: "Component diagram",
  activity: "Activity diagram",
  wbs: "Work breakdown structure",
  mindmap: "Mind map",
};

/** `{HASH}` is replaced with the base64 SHA-256 of the one inline script. */
export const snapshotCspTemplate =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-{HASH}'; base-uri 'none'; form-action 'none'";

const externalProtocols = new Set(["http:", "https:", "mailto:"]);
const safeImageData = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function snapshotFileName(fileName: string): string {
  return fileName.replace(/\.(pumlu|puml|plantuml)$/i, "") + ".snapshot.html";
}

async function digest(text: string): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) throw new Error("Snapshots need a secure browser context (Web Crypto) to be created");
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export async function sha256Hex(text: string): Promise<string> {
  return [...(await digest(text))].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Base64(text: string): Promise<string> {
  return btoa(String.fromCharCode(...(await digest(text))));
}

/**
 * Sanitises the diagram SVG again for embedding in a standalone page: DOMPurify (no script, style,
 * foreignObject or event attributes) plus strict link and image rules. Returns the serialised root and its size.
 */
export function sanitizeSnapshotSvg(svg: string): { svg: string; width: number; height: number } {
  const fragment = sanitizeSvgFragment(svg);
  const root = fragment.firstElementChild;
  if (!root || root.localName !== "svg") throw new Error("The diagram did not produce an SVG image");
  for (const element of [...root.querySelectorAll("*"), root]) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name !== "href" && name !== "xlink:href") continue;
      const value = attribute.value.trim();
      if (element.localName === "a") {
        if (value.startsWith("#")) continue;
        let allowed: boolean;
        try {
          allowed = externalProtocols.has(new URL(value).protocol);
        } catch {
          allowed = false;
        }
        if (!allowed) element.removeAttribute(attribute.name);
      } else if (!value.startsWith("#") && !safeImageData.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.localName !== "a") continue;
    const target = (element.getAttribute("href") ?? element.getAttribute("xlink:href") ?? "").trim();
    if (target && !target.startsWith("#")) {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    } else {
      element.removeAttribute("target");
      element.removeAttribute("rel");
    }
  }
  const view = (root.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const width = parseFloat(root.getAttribute("width") ?? "") || (view.length === 4 ? view[2]! : 0);
  const height = parseFloat(root.getAttribute("height") ?? "") || (view.length === 4 ? view[3]! : 0);
  if (!(width > 0 && height > 0 && Number.isFinite(width + height)))
    throw new Error("Diagram dimensions are unavailable");
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  if (!root.hasAttribute("viewBox")) root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  return { svg: new XMLSerializer().serializeToString(root), width, height };
}

const styles = `
:root{color-scheme:light dark;--bg:#f6f7f9;--fg:#1c2026;--muted:#5a6270;--line:#d3d8df;--card:#fff;--accent:#1f5fbf}
@media (prefers-color-scheme:dark){:root{--bg:#14171c;--fg:#e8ebf0;--muted:#a0a8b5;--line:#343b46;--card:#1d222a;--accent:#7fb0ff}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
body{min-height:100vh;display:flex;flex-direction:column;overflow-x:hidden}
header,footer{padding:16px}
h1{margin:0 0 4px;font-size:1.4rem;overflow-wrap:anywhere}
.meta{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:4px 16px;color:var(--muted);font-size:.9rem}
.meta li{overflow-wrap:anywhere}
.meta code{font-family:ui-monospace,Consolas,monospace}
.tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:0 16px 8px}
.tools[hidden]{display:none}
.tools button{font:inherit;min-width:44px;min-height:44px;padding:0 12px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);cursor:pointer}
.tools button:focus-visible,.stage:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.tools output{color:var(--muted);font-size:.9rem;min-width:4ch}
main{flex:1;padding:0 16px}
.stage{position:relative;overflow:auto;max-width:100%;min-height:200px;background:#fff;border:1px solid var(--line);border-radius:6px}
.stage svg{display:block;max-width:100%;height:auto}
.js .stage{overflow:hidden;height:70vh;touch-action:none;cursor:grab;-webkit-user-select:none;user-select:none}
.js .stage.dragging{cursor:grabbing}
.js .stage svg{max-width:none;position:absolute;left:0;top:0;transform-origin:0 0}
footer{color:var(--muted);font-size:.85rem}
@media print{.tools{display:none}.js .stage{height:auto;overflow:visible}.js .stage svg{position:static}}
`;

const script = `
(function(){
  document.documentElement.className+=" js";
  var stage=document.getElementById("snapshot-stage"),svg=stage.querySelector("svg");
  var tools=document.getElementById("snapshot-tools"),label=document.getElementById("snapshot-zoom");
  var w=parseFloat(svg.getAttribute("width")),h=parseFloat(svg.getAttribute("height"));
  svg.style.width=w+"px";svg.style.height=h+"px";tools.hidden=false;
  var s=1,x=0,y=0,min=0.05,max=16;
  function apply(){svg.style.transform="translate("+x+"px,"+y+"px) scale("+s+")";label.textContent=Math.round(s*100)+"%";}
  function zoomAt(f,cx,cy){var n=Math.min(max,Math.max(min,s*f));f=n/s;x=cx-(cx-x)*f;y=cy-(cy-y)*f;s=n;apply();}
  function center(f){var r=stage.getBoundingClientRect();zoomAt(f,r.width/2,r.height/2);}
  function fit(){var r=stage.getBoundingClientRect();s=Math.max(min,Math.min(1,(r.width-16)/w,(r.height-16)/h));x=(r.width-w*s)/2;y=Math.max(8,(r.height-h*s)/2);apply();}
  tools.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;var a=b.getAttribute("data-action");
    if(a==="in")center(1.25);else if(a==="out")center(0.8);else if(a==="fit")fit();});
  document.addEventListener("keydown",function(e){if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.key==="+"||e.key==="=")center(1.25);else if(e.key==="-"||e.key==="_")center(0.8);else if(e.key==="0")fit();});
  stage.addEventListener("wheel",function(e){e.preventDefault();var r=stage.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY*(e.deltaMode===1?0.05:0.0015)),e.clientX-r.left,e.clientY-r.top);},{passive:false});
  var pts=new Map(),last=0;
  function dist(){var a=[...pts.values()];return Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);}
  stage.addEventListener("pointerdown",function(e){if(e.target.closest("a"))return;stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});stage.className+=" dragging";if(pts.size===2)last=dist();});
  stage.addEventListener("pointermove",function(e){var p=pts.get(e.pointerId);if(!p)return;
    if(pts.size===1){x+=e.clientX-p.x;y+=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;apply();}
    else{p.x=e.clientX;p.y=e.clientY;var d=dist(),r=stage.getBoundingClientRect(),a=[...pts.values()];
      if(last>0)zoomAt(d/last,(a[0].x+a[1].x)/2-r.left,(a[0].y+a[1].y)/2-r.top);last=d;}});
  function up(e){pts.delete(e.pointerId);last=0;if(!pts.size)stage.className=stage.className.replace(" dragging","");}
  stage.addEventListener("pointerup",up);stage.addEventListener("pointercancel",up);
  window.addEventListener("resize",fit);fit();
})();
`;

/** Builds one self-contained, read-only HTML page for a rendered diagram. */
export async function buildSnapshotHtml(input: SnapshotInput): Promise<string> {
  const diagram = sanitizeSnapshotSvg(input.svg);
  const fingerprint = await sha256Hex(input.source);
  const csp = snapshotCspTemplate.replace("{HASH}", await sha256Base64(script));
  const date = input.snapshotDate.toISOString().slice(0, 10);
  const kind = kindLabels[input.diagramKind] ?? input.diagramKind;
  const heading = input.documentName || input.diagramTitle;
  const title = input.diagramTitle && input.diagramTitle !== heading ? `${kind}: ${input.diagramTitle}` : kind;
  const details = [
    `<li>${escapeHtml(title)}</li>`,
    `<li>Snapshot <time datetime="${date}">${date}</time></li>`,
    ...(input.versionLabel ? [`<li>Version: ${escapeHtml(input.versionLabel)}</li>`] : []),
    `<li>Source SHA-256 <code title="${fingerprint}">${fingerprint.slice(0, 12)}</code></li>`,
  ].join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(heading)} (snapshot)</title>
<style>${styles}</style>
</head>
<body>
<header>
<h1>${escapeHtml(heading)}</h1>
<ul class="meta">${details}</ul>
</header>
<div class="tools" id="snapshot-tools" role="toolbar" aria-label="Diagram zoom" hidden>
<button type="button" data-action="out" aria-label="Zoom out">&minus;</button>
<button type="button" data-action="in" aria-label="Zoom in">+</button>
<button type="button" data-action="fit" aria-label="Fit to view">Fit</button>
<output id="snapshot-zoom" aria-live="polite">100%</output>
</div>
<main>
<div class="stage" id="snapshot-stage" role="group" aria-label="${escapeHtml(`${title} diagram`)}" tabindex="0">${diagram.svg}</div>
</main>
<footer>Made with PlantUML Ultimate. This file is a read-only snapshot and works offline.</footer>
<script>${script}</script>
</body>
</html>
`;
}
