import { useEffect, useRef, useState } from "react";
import type { DiagramKind } from "./model";
import { PLANTUML_THEMES, setPlantUmlTheme } from "./plantuml-theme";
import { rendererLayoutEngineForDiagramKind, useRenderer } from "./render/use-renderer";
import { THEME_PREVIEW_SOURCES } from "./theme-preview-sources";

const CURATED_THEMES = ["", "cerulean", "minty", "plain", "sketchy", "cyborg"] as const;
// Small, fixed samples only. Share successful thumbnails across dialogs for this page session.
const previewCache = new Map<string, string>();
const sourceFor = (kind: DiagramKind, theme: string) =>
  setPlantUmlTheme(THEME_PREVIEW_SOURCES[kind], theme || undefined);
const themeName = (theme: string) => theme || "Default PlantUML";
const imageSource = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function ThemeGallery({
  value,
  onChange,
  diagramKind = "sequence",
  label,
}: {
  value: string;
  onChange(value: string): void;
  diagramKind?: DiagramKind;
  label: string;
}) {
  const [previews, setPreviews] = useState(() => new Map(previewCache));
  const [failed, setFailed] = useState<string[]>([]);
  const selectedSource = sourceFor(diagramKind, value);
  const next = [value, ...CURATED_THEMES]
    .map((theme) => sourceFor(diagramKind, theme))
    .find((source) => !previews.has(source) && !failed.includes(source));
  // A single renderer fills the gallery serially, selected sample first.
  const { result } = useRenderer(
    next ?? selectedSource,
    Boolean(next),
    rendererLayoutEngineForDiagramKind(diagramKind),
    "theme-gallery",
  );
  const handled = useRef<typeof result>(undefined);
  useEffect(() => {
    if (!next || !result || handled.current === result) return;
    if (result.error) {
      handled.current = result;
      setFailed((current) => [...current, next]);
      return;
    }
    if (result.source !== next) return;
    if (result.svg) {
      handled.current = result;
      previewCache.set(next, result.svg);
      if (previewCache.size > 64) previewCache.delete(previewCache.keys().next().value!);
      setPreviews(new Map(previewCache));
    }
  }, [next, result]);
  const custom = value && !PLANTUML_THEMES.some((theme) => theme === value);
  return (
    <div className="theme-picker">
      <div className="theme-gallery" role="radiogroup" aria-label="Featured themes">
        {CURATED_THEMES.map((theme) => {
          const source = sourceFor(diagramKind, theme);
          const svg = previews.get(source);
          return (
            <button
              type="button"
              role="radio"
              key={theme}
              aria-checked={value === theme}
              tabIndex={
                value === theme ||
                (!CURATED_THEMES.some((candidate) => candidate === value) && theme === CURATED_THEMES[0])
                  ? 0
                  : -1
              }
              onClick={() => onChange(theme)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const index = CURATED_THEMES.indexOf(theme);
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? CURATED_THEMES.length - 1
                      : (index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + CURATED_THEMES.length) %
                        CURATED_THEMES.length;
                onChange(CURATED_THEMES[next]!);
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
              }}
            >
              <span className="theme-thumbnail" aria-hidden="true">
                {svg ? (
                  <img src={imageSource(svg)} alt="" />
                ) : (
                  <span>{failed.includes(source) ? "Preview unavailable" : "Rendering…"}</span>
                )}
              </span>
              <span>{themeName(theme)}</span>
            </button>
          );
        })}
      </div>
      <label>
        {label}
        <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Default PlantUML</option>
          {custom && <option value={value}>{value} (from source)</option>}
          {PLANTUML_THEMES.map((theme) => (
            <option key={theme} value={theme}>
              {theme}
            </option>
          ))}
        </select>
      </label>
      <p>
        Compare featured themes above, or choose from all themes. Previews use a small sample, not your working diagram.
      </p>
      <div className="document-theme-preview" aria-label="Theme preview" aria-live="polite">
        {previews.has(selectedSource) ? (
          <div dangerouslySetInnerHTML={{ __html: previews.get(selectedSource)! }} />
        ) : (
          <span>{failed.includes(selectedSource) ? "Theme preview unavailable" : "Rendering theme preview…"}</span>
        )}
      </div>
    </div>
  );
}
