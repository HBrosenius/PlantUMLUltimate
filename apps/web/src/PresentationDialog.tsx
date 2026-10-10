import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRenderer, rendererLayoutEngineForDiagramKind } from "./render/use-renderer";
import { sanitizeSvg } from "./render/sanitize-svg";
import {
  emptyPresentationReview,
  loadPresentationReview,
  presentationTargets,
  resolvePresentationAnchor,
  savePresentationReview,
  type PresentationAnchor,
  type PresentationDocument,
  type PresentationReview,
} from "./presentation-review";

export function PresentationDialog({
  documents,
  connections,
  initialId,
  onClose,
}: {
  documents: PresentationDocument[];
  connections: { from: string; to: string }[];
  initialId: string;
  onClose(): void;
}) {
  const [documentId, setDocumentId] = useState(initialId);
  const doc = documents.find((item) => item.id === documentId);
  return createPortal(
    <div className="presentation-shell" role="dialog" aria-modal="true" aria-label="Presentation and local review">
      {doc ? (
        <PresentationPage
          key={doc.id}
          doc={doc}
          connected={documents.filter((item) =>
            connections.some(
              (link) => (link.from === doc.id && link.to === item.id) || (link.to === doc.id && link.from === item.id),
            ),
          )}
          onNavigate={setDocumentId}
          onClose={onClose}
        />
      ) : (
        <>
          <p>This diagram is no longer available.</p>
          <button onClick={onClose}>Exit presentation</button>
        </>
      )}
    </div>,
    document.body,
  );
}

function PresentationPage({
  doc,
  connected,
  onNavigate,
  onClose,
}: {
  doc: PresentationDocument;
  connected: PresentationDocument[];
  onNavigate(id: string): void;
  onClose(): void;
}) {
  const [data, setData] = useState<PresentationReview>(() => {
    try {
      return loadPresentationReview(doc.id);
    } catch {
      return emptyPresentationReview();
    }
  });
  const [error, setError] = useState(() => {
    try {
      loadPresentationReview(doc.id);
      return "";
    } catch {
      return "Local review data could not be loaded. Existing storage will not be overwritten.";
    }
  });
  const [panel, setPanel] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(0);
  const [draftSteps, setDraftSteps] = useState<PresentationAnchor[]>([]);
  const [activeSteps, setActiveSteps] = useState<PresentationAnchor[]>([]);
  const [step, setStep] = useState(-1);
  const [targetKey, setTargetKey] = useState("");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [viewId, setViewId] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const exit = useRef<HTMLButtonElement>(null);
  const targets = useMemo(() => presentationTargets(doc), [doc]);
  const anchor = activeSteps[step];
  const resolution = useMemo(() => (anchor ? resolvePresentationAnchor(doc, anchor) : undefined), [doc, anchor]);
  const rendered = useRenderer(doc.source, true, rendererLayoutEngineForDiagramKind(doc.kind), doc.id);
  const svg = useMemo(
    () => (rendered.result?.source === doc.source && rendered.result?.svg ? sanitizeSvg(rendered.result.svg) : ""),
    [rendered.result?.svg, rendered.result?.source, doc.source],
  );
  const [highlightMessage, setHighlightMessage] = useState("");
  const write = (next: PresentationReview) => {
    if (error) return false;
    try {
      savePresentationReview(doc.id, next);
      setData(next);
      return true;
    } catch {
      setError("Browser storage could not save this review. Your last saved review is retained.");
      return false;
    }
  };
  useEffect(() => {
    exit.current?.focus();
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (panel) setPanel(false);
        else onClose();
        return;
      }
      if (!(event.target instanceof Node) || !root.current?.contains(event.target)) return;
      const input = event.target instanceof Element && event.target.closest("input, textarea, select");
      if (!input && ["ArrowRight", "ArrowLeft"].includes(event.key)) {
        event.preventDefault();
        setStep((value) =>
          Math.max(0, Math.min(activeSteps.length - 1, value + (event.key === "ArrowRight" ? 1 : -1))),
        );
      }
      if (event.key === "Tab") {
        const focusable = [
          ...root.current!.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
          ),
        ];
        const first = focusable[0],
          last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      event.stopPropagation();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [panel, activeSteps.length, onClose]);
  useLayoutEffect(() => {
    if (canvas.current) canvas.current.innerHTML = svg;
  }, [svg]);
  useLayoutEffect(() => {
    const surface = stage.current;
    const diagram = canvas.current?.querySelector("svg");
    if (!surface || !diagram) return;
    const fit = () => {
      const box = diagram.viewBox?.baseVal;
      const width = box?.width || Number.parseFloat(diagram.getAttribute("width") ?? "0");
      const height = box?.height || Number.parseFloat(diagram.getAttribute("height") ?? "0");
      if (width > 0 && height > 0)
        setFitWidth(Math.max(1, Math.min(surface.clientWidth - 32, ((surface.clientHeight - 32) * width) / height)));
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [svg]);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    element.querySelectorAll(".presentation-highlight").forEach((item) => item.remove());
    if (!anchor) {
      setHighlightMessage("");
      return;
    }
    if (!resolution?.target) {
      setHighlightMessage(`${resolution?.state} anchor. Review the original source context.`);
      return;
    }
    if (!svg) {
      setHighlightMessage("Waiting for the highlighted diagram revision. Original source context remains available.");
      return;
    }
    const matching = [...element.querySelectorAll<SVGTextElement>("svg text")].filter(
      (item) => item.textContent?.trim() === resolution.target!.label.trim(),
    );
    if (matching.length !== 1) {
      setHighlightMessage("No unique rendered label. Review the source context instead.");
      return;
    }
    const label = matching[0]!;
    const box = label.getBBox();
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(box.x - 5));
    rect.setAttribute("y", String(box.y - 4));
    rect.setAttribute("width", String(box.width + 10));
    rect.setAttribute("height", String(box.height + 8));
    rect.classList.add("presentation-highlight");
    label.parentNode?.appendChild(rect);
    label.scrollIntoView({ block: "nearest", inline: "nearest" });
    setHighlightMessage(`${resolution.state}: ${resolution.target.label}`);
  }, [svg, anchor, resolution, zoom]);
  const chooseView = (id: string) => {
    setViewId(id);
    const view = data.views.find((item) => item.id === id);
    setActiveSteps(view?.steps ?? []);
    setStep(view?.steps.length ? 0 : -1);
    setZoom(view?.zoom ?? 1);
  };
  return (
    <div ref={root} className={`presentation-page${panel ? " with-review" : ""}`}>
      <header>
        <strong>{doc.name}</strong>
        <label>
          Named view{" "}
          <select aria-label="Named view" value={viewId} onChange={(event) => chooseView(event.target.value)}>
            <option value="">Whole diagram</option>
            {data.views.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))}
          disabled={zoom <= 0.25}
          aria-label="Zoom out presentation"
        >
          −
        </button>
        <button
          onClick={() => {
            setZoom(1);
            stage.current?.scrollTo(0, 0);
          }}
        >
          Fit
        </button>
        <button
          onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
          disabled={zoom >= 3}
          aria-label="Zoom in presentation"
        >
          +
        </button>
        <button onClick={() => setPanel((value) => !value)} aria-expanded={panel}>
          Views & local review
        </button>
        <button ref={exit} onClick={onClose}>
          Exit presentation
        </button>
      </header>
      <div className="presentation-content">
        <main>
          <div ref={stage} className="presentation-stage" tabIndex={0} aria-label="Read-only presentation diagram">
            {rendered.status === "rendering" && <p role="status">Rendering…</p>}
            {rendered.result?.error && <p role="alert">{rendered.result.error}</p>}
            <div
              ref={canvas}
              className="presentation-canvas"
              style={{ width: fitWidth ? `${fitWidth * zoom}px` : "100%" }}
            />
          </div>
          <footer>
            <button disabled={step <= 0} onClick={() => setStep(step - 1)}>
              Previous highlight
            </button>
            <span role="status">
              {anchor ? `${step + 1} / ${activeSteps.length} · ${highlightMessage}` : "Whole diagram"}
            </span>
            <button disabled={step >= activeSteps.length - 1} onClick={() => setStep(step + 1)}>
              Next highlight
            </button>
            {connected.length > 0 && (
              <label>
                Connected diagrams{" "}
                <select
                  aria-label="Connected diagrams"
                  value=""
                  onChange={(event) => event.target.value && onNavigate(event.target.value)}
                >
                  <option value="">Choose diagram…</option>
                  {connected.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </footer>
        </main>
        {panel && (
          <aside aria-label="Views and local review">
            <h2>Views & local review</h2>
            <p>
              Only you in this browser. Notes and views are not included in files, exports or collaboration links.
              Browser data removal deletes them. No sharing or source-editing permission is granted.
            </p>
            {error && <p role="alert">{error}</p>}
            <label>
              Diagram object
              <select
                aria-label="Diagram object"
                value={targetKey}
                onChange={(event) => setTargetKey(event.target.value)}
              >
                <option value="">Choose object…</option>
                {targets.map((target, index) => (
                  <option key={`${target.key}:${index}`} value={target.key}>
                    {target.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={!targetKey || targets.filter((item) => item.key === targetKey).length !== 1}
              onClick={() => {
                const target = targets.find((item) => item.key === targetKey)!;
                const next = [...draftSteps, target];
                setDraftSteps(next);
                setActiveSteps(next);
                setStep(next.length - 1);
                setViewId("");
              }}
            >
              Add highlight step
            </button>
            <ol>
              {draftSteps.map((item, index) => (
                <li key={index}>
                  {item.label}{" "}
                  <button
                    aria-label={`Remove highlight step ${index + 1}`}
                    onClick={() => {
                      const next = draftSteps.filter((_, i) => i !== index);
                      setDraftSteps(next);
                      setActiveSteps(next);
                      setStep(next.length ? 0 : -1);
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
            <label>
              View name
              <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
            </label>
            <button
              disabled={!!error || !name.trim() || data.views.some((view) => view.name === name.trim())}
              onClick={() => {
                const view = { id: crypto.randomUUID(), name: name.trim(), steps: draftSteps, zoom };
                if (write({ ...data, views: [...data.views, view] })) {
                  setViewId(view.id);
                  setName("");
                }
              }}
            >
              Save named view
            </button>
            <button
              disabled={!viewId || !!error}
              onClick={() => {
                write({ ...data, views: data.views.filter((view) => view.id !== viewId) });
                chooseView("");
              }}
            >
              Delete named view
            </button>
            <h3>Personal review notes</h3>
            <label>
              Review note
              <textarea value={text} maxLength={4000} onChange={(event) => setText(event.target.value)} />
            </label>
            <button
              disabled={
                !!error || !text.trim() || !targetKey || targets.filter((item) => item.key === targetKey).length !== 1
              }
              onClick={() => {
                const saved = write({
                  ...data,
                  notes: [
                    ...data.notes,
                    {
                      id: crypto.randomUUID(),
                      text: text.trim(),
                      createdAt: new Date().toISOString(),
                      anchor: targets.find((item) => item.key === targetKey)!,
                      resolved: false,
                    },
                  ],
                });
                if (saved) setText("");
              }}
            >
              Add anchored note
            </button>
            {data.notes.map((note) => {
              const state = resolvePresentationAnchor(doc, note.anchor);
              return (
                <article key={note.id} className="presentation-note">
                  <strong>
                    {note.anchor.label} · {state.state}
                    {note.resolved ? " · Resolved" : ""}
                  </strong>
                  <p>{note.text}</p>
                  <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString()}</time>
                  <details>
                    <summary>Original revision context</summary>
                    <pre>{note.anchor.excerpt}</pre>
                  </details>
                  <button
                    onClick={() => {
                      setActiveSteps([note.anchor]);
                      setStep(0);
                    }}
                  >
                    Show note anchor
                  </button>
                  <button
                    disabled={!!error}
                    onClick={() =>
                      write({
                        ...data,
                        notes: data.notes.map((item) =>
                          item.id === note.id ? { ...item, resolved: !item.resolved } : item,
                        ),
                      })
                    }
                  >
                    {note.resolved ? "Reopen note" : "Resolve note"}
                  </button>
                  <button
                    disabled={!!error}
                    onClick={() => write({ ...data, notes: data.notes.filter((item) => item.id !== note.id) })}
                  >
                    Delete note
                  </button>
                </article>
              );
            })}
            {anchor && (
              <details>
                <summary>Highlight source context</summary>
                <pre>{anchor.excerpt}</pre>
              </details>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
