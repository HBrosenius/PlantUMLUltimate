// @vitest-environment jsdom
import { expect, it } from "vitest";
import { rasterExportError, rasterExportSize, svgRasterDimensions } from "./raster-export-limits";

it("checks scaled total area and each side at the existing application limits", () => {
  expect(rasterExportSize(8000, 1000, 2).supported).toBe(true);
  expect(rasterExportSize(8000, 1001, 2).supported).toBe(false);
  expect(rasterExportSize(16384, 1, 1).supported).toBe(true);
  expect(rasterExportSize(16385, 1, 1).supported).toBe(false);
  expect(rasterExportSize(1000, 8200, 2).supported).toBe(false);
  expect(rasterExportSize(1000, 1000, 2).memoryMiB).toBe(16);
  for (const value of [0, -1, NaN, Infinity]) expect(rasterExportSize(value, 100, 2).supported).toBe(false);
});

it("offers a supported lower scale or SVG when no raster scale fits", () => {
  expect(rasterExportError(8200, 1000, 2)).toContain("Choose 1×");
  expect(rasterExportError(20000, 1000, 3)).toContain("Export SVG or reduce");
  expect(rasterExportError(100, 100, 3)).toBeUndefined();
});

it("preflights absolute dimensions and leaves relative dimensions to the decoder guard", () => {
  expect(svgRasterDimensions('<svg width="8200px" height="1000"/>')).toEqual({ width: 8200, height: 1000 });
  expect(svgRasterDimensions('<svg width="100%" height="100%" viewBox="0 0 8200 1000"/>')).toBeUndefined();
});
