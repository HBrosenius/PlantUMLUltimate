import { useCallback } from "react";
import {
  addC4Boundary,
  addC4Element,
  addC4Relationship,
  changeC4ElementMacro,
  moveC4Element,
  parseC4,
  removeC4Element,
  removeC4Relationship,
  reverseC4Relationship,
  setC4RelationshipDirection,
  setC4Settings,
  updateC4Argument,
  type C4BoundaryInput,
  type C4Direction,
  type C4Document,
  type C4EditResult,
  type C4Element,
  type C4ElementInput,
  type C4Relationship,
  type C4RelationshipInput,
  type C4SettingsInput,
  type C4Target,
} from "../../c4-source";
import type { TextRange } from "@plantuml-studio/language-core";
import { addC4Include, c4MissingLibrary, c4SelectionAt, findC4AliasLine, type C4Selection } from "./c4-forms";

/** The default label of a relationship that is drawn rather than typed: C4 asks for a verb on every arrow. */
export const C4_DRAWN_RELATIONSHIP_LABEL = "Uses";

export interface UseC4ActionsOptions {
  source: string;
  document: C4Document;
  selection: C4Selection | undefined;
  commitSource(source: string, description: string): boolean;
  confirmDelete(message: string): boolean;
  closeDialog(kind: "add-c4-element" | "add-c4-boundary" | "add-c4-relationship"): void;
  select(selection: C4Selection | undefined): void;
  reportMessage(message: string): void;
}

/** A form gets back the reason an edit was refused, or nothing when it was applied. */
export type C4ActionResult = string | undefined;

export interface C4AddOptions {
  /** Add the `!include` line for the library the macro needs, when the source does not have it. */
  addInclude?: boolean;
}

/** The descendants of an element or boundary, itself included. */
function within(document: C4Document, alias: string): Set<string> {
  const result = new Set([alias]);
  for (let grew = true; grew;) {
    grew = false;
    for (const element of document.elements)
      if (element.parent && result.has(element.parent) && !result.has(element.id)) {
        result.add(element.id);
        grew = true;
      }
  }
  return result;
}

export function useC4Actions({
  source,
  document,
  selection,
  commitSource,
  confirmDelete,
  closeDialog,
  select,
  reportMessage,
}: UseC4ActionsOptions) {
  /**
   * Applies the result of one C1 operation as one undoable edit. A refusal is shown to the user and handed back
   * to the form that asked. `select` says what is selected afterwards: the item the edit reports, or nothing.
   */
  const apply = useCallback(
    (result: C4EditResult, description: string, afterwards: "result" | "keep" | "clear" = "result"): C4ActionResult => {
      if (!result.ok) {
        reportMessage(result.message);
        return result.message;
      }
      if (!commitSource(result.source, description)) return "The change was not applied.";
      if (afterwards === "clear") select(undefined);
      else if (afterwards === "result") {
        const next = c4SelectionAt(parseC4(result.source), result.selection);
        if (next) select(next);
      }
      return undefined;
    },
    [commitSource, reportMessage, select],
  );

  /** The source with the include a macro needs, when asked for and missing. */
  const withInclude = useCallback(
    (macro: string, options: C4AddOptions) => {
      const library = options.addInclude ? c4MissingLibrary(source, macro) : undefined;
      return library ? addC4Include(source, library) : source;
    },
    [source],
  );

  const addElement = useCallback(
    (input: C4ElementInput, options: C4AddOptions = {}): C4ActionResult => {
      const error = apply(addC4Element(withInclude(input.macro, options), input), `Add ${input.label.trim()}`);
      if (error) return error;
      closeDialog("add-c4-element");
      reportMessage(`Added ${input.label.trim()}`);
      return undefined;
    },
    [apply, closeDialog, reportMessage, withInclude],
  );
  const addBoundary = useCallback(
    (input: C4BoundaryInput, options: C4AddOptions = {}): C4ActionResult => {
      const error = apply(addC4Boundary(withInclude(input.macro, options), input), `Add ${input.label.trim()}`);
      if (error) return error;
      closeDialog("add-c4-boundary");
      reportMessage(`Added ${input.label.trim()}`);
      return undefined;
    },
    [apply, closeDialog, reportMessage, withInclude],
  );
  const addRelationship = useCallback(
    (input: C4RelationshipInput, options: C4AddOptions = {}): C4ActionResult => {
      const error = apply(
        addC4Relationship(withInclude(input.macro ?? "Rel", options), input),
        `Add relationship ${input.from} to ${input.to}`,
      );
      if (error) return error;
      closeDialog("add-c4-relationship");
      reportMessage("Added relationship");
      return undefined;
    },
    [apply, closeDialog, reportMessage, withInclude],
  );

  /** One argument of the selected element, boundary or relationship. An empty value removes an optional one. */
  const updateArgument = useCallback(
    (target: C4Target, parameter: string, value: string | undefined): C4ActionResult =>
      apply(
        updateC4Argument(source, target, parameter, value),
        `Update ${parameter === "descr" ? "description" : parameter === "techn" ? "technology" : parameter}`,
      ),
    [apply, source],
  );
  const changeMacro = useCallback(
    (alias: string, macro: string): C4ActionResult =>
      apply(changeC4ElementMacro(source, alias, macro), `Change ${alias} to ${macro}`),
    [apply, source],
  );
  const setDirection = useCallback(
    (index: number, direction: C4Direction): C4ActionResult =>
      apply(setC4RelationshipDirection(source, index, direction), "Change relationship direction"),
    [apply, source],
  );
  const reverse = useCallback(
    (index: number): C4ActionResult => apply(reverseC4Relationship(source, index), "Reverse relationship"),
    [apply, source],
  );
  const moveElement = useCallback(
    (alias: string, parent: string | undefined): C4ActionResult => {
      const label = document.elements.find((item) => item.id === alias)?.label ?? alias;
      const target = parent ? (document.elements.find((item) => item.id === parent)?.label ?? parent) : undefined;
      return apply(moveC4Element(source, alias, parent), target ? `Move ${label} into ${target}` : `Move ${label} out`);
    },
    [apply, document.elements, source],
  );
  const applySettings = useCallback(
    (input: C4SettingsInput): C4ActionResult => {
      const error = apply(setC4Settings(source, input), "Update C4 diagram settings", "keep");
      if (!error) reportMessage("Updated C4 diagram settings");
      return error;
    },
    [apply, reportMessage, source],
  );

  /** What deleting an element takes with it, for the confirmation. */
  const deleteQuestion = useCallback(
    (element: C4Element) => {
      // Deleting a boundary keeps what is inside it, so only its own relationships go.
      const contents = within(document, element.id).size - 1;
      const connected = document.relationships.filter(
        (item) => item.from === element.id || item.to === element.id,
      ).length;
      const parts: string[] = [];
      if (connected) parts.push(`${connected} connected relationship${connected === 1 ? "" : "s"}`);
      const base = `Delete “${element.label}”`;
      const ending = contents
        ? ` Its ${contents} ${contents === 1 ? "element stays" : "elements stay"} in the diagram.`
        : "";
      return `${base}${parts.length ? ` and ${parts.join(" and ")}` : ""}?${ending}`;
    },
    [document],
  );
  const removeElement = useCallback(
    (element: C4Element | undefined): C4ActionResult => {
      if (!element) return undefined;
      if (!confirmDelete(deleteQuestion(element))) return undefined;
      return apply(removeC4Element(source, element.id), `Delete ${element.label}`, "clear");
    },
    [apply, confirmDelete, deleteQuestion, source],
  );
  const removeRelationship = useCallback(
    (relationship: C4Relationship | undefined): C4ActionResult =>
      relationship
        ? apply(removeC4Relationship(source, relationship.index), "Delete relationship", "clear")
        : undefined,
    [apply, source],
  );
  /** Deletes whatever is selected, asking first when an element takes relationships with it. */
  const removeSelected = useCallback(
    (item: C4Selection | undefined = selection): C4ActionResult => {
      if (item?.kind === "element")
        return removeElement(document.elements.find((element) => element.id === item.alias));
      if (item?.kind === "relationship") return removeRelationship(document.relationships[item.index]);
      return undefined;
    },
    [document, removeElement, removeRelationship, selection],
  );

  // -- Canvas gestures ------------------------------------------------------------------------------

  const connectByDrag = useCallback(
    (from: string, to: string): C4ActionResult => {
      const error = apply(
        addC4Relationship(withInclude("Rel", { addInclude: true }), { from, to, label: C4_DRAWN_RELATIONSHIP_LABEL }),
        `Connect ${from} to ${to}`,
      );
      if (!error) reportMessage("Added relationship");
      return error;
    },
    [apply, reportMessage, withInclude],
  );
  const reconnectByDrag = useCallback(
    (index: number, endpoint: "from" | "to", alias: string): C4ActionResult => {
      const error = apply(
        updateC4Argument(source, { kind: "relationship", index }, endpoint, alias),
        "Reconnect relationship",
      );
      if (!error) reportMessage(`Reconnected ${endpoint} end`);
      return error;
    },
    [apply, reportMessage, source],
  );
  const moveByDrag = useCallback(
    (alias: string, parent: string | undefined): C4ActionResult => {
      const error = moveElement(alias, parent);
      if (!error)
        reportMessage(
          parent
            ? `Moved ${document.elements.find((item) => item.id === alias)?.label ?? alias} into ${document.elements.find((item) => item.id === parent)?.label ?? parent}`
            : "Moved out of its boundary",
        );
      return error;
    },
    [document.elements, moveElement, reportMessage],
  );

  /** The source line a selection stands for, for showing it in the editor. */
  const rangeOf = useCallback(
    (item: C4Selection): TextRange | undefined => {
      if (item.kind === "element") return document.elements.find((element) => element.id === item.alias)?.range;
      if (item.kind === "relationship") return document.relationships[item.index]?.range;
      if (item.alias) return findC4AliasLine(source, item.alias);
      const pair = document.relationships.find(
        (rel) => (rel.from === item.from && rel.to === item.to) || (rel.from === item.to && rel.to === item.from),
      );
      return pair?.range;
    },
    [document, source],
  );

  /** Rejection text for a label, or nothing when it can be written. */
  const labelProblem = useCallback(
    (alias: string, value: string): string | undefined => {
      if (!value.trim()) return "The label is required.";
      const result = updateC4Argument(source, { kind: "element", alias }, "label", value.trim());
      return result.ok ? undefined : result.message;
    },
    [source],
  );

  return {
    addElement,
    addBoundary,
    addRelationship,
    updateArgument,
    changeMacro,
    setDirection,
    reverse,
    moveElement,
    applySettings,
    removeElement,
    removeRelationship,
    removeSelected,
    connectByDrag,
    reconnectByDrag,
    moveByDrag,
    rangeOf,
    labelProblem,
  };
}

export type C4Actions = ReturnType<typeof useC4Actions>;
