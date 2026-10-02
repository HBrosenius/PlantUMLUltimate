import DOMPurify from "dompurify";

export function sanitizeSvg(svg: string): string {
  const sanitized = DOMPurify.sanitize(svg, {
    RETURN_DOM_FRAGMENT: true,
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "style", "foreignObject", "iframe", "object", "embed"],
    FORBID_ATTR: ["srcdoc"],
  });
  // XML serialization preserves SVG attribute casing and escapes decoded attribute values.
  return new XMLSerializer().serializeToString(sanitized);
}
