// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { defaultExportOptions, prepareExportSvg } from "../export-preview";
import { sanitizeSnapshotSvg } from "../features/snapshot/snapshot-html";
import { rendererFrameDocument } from "./renderer-frame";
import { sanitizeSvg } from "./sanitize-svg";
import { pngDataUrl, spriteCanvas } from "./sprite-canvas";

/**
 * A raster sprite reaches the user as an `<image href="data:image/png;base64,...">` that the engine wrote.
 * Each step between the renderer and a file must keep that image byte for byte. The sprite below is made by the
 * same writer the worker uses.
 */
const rgba = Uint8ClampedArray.from({ length: 8 * 8 * 4 }, (_, i) => (i % 4 === 3 ? 255 : (i * 29) % 256));
const sprite = pngDataUrl(8, 8, rgba);
const diagram = (images: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="80" height="40" viewBox="0 0 80 40">${images}</svg>`;
const hrefsOf = (svg: string) =>
  [...new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("image")].map(
    (image) => image.getAttribute("href") ?? image.getAttribute("xlink:href"),
  );

describe("raster sprites on the way out", () => {
  it("survive the preview sanitiser unchanged", () => {
    expect(hrefsOf(sanitizeSvg(diagram(`<image x="2" y="2" width="8" height="8" href="${sprite}"/>`)))).toEqual([
      sprite,
    ]);
    // The engine writes both attributes; either form must stay.
    expect(hrefsOf(sanitizeSvg(diagram(`<image width="8" height="8" xlink:href="${sprite}"/>`)))).toEqual([sprite]);
  });

  it.each(["svg", "png", "pdf"] as const)("survive the export dialog's second pass (%s)", (format) => {
    const out = prepareExportSvg(diagram(`<image width="8" height="8" href="${sprite}"/>`), {
      ...defaultExportOptions,
      format,
    });
    expect(hrefsOf(out.svg)).toEqual([sprite]);
  });

  it("survive the snapshot sanitiser, which keeps only embedded raster images", () => {
    const out = sanitizeSnapshotSvg(diagram(`<image width="8" height="8" href="${sprite}"/>`));
    expect(hrefsOf(out.svg)).toEqual([sprite]);
  });

  it("are the only image data the snapshot keeps", () => {
    const out = sanitizeSnapshotSvg(
      diagram(
        [
          `<image href="${sprite}"/>`,
          `<image href="https://tracker.example/p.png"/>`,
          `<image href="//tracker.example/p.png"/>`,
          `<image href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="/>`,
          `<image href="data:text/html;base64,PGI+"/>`,
          `<image href="blob:https://example.com/x"/>`,
          `<image href="javascript:alert(1)"/>`,
        ].join(""),
      ),
    );
    expect(hrefsOf(out.svg).filter(Boolean)).toEqual([sprite]);
    expect(out.svg).not.toMatch(/tracker|svg\+xml|text\/html|blob:|javascript:/);
  });

  it("never leave the preview sanitiser as script or a script URL", () => {
    const out = sanitizeSvg(diagram(`<image href="javascript:alert(1)"/><image href="${sprite}" onload="alert(1)"/>`));
    expect(out).not.toMatch(/javascript:|onload/);
    expect(hrefsOf(out).filter(Boolean)).toEqual([sprite]);
  });

  // The preview sanitiser (DOMPurify's SVG profile) leaves http(s), protocol-relative and other data: hrefs on
  // <image> in place. The engine never writes them (a remote <img:> produces nothing; see tests/e2e/
  // sprites-exports.spec.ts), the preview frame's CSP blocks them, and the snapshot sanitiser removes them, but
  // an allow-list in sanitizeSvg would make that a guarantee of the sanitiser itself. Reported in I7a, not changed.
  it.todo("restricts <image> hrefs to data:image/png in the shared sanitiser");
});

describe("the renderer frame that hosts the worker", () => {
  it("allows data: images and nothing that reaches the network", () => {
    const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(rendererFrameDocument("test"))![1]!;
    const directive = (name: string) =>
      policy
        .split(";")
        .find((part) => part.trim().startsWith(`${name} `))
        ?.trim();
    expect(directive("img-src")).toBe("img-src data:");
    expect(directive("connect-src")).toBe("connect-src 'none'");
    expect(directive("default-src")).toBe("default-src 'none'");
  });
});

describe("the worker's sprite canvas", () => {
  it("adds pixel buffers and a PNG writer to the text context and nothing that loads or draws an image", () => {
    const measure = { font: "", measureText: () => ({ width: 1 }) };
    const context = spriteCanvas(() => measure).getContext();
    const own = Object.keys(context).sort();
    expect(own).toEqual(["createImageData", "putImageData"]);
    for (const loader of ["drawImage", "createPattern", "getImageData", "fetch", "Image", "decode"]) {
      expect(loader in context).toBe(false);
    }
    expect(typeof context.measureText).toBe("function");
  });
});
