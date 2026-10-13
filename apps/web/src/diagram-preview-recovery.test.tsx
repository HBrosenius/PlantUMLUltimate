// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { parseUseCase } from "@plantuml-studio/diagram-usecase";
import { parseActivity } from "@plantuml-studio/diagram-activity";
import { ActivityDiagramPreview } from "./ActivityDiagramPreview";
import { SequenceDiagramPreview } from "./SequenceDiagramPreview";
import { UseCaseDiagramPreview } from "./UseCaseDiagramPreview";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const common = {
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"></svg>',
  zoom: 1,
  renderStatus: "idle" as const,
  onZoomChange: vi.fn(),
  onRenderRetry: vi.fn(),
};

it("keeps Activity connection feedback through unrelated renders", () => {
  const callback = vi.fn();
  const props: ComponentProps<typeof ActivityDiagramPreview> = {
    ...common,
    document: parseActivity(""),
    onSelect: callback,
    onBackgroundSelect: callback,
    onReorder: callback,
    onConnect: callback,
    onAttachNote: callback,
  };
  const view = render(<ActivityDiagramPreview {...props} />);
  view.rerender(<ActivityDiagramPreview {...props} renderStatus="error" renderError="Render failed" />);
  expect(view.getByRole("alert").textContent).toContain("last successful diagram");
  expect(view.getByRole("button", { name: "Retry rendering" })).toBeTruthy();
  view.rerender(<ActivityDiagramPreview {...props} />);
  const svg = view.container.querySelector(".diagram svg")!;
  const overlay = document.createElementNS("http://www.w3.org/2000/svg", "line");
  overlay.classList.add("activity-connection-preview");
  svg.append(overlay);
  view.rerender(
    <ActivityDiagramPreview {...props} initialFit={{ documentId: "doc", fit: false, scroll: { left: 10, top: 20 } }} />,
  );
  expect(overlay.isConnected).toBe(true);
  view.rerender(<ActivityDiagramPreview {...props} selectedId="different-selection" />);
  expect(overlay.isConnected).toBe(false);
});

it("keeps the Sequence SVG and active drag overlay through recovery metadata renders", () => {
  const callback = vi.fn();
  const props: ComponentProps<typeof SequenceDiagramPreview> = {
    ...common,
    participants: [],
    messages: [],
    structures: [],
    onParticipantSelect: callback,
    onMessageSelect: callback,
    onStructureSelect: callback,
    onParticipantReorder: callback,
    onMessageReorder: callback,
    onTimelineReorder: callback,
    onMessageReconnect: callback,
    onStructureReconnect: callback,
    onMessageCreate: callback,
    onMessageExternalize: callback,
  };
  const view = render(<SequenceDiagramPreview {...props} />);
  view.rerender(<SequenceDiagramPreview {...props} renderStatus="error" renderError="Render failed" />);
  expect(view.getByRole("alert").textContent).toContain("last successful diagram");
  expect(view.getByRole("button", { name: "Retry rendering" })).toBeTruthy();
  view.rerender(<SequenceDiagramPreview {...props} />);
  const svg = view.container.querySelector(".diagram svg")!;
  // Pointer handlers own their transient overlays outside React's rendered children.
  const overlay = document.createElementNS("http://www.w3.org/2000/svg", "g");
  overlay.classList.add("sequence-structure-move-preview");
  svg.append(overlay);
  view.rerender(
    <SequenceDiagramPreview {...props} initialFit={{ documentId: "doc", fit: false, scroll: { left: 10, top: 20 } }} />,
  );
  expect(view.container.querySelector(".diagram svg")).toBe(svg);
  expect(overlay.isConnected).toBe(true);
  view.rerender(<SequenceDiagramPreview {...props} svg={common.svg.replace("200 200", "300 300")} />);
  expect(overlay.isConnected).toBe(false);
});

it("keeps a Use Case connection preview when the selection callback changes on a recovery render", () => {
  const callback = vi.fn();
  const props: ComponentProps<typeof UseCaseDiagramPreview> = {
    ...common,
    document: parseUseCase(""),
    onSelect: callback,
    onRelationshipCreate: callback,
    onRelationshipReconnect: callback,
    onMoveToPackage: callback,
    onReorder: callback,
  };
  const view = render(<UseCaseDiagramPreview {...props} />);
  view.rerender(<UseCaseDiagramPreview {...props} renderStatus="error" renderError="Render failed" />);
  expect(view.getByRole("alert").textContent).toContain("last successful diagram");
  expect(view.getByRole("button", { name: "Retry rendering" })).toBeTruthy();
  view.rerender(<UseCaseDiagramPreview {...props} />);
  const svg = view.container.querySelector(".diagram svg")!;
  const overlay = document.createElementNS("http://www.w3.org/2000/svg", "line");
  overlay.classList.add("usecase-connection-preview");
  svg.append(overlay);
  view.rerender(<UseCaseDiagramPreview {...props} onSelect={vi.fn()} />);
  expect(overlay.isConnected).toBe(true);
  view.rerender(<UseCaseDiagramPreview {...props} selectedId="different-selection" />);
  expect(overlay.isConnected).toBe(false);
});
