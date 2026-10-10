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
      <div className="theme-gallery" role="group" aria-label="Featured themes">
        {CURATED_THEMES.map((theme) => {
          const source = sourceFor(diagramKind, theme);
          const svg = previews.get(source);
          return (
            <button type="button" key={theme} aria-pressed={value === theme} onClick={() => onChange(theme)}>
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
