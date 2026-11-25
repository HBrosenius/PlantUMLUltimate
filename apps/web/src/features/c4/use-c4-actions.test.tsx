// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseC4 } from "../../c4-source";
import { C4_DRAWN_RELATIONSHIP_LABEL, useC4Actions } from "./use-c4-actions";
import type { C4Selection } from "./c4-forms";

const SOURCE = `@startuml
!include <C4/C4_Container>
Person(user, "User")
System_Boundary(shop, "Shop") {
  Container(web, "Web", "React")
  Container(api, "API", "Java")
}
Rel(user, web, "Uses")
Rel(web, api, "Calls")
@enduml`;

function setup(source = SOURCE, options: { commit?: boolean; confirm?: boolean } = {}) {
  const commits: Array<{ source: string; description: string }> = [];
  const selected: Array<C4Selection | undefined> = [];
  const messages: string[] = [];
  const closed: string[] = [];
  const confirm = vi.fn(() => options.confirm ?? true);
  const hook = renderHook(() =>
    useC4Actions({
      source,
      document: parseC4(source),
      selection: undefined,
      commitSource: (next, description) => {
        if (options.commit === false) return false;
        commits.push({ source: next, description });
        return true;
      },
      confirmDelete: confirm,
      closeDialog: (kind) => closed.push(kind),
      select: (next) => selected.push(next),
      reportMessage: (message) => messages.push(message),
    }),
  );
  return { actions: () => hook.result.current, commits, selected, messages, closed, confirm };
}

describe("useC4Actions", () => {
  it("applies an add as one commit, selects what was added and closes the dialog", () => {
    const { actions, commits, selected, closed, messages } = setup();
    let result: string | undefined;
    act(() => {
      result = actions().addElement({ macro: "Container", alias: "db", label: "Database", technology: "SQL" });
    });
    expect(result).toBeUndefined();
    expect(commits).toHaveLength(1);
    expect(commits[0]!.source).toContain('Container(db, "Database", "SQL")');
    expect(selected.at(-1)).toEqual({ kind: "element", alias: "db" });
    expect(closed).toEqual(["add-c4-element"]);
    expect(messages).toEqual(["Added Database"]);
  });

  it("adds the include a macro needs together with the element, in one commit", () => {
    const context = "@startuml\n!include <C4/C4_Context>\n@enduml";
    const { actions, commits } = setup(context);
    act(() => {
      actions().addElement({ macro: "Container", alias: "web", label: "Web" }, { addInclude: true });
    });
    expect(commits).toHaveLength(1);
    expect(commits[0]!.source).toBe(
      '@startuml\n!include <C4/C4_Context>\n!include <C4/C4_Container>\nContainer(web, "Web")\n@enduml',
    );
  });

  it("leaves the include out when the offer is declined", () => {
    const context = "@startuml\n!include <C4/C4_Context>\n@enduml";
    const { actions, commits } = setup(context);
    act(() => {
      actions().addElement({ macro: "Container", alias: "web", label: "Web" }, { addInclude: false });
    });
    expect(commits[0]!.source).toBe('@startuml\n!include <C4/C4_Context>\nContainer(web, "Web")\n@enduml');
  });

  it("hands a refusal back to the form, reports it, and commits nothing", () => {
    const { actions, commits, messages, closed } = setup();
    let result: string | undefined;
    act(() => {
      result = actions().addElement({ macro: "Container", alias: "web", label: "Again" });
    });
    expect(result).toContain("already used");
    expect(messages).toEqual([result]);
    expect(commits).toEqual([]);
    expect(closed).toEqual([]);
  });

  it("does not select or close when the commit itself is refused", () => {
    const { actions, selected, closed } = setup(SOURCE, { commit: false });
    let result: string | undefined;
    act(() => {
      result = actions().addElement({ macro: "Person", alias: "admin", label: "Admin" });
    });
    expect(result).toBeDefined();
    expect(selected).toEqual([]);
    expect(closed).toEqual([]);
  });

  it("changes one argument and keeps the element selected", () => {
    const { actions, commits, selected } = setup();
    act(() => {
      actions().updateArgument({ kind: "element", alias: "web" }, "technology", "Vue");
    });
    expect(commits[0]!.source).toBe(SOURCE.replace('"React"', '"Vue"'));
    expect(selected.at(-1)).toEqual({ kind: "element", alias: "web" });
    act(() => {
      actions().updateArgument({ kind: "relationship", index: 1 }, "label", "Talks to");
    });
    expect(selected.at(-1)).toEqual({ kind: "relationship", index: 1 });
  });

  it("drags create a relationship with a default label, and reconnect only the dragged end", () => {
    const { actions, commits, messages } = setup();
    act(() => {
      actions().connectByDrag("user", "api");
    });
    expect(commits[0]!.source).toContain(`Rel(user, api, "${C4_DRAWN_RELATIONSHIP_LABEL}")`);
    act(() => {
      actions().reconnectByDrag(0, "to", "api");
    });
    expect(commits[1]!.source).toBe(SOURCE.replace('Rel(user, web, "Uses")', 'Rel(user, api, "Uses")'));
    expect(messages).toEqual(["Added relationship", "Reconnected to end"]);
  });

  it("makes a relationship both ways and back, keeping its direction and selection", () => {
    const source = SOURCE.replace('Rel(web, api, "Calls")', 'Rel_R(web, api, "Calls")');
    const { actions, commits, selected } = setup(source);
    act(() => {
      actions().setBothWays(1, "Rel_R", true);
    });
    expect(commits[0]!.source).toContain('BiRel_R(web, api, "Calls")');
    expect(commits[0]!.description).toBe("Make relationship both ways");
    expect(selected).toEqual([]);
    const both = setup(commits[0]!.source);
    act(() => {
      both.actions().setBothWays(1, "BiRel_R", false);
    });
    expect(both.commits[0]!.source).toBe(source);
  });

  it("refuses both ways for a direction BiRel doesn't have", () => {
    const source = SOURCE.replace('Rel(web, api, "Calls")', 'Rel_Back(web, api, "Calls")');
    const { actions, commits, messages } = setup(source);
    let result: string | undefined;
    act(() => {
      result = actions().setBothWays(1, "Rel_Back", true);
    });
    expect(result).toContain("not a relationship macro");
    expect(commits).toEqual([]);
    expect(messages).toEqual([result]);
  });

  it("moves into and out of a boundary", () => {
    const { actions, commits } = setup();
    act(() => {
      actions().moveByDrag("user", "shop");
    });
    expect(commits[0]!.source).toContain('  Person(user, "User")\n}');
    const moved = setup(commits[0]!.source);
    act(() => {
      moved.actions().moveByDrag("user", undefined);
    });
    expect(moved.commits[0]!.source).not.toContain("  Person(user");
  });

  it("asks before deleting an element and says what goes with it, and clears the selection", () => {
    const { actions, commits, confirm, selected } = setup();
    act(() => {
      actions().removeSelected({ kind: "element", alias: "web" });
    });
    expect(confirm).toHaveBeenCalledWith("Delete “Web” and 2 connected relationships?");
    expect(commits[0]!.source).not.toContain("web");
    expect(selected.at(-1)).toBeUndefined();
  });

  it("deletes nothing when the confirmation is declined, and a boundary keeps its contents", () => {
    const declined = setup(SOURCE, { confirm: false });
    act(() => {
      declined.actions().removeSelected({ kind: "element", alias: "web" });
    });
    expect(declined.commits).toEqual([]);
    const boundary = setup();
    act(() => {
      boundary.actions().removeSelected({ kind: "element", alias: "shop" });
    });
    expect(boundary.confirm).toHaveBeenCalledWith("Delete “Shop”? Its 2 elements stay in the diagram.");
    expect(boundary.commits[0]!.source).toContain("Container(web");
  });

  it("deletes a relationship without asking", () => {
    const { actions, commits, confirm } = setup();
    act(() => {
      actions().removeSelected({ kind: "relationship", index: 0 });
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(commits[0]!.source).not.toContain('Rel(user, web, "Uses")');
    expect(commits[0]!.source).toContain('Rel(web, api, "Calls")');
  });

  it("finds the line to show for a selection, including a procedure's call", () => {
    const procedure = '@startuml\n!procedure P($a)\nContainer($a, "X")\n!endprocedure\nP(proc)\n@enduml';
    const { actions } = setup(procedure);
    const range = actions().rangeOf({ kind: "unmanaged", alias: "proc" })!;
    expect(procedure.slice(range.from, range.to)).toBe("P(proc)");
    expect(actions().rangeOf({ kind: "unmanaged", alias: "nowhere" })).toBeUndefined();
  });

  it("checks a label before it is written", () => {
    const { actions } = setup();
    expect(actions().labelProblem("web", "Frontend")).toBeUndefined();
    expect(actions().labelProblem("web", "  ")).toBe("The label is required.");
    expect(actions().labelProblem("web", 'say "hi"')).toContain("double quote");
  });
});
