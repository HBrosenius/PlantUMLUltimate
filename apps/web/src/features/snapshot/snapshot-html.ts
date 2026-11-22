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

/** One diagram of a whole-document snapshot: its rendered SVG, or the reason it could not be rendered. */
export interface SnapshotDiagram {
  /** Stable diagram id; also accepted as an in-document link target. */
  id: string;
  title: string;
  kind: string;
  /** Diagram source. Only its SHA-256 fingerprint is embedded, never the text. */
  source: string;
  /** Decorated export SVG. Absent when rendering failed. */
  svg?: string | undefined;
  /** Why the diagram could not be rendered. */
  error?: string | undefined;
}

/** A project link between two diagrams (zero-based indexes into the diagram list). */
export interface SnapshotRelation {
  from: number;
  to: number;
  kind: "represents" | "implements" | "relates";
}

export interface SnapshotDocumentInput {
  documentName: string;
  diagrams: readonly SnapshotDiagram[];
  relations?: readonly SnapshotRelation[] | undefined;
  snapshotDate: Date;
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

export interface SanitizeSnapshotOptions {
  /** Prefix for every element id and in-page reference, so several diagrams can share one page. */
  idPrefix?: string | undefined;
  /** Maps a link target that names another diagram of the document to its in-page anchor. */
  resolveDiagramLink?: ((href: string) => string | undefined) | undefined;
}

/**
 * Sanitises the diagram SVG again for embedding in a standalone page: DOMPurify (no script, style,
 * foreignObject or event attributes) plus strict link and image rules. Returns the serialised root and its size.
 */
export function sanitizeSnapshotSvg(
  svg: string,
  options: SanitizeSnapshotOptions = {},
): { svg: string; width: number; height: number } {
  const fragment = sanitizeSvgFragment(svg);
  const root = fragment.firstElementChild;
  if (!root || root.localName !== "svg") throw new Error("The diagram did not produce an SVG image");
  const elements = [...root.querySelectorAll("*"), root];
  const prefix = options.idPrefix ?? "";
  const ids = new Set<string>();
  if (prefix)
    for (const element of elements) {
      const id = element.getAttribute("id");
      if (!id) continue;
      ids.add(id);
      element.setAttribute("id", prefix + id);
    }
  const local = (id: string) => (ids.has(id) ? prefix + id : id);
  for (const element of elements) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (ids.size > 0 && attribute.value.includes("url(")) {
        element.setAttribute(
          attribute.name,
          attribute.value.replace(
            /url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g,
            (_match, quote: string, id: string) => `url(${quote}#${local(id)}${quote})`,
          ),
        );
      }
      if (name !== "href" && name !== "xlink:href") continue;
      const value = attribute.value.trim();
      if (element.localName === "a") {
        const diagramAnchor = options.resolveDiagramLink?.(value);
        if (diagramAnchor) {
          element.setAttribute(attribute.name, diagramAnchor);
          continue;
        }
        if (value.startsWith("#")) {
          if (ids.size > 0) element.setAttribute(attribute.name, `#${local(value.slice(1))}`);
          continue;
        }
        let allowed: boolean;
        try {
          allowed = externalProtocols.has(new URL(value).protocol);
        } catch {
          allowed = false;
        }
        if (!allowed) element.removeAttribute(attribute.name);
      } else if (value.startsWith("#")) {
        if (ids.size > 0) element.setAttribute(attribute.name, `#${local(value.slice(1))}`);
      } else if (!safeImageData.test(value)) {
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

const normalizeRef = (text: string): string => {
  let value = text.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    /* Keep the raw text. */
  }
  return value
    .replace(/^#/, "")
    .replace(/\.(pumlu|puml|plantuml)$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
};

/**
 * Resolves `[[…]]` link targets to diagrams of the same document. A target matches a diagram's title or
 * id (with an optional leading `#` and file extension), or `diagram-<n>`. A title shared by several
 * diagrams is ambiguous and matches none, so a link is never silently sent to the wrong diagram.
 */
export function createDiagramLinkResolver(
  diagrams: ReadonlyArray<Pick<SnapshotDiagram, "id" | "title">>,
): (href: string) => string | undefined {
  const owners = new Map<string, Set<number>>();
  const claim = (key: string, index: number) => {
    if (!key) return;
    const set = owners.get(key) ?? new Set<number>();
    set.add(index);
    owners.set(key, set);
  };
  diagrams.forEach((diagram, index) => {
    claim(normalizeRef(diagram.title), index);
    claim(normalizeRef(diagram.id), index);
    claim(`diagram-${index + 1}`, index);
  });
  return (href) => {
    const matches = owners.get(normalizeRef(href));
    if (!matches || matches.size !== 1) return undefined;
    return `#diagram-${[...matches][0]! + 1}`;
  };
}

const styles = `
:root{color-scheme:light dark;--bg:#f6f7f9;--fg:#1c2026;--muted:#5a6270;--line:#d3d8df;--card:#fff;--accent:#1f5fbf;--error:#a4262c}
@media (prefers-color-scheme:dark){:root{--bg:#14171c;--fg:#e8ebf0;--muted:#a0a8b5;--line:#343b46;--card:#1d222a;--accent:#7fb0ff;--error:#ff9a9a}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
html{scroll-behavior:smooth}
body{min-height:100vh;display:flex;flex-direction:column;overflow-x:hidden}
header,footer{padding:16px}
h1{margin:0 0 4px;font-size:1.4rem;overflow-wrap:anywhere}
h2{margin:0;font-size:1.15rem;overflow-wrap:anywhere}
a{color:var(--accent)}
.meta{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:4px 16px;color:var(--muted);font-size:.9rem}
.meta li{overflow-wrap:anywhere}
code{font-family:ui-monospace,Consolas,monospace}
.contents{padding:0 16px 8px}
.contents ol{margin:0;padding-left:1.4rem}
.contents li{overflow-wrap:anywhere}
.kind{color:var(--muted);font-size:.85rem}
.toc-menu{display:none;border:1px solid var(--line);border-radius:6px;background:var(--card)}
.toc-menu summary{min-height:44px;padding:10px 12px;cursor:pointer;font-weight:600}
.toc-menu ol{padding:0 12px 12px 2.2rem}
.toc-menu li{padding:6px 0}
@media (max-width:640px){.toc-list{display:none}.toc-menu{display:block}}
.diagram{margin:0 0 24px;scroll-margin-top:8px}
.diagram-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 12px;padding:8px 0}
.related{margin:0 0 8px;color:var(--muted);font-size:.9rem}
.failed{margin:0;padding:12px;border:1px solid var(--error);border-radius:6px;color:var(--error);background:var(--card);overflow-wrap:anywhere}
.tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:0 0 8px}
.tools[hidden]{display:none}
.tools button{font:inherit;min-width:44px;min-height:44px;padding:0 12px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);cursor:pointer}
.tools button:focus-visible,.stage:focus-visible,.toc-menu summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.tools output{color:var(--muted);font-size:.9rem;min-width:4ch}
main{flex:1;padding:0 16px}
.stage{position:relative;overflow:auto;max-width:100%;min-height:200px;background:#fff;border:1px solid var(--line);border-radius:6px}
.stage svg{display:block;max-width:100%;height:auto}
.js .stage{overflow:hidden;height:70vh;touch-action:none;cursor:grab;-webkit-user-select:none;user-select:none}
.js .stage.dragging{cursor:grabbing}
.js .stage svg{max-width:none;position:absolute;left:0;top:0;transform-origin:0 0}
footer{color:var(--muted);font-size:.85rem}
@media print{.tools,.toc-menu{display:none}.diagram{break-inside:avoid-page}.js .stage{height:auto;overflow:visible}.js .stage svg{position:static}}
`;

const script = `
(function(){
  document.documentElement.className+=" js";
  var views=[],current=null;
  function setup(section){
    var stage=section.querySelector(".stage"),svg=stage.querySelector("svg");
    var tools=section.querySelector(".tools"),label=section.querySelector("output");
    var w=parseFloat(svg.getAttribute("width")),h=parseFloat(svg.getAttribute("height"));
    svg.style.width=w+"px";svg.style.height=h+"px";tools.hidden=false;
    var s=1,x=0,y=0,min=0.05,max=16;
    function apply(){svg.style.transform="translate("+x+"px,"+y+"px) scale("+s+")";label.textContent=Math.round(s*100)+"%";}
    function zoomAt(f,cx,cy){var n=Math.min(max,Math.max(min,s*f));f=n/s;x=cx-(cx-x)*f;y=cy-(cy-y)*f;s=n;apply();}
    function center(f){var r=stage.getBoundingClientRect();zoomAt(f,r.width/2,r.height/2);}
    function fit(){var r=stage.getBoundingClientRect();s=Math.max(min,Math.min(1,(r.width-16)/w,(r.height-16)/h));x=(r.width-w*s)/2;y=Math.max(8,(r.height-h*s)/2);apply();}
    var view={center:center,fit:fit};
    views.push(view);
    section.addEventListener("pointerover",function(){current=view;});
    section.addEventListener("focusin",function(){current=view;});
    tools.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;current=view;var a=b.getAttribute("data-action");
      if(a==="in")center(1.25);else if(a==="out")center(0.8);else if(a==="fit")fit();});
    stage.addEventListener("wheel",function(e){e.preventDefault();var r=stage.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY*(e.deltaMode===1?0.05:0.0015)),e.clientX-r.left,e.clientY-r.top);},{passive:false});
    var pts=new Map(),last=0;
    function dist(){var a=[...pts.values()];return Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);}
    stage.addEventListener("pointerdown",function(e){if(e.target.closest("a"))return;current=view;stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId,{x:e.clientX,y:e.clientY});stage.className+=" dragging";if(pts.size===2)last=dist();});
    stage.addEventListener("pointermove",function(e){var p=pts.get(e.pointerId);if(!p)return;
      if(pts.size===1){x+=e.clientX-p.x;y+=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;apply();}
      else{p.x=e.clientX;p.y=e.clientY;var d=dist(),r=stage.getBoundingClientRect(),a=[...pts.values()];
        if(last>0)zoomAt(d/last,(a[0].x+a[1].x)/2-r.left,(a[0].y+a[1].y)/2-r.top);last=d;}});
    function up(e){pts.delete(e.pointerId);last=0;if(!pts.size)stage.className=stage.className.replace(" dragging","");}
    stage.addEventListener("pointerup",up);stage.addEventListener("pointercancel",up);
    fit();
  }
  [].forEach.call(document.querySelectorAll("section.diagram"),function(section){if(section.querySelector(".stage"))setup(section);});
  document.addEventListener("keydown",function(e){if(e.ctrlKey||e.metaKey||e.altKey)return;
    var v=current||views[0];if(!v)return;
    if(e.key==="+"||e.key==="=")v.center(1.25);else if(e.key==="-"||e.key==="_")v.center(0.8);else if(e.key==="0")v.fit();});
  window.addEventListener("resize",function(){views.forEach(function(v){v.fit();});});
})();
`;

const relationVerbs: Record<SnapshotRelation["kind"], { out: string; in: string }> = {
  represents: { out: "represents", in: "represented by" },
  implements: { out: "implements", in: "implemented by" },
  relates: { out: "relates to", in: "relates to" },
};

function relatedLinks(
  index: number,
  diagrams: readonly SnapshotDiagram[],
  relations: readonly SnapshotRelation[] | undefined,
): string {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const relation of relations ?? []) {
    const outgoing = relation.from === index;
    const other = outgoing ? relation.to : relation.from;
    if ((relation.from !== index && relation.to !== index) || other === index || !diagrams[other]) continue;
    const verb = relationVerbs[relation.kind][outgoing ? "out" : "in"];
    const key = `${verb}|${other}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(`${escapeHtml(verb)} <a href="#diagram-${other + 1}">${escapeHtml(diagrams[other]!.title)}</a>`);
  }
  return items.length ? `<p class="related">Linked diagrams: ${items.join("; ")}</p>\n` : "";
}

function renderSection(
  diagram: SnapshotDiagram,
  index: number,
  diagrams: readonly SnapshotDiagram[],
  relations: readonly SnapshotRelation[] | undefined,
  resolveDiagramLink: (href: string) => string | undefined,
  multi: boolean,
  fingerprint: string,
): string {
  const number = index + 1;
  const kind = kindLabels[diagram.kind] ?? diagram.kind;
  let body = "";
  let error = diagram.error;
  if (!error) {
    try {
      const sanitized = sanitizeSnapshotSvg(diagram.svg ?? "", {
        ...(multi ? { idPrefix: `d${number}-` } : {}),
        resolveDiagramLink,
      });
      body = `<div class="tools" role="toolbar" aria-label="${escapeHtml(`${diagram.title} zoom`)}" hidden>
<button type="button" data-action="out" aria-label="Zoom out">&minus;</button>
<button type="button" data-action="in" aria-label="Zoom in">+</button>
<button type="button" data-action="fit" aria-label="Fit to view">Fit</button>
<output id="snapshot-zoom-${number}" aria-live="polite">100%</output>
</div>
<div class="stage" id="snapshot-stage-${number}" role="group" aria-label="${escapeHtml(`${kind}: ${diagram.title}`)}" tabindex="0">${sanitized.svg}</div>`;
    } catch (cause) {
      // One diagram that cannot be embedded must not sink a whole-document snapshot.
      if (!multi) throw cause;
      error = cause instanceof Error ? cause.message : "The diagram could not be embedded";
    }
  }
  if (error) body = `<p class="failed" role="alert">This diagram could not be rendered: ${escapeHtml(error)}</p>`;
  const head = multi
    ? `<div class="diagram-head"><h2 id="diagram-${number}-title">${escapeHtml(diagram.title)}</h2><span class="kind">${escapeHtml(kind)}</span><span class="kind">SHA-256 <code>${fingerprint.slice(0, 12)}</code></span></div>\n`
    : "";
  return `<section class="diagram" id="diagram-${number}"${multi ? ` aria-labelledby="diagram-${number}-title"` : ""}>
${head}${relatedLinks(index, diagrams, relations)}${body}
</section>`;
}

interface PageParts {
  heading: string;
  details: string[];
  /** Present for a whole-document page. */
  contents?: string;
  sections: string;
}

async function buildPage(parts: PageParts, snapshotDate: Date, versionLabel: string | undefined): Promise<string> {
  const csp = snapshotCspTemplate.replace("{HASH}", await sha256Base64(script));
  const date = snapshotDate.toISOString().slice(0, 10);
  const details = [
    ...parts.details,
    `<li>Snapshot <time datetime="${date}">${date}</time></li>`,
    ...(versionLabel ? [`<li>Version: ${escapeHtml(versionLabel)}</li>`] : []),
  ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(parts.heading)} (snapshot)</title>
<style>${styles}</style>
</head>
<body>
<header>
<h1>${escapeHtml(parts.heading)}</h1>
<ul class="meta">${details.join("")}</ul>
</header>
${parts.contents ?? ""}<main>
${parts.sections}
</main>
<footer>Made with PlantUML Ultimate. This file is a read-only snapshot and works offline.</footer>
<script>${script}</script>
</body>
</html>
`;
}

/** Builds one self-contained, read-only HTML page for a rendered diagram. */
export async function buildSnapshotHtml(input: SnapshotInput): Promise<string> {
  const fingerprint = await sha256Hex(input.source);
  const kind = kindLabels[input.diagramKind] ?? input.diagramKind;
  const heading = input.documentName || input.diagramTitle;
  const title = input.diagramTitle && input.diagramTitle !== heading ? `${kind}: ${input.diagramTitle}` : kind;
  const diagram: SnapshotDiagram = {
    id: "diagram",
    title: input.diagramTitle || heading,
    kind: input.diagramKind,
    source: input.source,
    svg: input.svg,
  };
  return buildPage(
    {
      heading,
      details: [
        `<li>${escapeHtml(title)}</li>`,
        `<li>Source SHA-256 <code title="${fingerprint}">${fingerprint.slice(0, 12)}</code></li>`,
      ],
      sections: renderSection(diagram, 0, [diagram], undefined, () => undefined, false, fingerprint),
    },
    input.snapshotDate,
    input.versionLabel,
  );
}

/** Builds one self-contained page holding every diagram of a document, with contents and in-page links. */
export async function buildSnapshotDocumentHtml(input: SnapshotDocumentInput): Promise<string> {
  const { diagrams } = input;
  if (diagrams.length === 0) throw new Error("A snapshot needs at least one diagram");
  const fingerprints = await Promise.all(diagrams.map((diagram) => sha256Hex(diagram.source)));
  const combined = await sha256Hex(fingerprints.join("\n"));
  const resolve = createDiagramLinkResolver(diagrams);
  const entries = diagrams
    .map((diagram, index) => {
      const kind = kindLabels[diagram.kind] ?? diagram.kind;
      const failed = diagram.error ? " (could not be rendered)" : "";
      return `<li><a href="#diagram-${index + 1}">${escapeHtml(diagram.title)}</a> <span class="kind">${escapeHtml(kind)}${failed}</span></li>`;
    })
    .join("");
  const contents = `<nav class="contents" aria-label="Contents">
<ol class="toc-list">${entries}</ol>
<details class="toc-menu"><summary>Contents (${diagrams.length} diagrams)</summary><ol>${entries}</ol></details>
</nav>
`;
  const sections = diagrams
    .map((diagram, index) =>
      renderSection(diagram, index, diagrams, input.relations, resolve, true, fingerprints[index]!),
    )
    .join("\n");
  return buildPage(
    {
      heading: input.documentName,
      details: [
        `<li>${diagrams.length} diagrams</li>`,
        `<li>Source SHA-256 <code title="${combined}">${combined.slice(0, 12)}</code></li>`,
      ],
      contents,
      sections,
    },
    input.snapshotDate,
    input.versionLabel,
  );
}
