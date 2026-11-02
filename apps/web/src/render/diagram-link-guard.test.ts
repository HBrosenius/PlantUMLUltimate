// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { diagramLinkTarget, installDiagramLinkGuard } from "./diagram-link-guard";

const SVG = "http://www.w3.org/2000/svg";
let uninstall: (() => void) | undefined;
afterEach(() => {
  uninstall?.();
  document.body.innerHTML = "";
});

function svgLink(href: string): SVGTextElement {
  const svg = document.createElementNS(SVG, "svg");
  const anchor = document.createElementNS(SVG, "a");
  anchor.setAttribute("href", href);
  const text = document.createElementNS(SVG, "text");
  anchor.append(text);
  svg.append(anchor);
  document.body.append(svg);
  return text;
}

describe("diagram link guard", () => {
  it("accepts only web and mail links", () => {
    const anchor = document.createElementNS(SVG, "a");
    for (const [href, expected] of [
      ["https://example.com/a", "https://example.com/a"],
      ["mailto:team@example.com", "mailto:team@example.com"],
      ["javascript:alert(1)", undefined],
      ["data:text/html,hi", undefined],
      ["#section", undefined],
      ["", undefined],
    ] as const) {
      anchor.setAttribute("href", href);
      expect(diagramLinkTarget(anchor, "https://plantuml.example/")).toBe(expected);
    }
  });

  it("confirms and opens diagram links in a separate tab instead of navigating the editor", () => {
    const confirmOpen = vi.fn(() => true);
    const open = vi.fn();
    uninstall = installDiagramLinkGuard(document, confirmOpen, open);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    svgLink("https://example.com/spec").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(confirmOpen).toHaveBeenCalledWith("https://example.com/spec");
    expect(open).toHaveBeenCalledWith("https://example.com/spec");
  });

  it("opens nothing when the user declines or the link is unsafe", () => {
    const open = vi.fn();
    uninstall = installDiagramLinkGuard(document, () => false, open);
    svgLink("https://example.com/spec").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    uninstall();
    uninstall = installDiagramLinkGuard(document, () => true, open);
    const unsafe = new MouseEvent("click", { bubbles: true, cancelable: true });
    svgLink("javascript:alert(1)").dispatchEvent(unsafe);
    expect(unsafe.defaultPrevented).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });

  it("handles Enter before diagram editing handlers and ignores key repeats", () => {
    const open = vi.fn();
    const confirmOpen = vi.fn(() => true);
    uninstall = installDiagramLinkGuard(document, confirmOpen, open);
    const text = svgLink("https://example.com/spec");
    const edit = vi.fn();
    text.parentElement!.addEventListener("keydown", edit);
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    text.dispatchEvent(enter);
    text.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true, cancelable: true }));
    expect(enter.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledExactlyOnceWith("https://example.com/spec");
    expect(confirmOpen).toHaveBeenCalledOnce();
    expect(edit).not.toHaveBeenCalled();
  });

  it("confirms middle clicks instead of letting them bypass the guard", () => {
    const confirmOpen = vi.fn(() => true);
    const open = vi.fn();
    uninstall = installDiagramLinkGuard(document, confirmOpen, open);
    const text = svgLink("https://example.com/spec");
    const event = new MouseEvent("mouseup", { button: 1, bubbles: true, cancelable: true });
    text.dispatchEvent(event);
    const auxiliary = new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true });
    text.dispatchEvent(auxiliary);
    expect(auxiliary.defaultPrevented).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(confirmOpen).toHaveBeenCalledExactlyOnceWith("https://example.com/spec");
    expect(open).toHaveBeenCalledExactlyOnceWith("https://example.com/spec");
  });

  it("keeps link pointer presses out of diagram dragging without blocking normal link focus", () => {
    uninstall = installDiagramLinkGuard(document, () => true, vi.fn());
    const text = svgLink("https://example.com/spec");
    const drag = vi.fn();
    text.parentElement!.addEventListener("pointerdown", drag);
    const pointer = new Event("pointerdown", { bubbles: true, cancelable: true });
    text.dispatchEvent(pointer);
    expect(drag).not.toHaveBeenCalled();
    expect(pointer.defaultPrevented).toBe(false);
    uninstall();
    text.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(drag).toHaveBeenCalledOnce();
  });

  it("leaves ordinary HTML links alone", () => {
    const open = vi.fn();
    uninstall = installDiagramLinkGuard(document, () => true, open);
    const link = document.createElement("a");
    link.href = "https://example.com/help";
    document.body.append(link);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
