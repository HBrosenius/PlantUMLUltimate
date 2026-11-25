import DOMPurify from "dompurify";

/** The only images a diagram may embed: inline raster data, as the engine writes for sprites and `<img:data:...>`. */
const SAFE_IMAGE_DATA = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i;
const LINK_ATTRIBUTES = ["href", "xlink:href"] as const;

/**
 * Keeps image and reference links inside the diagram. `<image>` and `<feImage>` may only show inline raster data;
 * `<use>` may only point at an element of the same SVG. Anything else (http(s), protocol-relative, other data:
 * types, blob:) is removed, so the guarantee doesn't depend on the engine or on the page's CSP.
 */
function restrictLinks(root: DocumentFragment): void {
  for (const element of root.querySelectorAll("image, feImage, feimage, use")) {
    const isUse = element.localName === "use";
    for (const name of LINK_ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value === null) continue;
      const target = value.trim();
      const allowed = isUse ? target.startsWith("#") : SAFE_IMAGE_DATA.test(target);
      if (!allowed) element.removeAttribute(name);
    }
  }
}

export function sanitizeSvgFragment(svg: string): DocumentFragment {
  const fragment = DOMPurify.sanitize(svg, {
    RETURN_DOM_FRAGMENT: true,
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_ATTR: ["role"],
    FORBID_TAGS: ["script", "style", "foreignObject", "iframe", "object", "embed"],
    FORBID_ATTR: ["srcdoc"],
  });
  restrictLinks(fragment);
  return fragment;
}

export function sanitizeSvg(svg: string): string {
  const sanitized = sanitizeSvgFragment(svg);
  // XML serialization preserves SVG attribute casing and escapes decoded attribute values.
  return new XMLSerializer().serializeToString(sanitized);
}
