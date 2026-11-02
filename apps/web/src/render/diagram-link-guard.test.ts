// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { diagramLinkTarget, installDiagramLinkGuard, type DiagramLinkActions } from "./diagram-link-guard";

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
  it("waits for a menu choice and sends settings to the owning task without navigating", () => {
    const open = vi.fn();
    uninstall = installDiagramLinkGuard(document, undefined, open);
    const text = svgLink("https://example.com/spec");
    text.setAttribute("data-visual-task-id", "build");
    const task = document.createElementNS(SVG, "g");
    task.setAttribute("data-task-id", "build");
    text.closest("svg")!.append(task);
    const select = vi.fn((event: Event) => expect(event.defaultPrevented).toBe(true));
    task.addEventListener("click", select);
    text.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const menu = document.querySelector('[role="menu"]')!;
    expect(menu.textContent).toContain("https://example.com/spec");
    expect(open).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    (menu.querySelector("button") as HTMLButtonElement).click();
    expect(select).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("offers the correct member settings and opens a URL only after an explicit choice", () => {
    const open = vi.fn();
    uninstall = installDiagramLinkGuard(document, undefined, open);
    const text = svgLink("https://example.com/member");
    text.setAttribute("data-class-object-id", "portal");
    text.setAttribute("data-class-member-id", "member-1");
    const select = vi.fn();
    text.addEventListener("click", select);
    text.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    select.mockClear();
    (document.querySelector('[role="menu"] button') as HTMLButtonElement).click();
    expect(select).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
    text.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const buttons = document.querySelectorAll<HTMLButtonElement>('[role="menu"] button');
    buttons[1]!.click();
    expect(open).toHaveBeenCalledExactlyOnceWith("https://example.com/member");
  });

  it("supports menu keyboard navigation, escape, outside dismissal, and cleanup", () => {
    const open = vi.fn();
    uninstall = installDiagramLinkGuard(document, undefined, open);
    const text = svgLink("https://example.com/spec");
    text.setAttribute("data-wbs-node-id", "root");
    const click = () => text.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    click();
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement?.textContent).toBe("Open URL");
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    click();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    click();
    uninstall();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });

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

  it("offers and opens diagram links in a separate tab instead of navigating the editor", () => {
    const choose = vi.fn((actions: DiagramLinkActions) => actions.openUrl());
    const open = vi.fn();
    uninstall = installDiagramLinkGuard(document, choose, open);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    svgLink("https://example.com/spec").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(choose.mock.calls[0]![0].url).toBe("https://example.com/spec");
    expect(open).toHaveBeenCalledWith("https://example.com/spec");
  });

  it("opens nothing when the user declines or the link is unsafe", () => {
    const open = vi.fn();
    uninstall = installDiagramLinkGuard(document, () => {}, open);
    svgLink("https://example.com/spec").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    uninstall();
    uninstall = installDiagramLinkGuard(document, (actions) => actions.openUrl(), open);
    const unsafe = new MouseEvent("click", { bubbles: true, cancelable: true });
    svgLink("javascript:alert(1)").dispatchEvent(unsafe);
    expect(unsafe.defaultPrevented).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });

  it("handles Enter before diagram editing handlers and ignores key repeats", () => {
    const open = vi.fn();
    const choose = vi.fn((actions: DiagramLinkActions) => actions.openUrl());
    uninstall = installDiagramLinkGuard(document, choose, open);
    const text = svgLink("https://example.com/spec");
    const edit = vi.fn();
    text.parentElement!.addEventListener("keydown", edit);
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    text.dispatchEvent(enter);
    text.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true, cancelable: true }));
    expect(enter.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledExactlyOnceWith("https://example.com/spec");
    expect(choose).toHaveBeenCalledOnce();
    expect(edit).not.toHaveBeenCalled();
  });

  it("offers middle clicks instead of letting them bypass the guard", () => {
    const choose = vi.fn((actions: DiagramLinkActions) => actions.openUrl());
    const open = vi.fn();
    uninstall = installDiagramLinkGuard(document, choose, open);
    const text = svgLink("https://example.com/spec");
    const event = new MouseEvent("mouseup", { button: 1, bubbles: true, cancelable: true });
    text.dispatchEvent(event);
    const auxiliary = new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true });
    text.dispatchEvent(auxiliary);
    expect(auxiliary.defaultPrevented).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(choose).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledExactlyOnceWith("https://example.com/spec");
  });

  it("keeps link pointer presses out of diagram dragging without blocking normal link focus", () => {
    uninstall = installDiagramLinkGuard(document, (actions) => actions.openUrl(), vi.fn());
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
    uninstall = installDiagramLinkGuard(document, (actions) => actions.openUrl(), open);
    const link = document.createElement("a");
    link.href = "https://example.com/help";
    document.body.append(link);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
