// @vitest-environment jsdom
import { useRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useDiagramFocusContinuity } from "./use-diagram-focus-continuity";

afterEach(cleanup);
function Canvas({ svg, documentId = "doc" }: { svg: string; documentId?: string }) {
  const host = useRef<HTMLDivElement>(null);
  useDiagramFocusContinuity(host, documentId);
  return (
    <>
      <input aria-label="Inspector field" />
      <div ref={host} dangerouslySetInnerHTML={{ __html: svg }} />
    </>
  );
}
const svg = (label: string, id: string) =>
  `<svg><g tabindex="0" role="button" aria-label="${label}" data-object-id="${id}"/></svg>`;

it("follows a uniquely labelled object after its position-based ID changes", async () => {
  const view = render(<Canvas svg={svg("Second", "1")} />);
  view.getByRole("button").focus();
  await act(async () => view.rerender(<Canvas svg={svg("Second", "0")} />));
  expect(document.activeElement).toBe(view.getByRole("button"));
});

it("uses stable identity after a rename changes the accessible label", async () => {
  const view = render(<Canvas svg={svg("Order", "o")} />);
  view.getByRole("button").focus();
  await act(async () => view.rerender(<Canvas svg={svg("Purchase", "o")} />));
  expect(document.activeElement).toBe(view.getByRole("button"));
});

it("waits for semantic targets when rendering temporarily exposes an unannotated SVG", async () => {
  const view = render(<Canvas svg={svg("Purchase", "o")} />);
  view.getByRole("button").focus();
  await act(async () => view.rerender(<Canvas svg="<svg><text>Order</text></svg>" />));
  await act(async () => view.rerender(<Canvas svg={svg("Order", "o")} />));
  expect(document.activeElement).toBe(view.getByRole("button"));
});

it("does not steal focus from an inspector field", async () => {
  const view = render(<Canvas svg={svg("Order", "o")} />);
  view.getByRole("button").focus();
  const input = view.getByRole("textbox");
  input.focus();
  await act(async () => view.rerender(<Canvas svg={svg("Purchase", "o")} />));
  expect(document.activeElement).toBe(input);
});

it("distinguishes an object's semantic overlay from its labelled SVG group", async () => {
  const markup = (label: string) =>
    `<svg><g tabindex="0" aria-label="${label}" data-object-id="o"><rect role="button" tabindex="0" aria-label="${label}" data-object-id="o"/></g></svg>`;
  const view = render(<Canvas svg={markup("Order")} />);
  view.getByRole("button").focus();
  await act(async () => view.rerender(<Canvas svg={markup("Purchase")} />));
  expect(document.activeElement).toBe(view.getByRole("button"));
});

it("forgets a removed object before a later object reuses its generated ID", async () => {
  const view = render(<Canvas svg={svg("Removed", "0")} />);
  view.getByRole("button").focus();
  await act(async () => view.rerender(<Canvas svg={svg("Other", "1")} />));
  await act(async () => view.rerender(<Canvas svg={svg("New object", "0")} />));
  expect(document.activeElement).toBe(document.body);
});

it("does not carry diagram focus across documents or guess between duplicate labels", async () => {
  const view = render(<Canvas svg={svg("Item", "a")} />);
  view.getByRole("button").focus();
  await act(async () => view.rerender(<Canvas documentId="other" svg={svg("Item", "b")} />));
  expect(document.activeElement).not.toBe(view.getByRole("button"));
  view.getByRole("button").focus();
  await act(async () =>
    view.rerender(
      <Canvas
        documentId="other"
        svg={
          '<svg><g tabindex="0" role="button" aria-label="Item" data-object-id="c"/><g tabindex="0" role="button" aria-label="Item" data-object-id="d"/></svg>'
        }
      />,
    ),
  );
  expect(document.activeElement).toBe(document.body);
});
