// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import type { ClassEntity, ClassMember, ClassMemberInput } from "@plantuml-studio/diagram-class";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClassEntityInspector } from "./ClassEditors";

afterEach(cleanup);

const methodMember = (parameters: string): ClassMember => ({
  id: "User:member-0",
  text: `save(${parameters})`,
  kind: "method",
  name: "save",
  parameters,
  isStatic: false,
  isAbstract: false,
  sourceRange: { from: 0, to: 10 },
});

function Harness({ onMemberChange }: { onMemberChange(value: ClassMemberInput): void }) {
  const [parameters, setParameters] = useState("a: A, b: B, c: C");
  const entity: ClassEntity = {
    id: "User",
    kind: "class",
    label: "User",
    members: [methodMember(parameters)],
    sourceRange: { from: 0, to: 20 },
    openRange: { from: 0, to: 5 },
  };
  return (
    <ClassEntityInspector
      entity={entity}
      entities={[entity]}
      packages={[]}
      onChange={vi.fn()}
      onPackageChange={vi.fn()}
      onDelete={vi.fn()}
      onMemberAdd={vi.fn()}
      onMemberChange={(_member, value) => {
        onMemberChange(value);
        // Mimic the source round-trip: the member text changes, which remounts the member row.
        setParameters(value.parameters ?? "");
      }}
      onMemberDelete={vi.fn()}
      onMemberMove={vi.fn()}
      onMemberReveal={vi.fn()}
      onClose={vi.fn()}
    />
  );
}

const parameterNames = () =>
  [...document.querySelectorAll<HTMLInputElement>(".class-parameter-row input[aria-label$='name']")].map(
    (input) => input.value,
  );

describe("ClassMemberRow parameter reordering", () => {
  it("keeps focus on the moved parameter so repeated Enter keeps moving it", async () => {
    const user = userEvent.setup();
    const onMemberChange = vi.fn();
    render(<Harness onMemberChange={onMemberChange} />);
    screen.getByRole("button", { name: "Move parameter 3 up" }).focus();

    await user.keyboard("{Enter}");
    expect(parameterNames()).toEqual(["a", "c", "b"]);
    expect(onMemberChange).toHaveBeenLastCalledWith(expect.objectContaining({ parameters: "a: A, c: C, b: B" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Move parameter 2 up" }));

    await user.keyboard("{Enter}");
    expect(parameterNames()).toEqual(["c", "a", "b"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Move parameter 1 down" }));
  });
});
