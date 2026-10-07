import DOMPurify from "dompurify";

export function sanitizeSvgFragment(svg: string): DocumentFragment {
  return DOMPurify.sanitize(svg, {
    RETURN_DOM_FRAGMENT: true,
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_ATTR: ["role"],
    FORBID_TAGS: ["script", "style", "foreignObject", "iframe", "object", "embed"],
    FORBID_ATTR: ["srcdoc"],
  });
}

export function sanitizeSvg(svg: string): string {
  const sanitized = sanitizeSvgFragment(svg);
  // XML serialization preserves SVG attribute casing and escapes decoded attribute values.
  return new XMLSerializer().serializeToString(sanitized);
}
