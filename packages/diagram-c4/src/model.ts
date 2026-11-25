import type { TextRange } from "@plantuml-studio/language-core";

/**
 * C4-PlantUML source model: the macro catalog (names and parameters, checked against the bundled library by a
 * test in the app), and the shape of a parsed diagram. C4 macros are preprocessor procedures; the engine expands
 * them, so the model describes the call sites only.
 */

export type C4Category = "person" | "system" | "container" | "component" | "boundary" | "node" | "relationship";

export interface C4Param {
  name: string;
  optional: boolean;
}

export interface C4Macro {
  name: string;
  category: C4Category | "layout";
  params: C4Param[];
  /** Short text for completion and help. */
  detail: string;
  /** Opens a `{ ... }` block (a boundary or deployment node). */
  block?: boolean;
  external?: boolean;
  /** The C4 library file that defines it, so a missing include can be suggested. */
  library: "C4_Context" | "C4_Container" | "C4_Component" | "C4_Dynamic" | "C4_Deployment";
}

const params = (spec: string): C4Param[] =>
  spec
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.startsWith("?") ? { name: item.slice(1), optional: true } : { name: item, optional: false }));

const macros: C4Macro[] = [];
function add(
  names: string[],
  category: C4Macro["category"],
  spec: string,
  detail: string,
  library: C4Macro["library"],
  extra: Partial<C4Macro> = {},
) {
  for (const name of names) macros.push({ name, category, params: params(spec), detail, library, ...extra });
}

const ELEMENT_TAIL = "?sprite, ?tags, ?link";

add(["Person"], "person", `alias, label, ?descr, ${ELEMENT_TAIL}`, "A person who uses the system", "C4_Context");
add(
  ["Person_Ext"],
  "person",
  `alias, label, ?descr, ${ELEMENT_TAIL}`,
  "A person outside the organisation",
  "C4_Context",
  { external: true },
);
add(["System"], "system", `alias, label, ?descr, ${ELEMENT_TAIL}`, "A software system", "C4_Context");
add(["SystemDb"], "system", `alias, label, ?descr, ${ELEMENT_TAIL}`, "A database system", "C4_Context");
add(["SystemQueue"], "system", `alias, label, ?descr, ${ELEMENT_TAIL}`, "A queue system", "C4_Context");
add(["System_Ext"], "system", `alias, label, ?descr, ${ELEMENT_TAIL}`, "An external software system", "C4_Context", {
  external: true,
});
add(["SystemDb_Ext"], "system", `alias, label, ?descr, ${ELEMENT_TAIL}`, "An external database system", "C4_Context", {
  external: true,
});
add(["SystemQueue_Ext"], "system", `alias, label, ?descr, ${ELEMENT_TAIL}`, "An external queue system", "C4_Context", {
  external: true,
});
add(["Container"], "container", `alias, label, ?techn, ?descr, ${ELEMENT_TAIL}`, "A container", "C4_Container");
add(
  ["ContainerDb"],
  "container",
  `alias, label, ?techn, ?descr, ${ELEMENT_TAIL}`,
  "A database container",
  "C4_Container",
);
add(
  ["ContainerQueue"],
  "container",
  `alias, label, ?techn, ?descr, ${ELEMENT_TAIL}`,
  "A queue container",
  "C4_Container",
);
add(
  ["Container_Ext"],
  "container",
  `alias, label, ?techn, ?descr, ${ELEMENT_TAIL}`,
  "An external container",
  "C4_Container",
  {
    external: true,
  },
);
add(
  ["ContainerDb_Ext"],
  "container",
  `alias, label, ?techn, ?descr, ${ELEMENT_TAIL}`,
  "An external database container",
  "C4_Container",
  { external: true },
);
add(
  ["ContainerQueue_Ext"],
  "container",
  `alias, label, ?techn, ?descr, ${ELEMENT_TAIL}`,
  "An external queue container",
  "C4_Container",
  { external: true },
);
add(["Component"], "component", `alias, label, ?techn, ?descr, ${ELEMENT_TAIL}`, "A component", "C4_Component");
add(
  ["ComponentDb"],
  "component",
  `alias, label, ?techn, ?descr, ${ELEMENT_TAIL}`,
  "A database component",
  "C4_Component",
);
add(
  ["ComponentQueue"],
  "component",
  `alias, label, ?techn, ?descr, ${ELEMENT_TAIL}`,
  "A queue component",
  "C4_Component",
);
add(
  ["Component_Ext"],
  "component",
  `alias, label, ?techn, ?descr, ${ELEMENT_TAIL}`,
  "An external component",
  "C4_Component",
  {
    external: true,
  },
);
add(
  ["ComponentDb_Ext"],
  "component",
  `alias, label, ?techn, ?descr, ${ELEMENT_TAIL}`,
  "An external database component",
  "C4_Component",
  { external: true },
);
add(
  ["ComponentQueue_Ext"],
  "component",
  `alias, label, ?techn, ?descr, ${ELEMENT_TAIL}`,
  "An external queue component",
  "C4_Component",
  { external: true },
);
add(["Boundary"], "boundary", "alias, label, ?type, ?tags, ?link, ?descr", "A generic boundary", "C4_Context", {
  block: true,
});
add(["Enterprise_Boundary"], "boundary", "alias, label, ?tags, ?link, ?descr", "An enterprise boundary", "C4_Context", {
  block: true,
});
add(["System_Boundary"], "boundary", "alias, label, ?tags, ?link, ?descr", "A system boundary", "C4_Context", {
  block: true,
});
add(["Container_Boundary"], "boundary", "alias, label, ?tags, ?link, ?descr", "A container boundary", "C4_Container", {
  block: true,
});
add(
  ["Deployment_Node", "Deployment_Node_L", "Deployment_Node_R", "Node", "Node_L", "Node_R"],
  "node",
  "alias, label, ?type, ?descr, ?sprite, ?tags, ?link",
  "A deployment node",
  "C4_Deployment",
  { block: true },
);
const RELATIONSHIP = "from, to, label, ?techn, ?descr, ?sprite, ?tags, ?link";
add(["Rel", "BiRel"], "relationship", RELATIONSHIP, "A relationship between two elements", "C4_Context");
for (const direction of ["Back", "Neighbor", "Back_Neighbor", "U", "Up", "D", "Down", "L", "Left", "R", "Right"])
  add(
    [`Rel_${direction}`, `BiRel_${direction}`].filter((name) => !name.startsWith("BiRel_Back")),
    "relationship",
    RELATIONSHIP,
    `A relationship, drawn ${direction.replace("_", " ").toLowerCase()}`,
    "C4_Context",
  );
add(
  ["RelIndex"],
  "relationship",
  "e_index, from, to, label, ?techn, ?descr, ?sprite, ?tags, ?link",
  "A numbered relationship (dynamic diagrams)",
  "C4_Dynamic",
);
for (const direction of ["U", "D", "L", "R"])
  add([`Lay_${direction}`], "layout", "from, to", `Keeps two elements apart, ${direction}`, "C4_Context");
for (const name of ["LAYOUT_TOP_DOWN", "LAYOUT_LEFT_RIGHT", "LAYOUT_LANDSCAPE", "LAYOUT_WITH_LEGEND", "SHOW_LEGEND"])
  add([name], "layout", "", "Layout and legend", "C4_Context");

/** Every C4 macro the app knows, in the order they are offered. */
export const C4_MACROS: readonly C4Macro[] = macros;
const byName = new Map(macros.map((macro) => [macro.name.toLowerCase(), macro]));
export const c4Macro = (name: string): C4Macro | undefined => byName.get(name.toLowerCase());

/** The `!include` line a macro needs, for a quick fix. */
export const c4IncludeLine = (library: C4Macro["library"]) => `!include <C4/${library}>`;

// -- The parsed document -----------------------------------------------------------------------------

/** The preprocessor construct that a line sits in, when it is not plain top-level source. */
export type C4Scope = "if" | "procedure" | "function" | "loop";

/** One argument of a macro call, with where it is written. All ranges are absolute offsets in the source. */
export interface C4ArgumentSpan {
  /** The name of a named argument: `tags` for `$tags="x"`. */
  name?: string;
  /** The value without its quotes. */
  value: string;
  /** The argument as written, trimmed. */
  raw: string;
  /** `quoted` is one plain string literal, `bare` a plain word, `expression` anything else (concatenation, calls). */
  form: "quoted" | "bare" | "expression";
  /** The whole argument, including a `$name=` and its quotes. */
  range: TextRange;
  /** The value only: without `$name=`, and without the quotes of a quoted argument. */
  valueRange: TextRange;
}

/** What every recognised macro call shares. */
export interface C4CallSite {
  macro: string;
  /** 1-based line of the call. */
  line: number;
  /** The whole line, without its line ending. */
  range: TextRange;
  /** The macro name. */
  nameRange: TextRange;
  /** The text between the parentheses. */
  argumentsRange: TextRange;
  arguments: C4ArgumentSpan[];
  /** How many `{ ... }` blocks the line sits in, boundaries and unknown blocks alike. */
  depth: number;
  /** Set when the line is inside an `!if`, a `!procedure`, a `!function` or a loop. */
  scope?: C4Scope;
}

export interface C4Element extends C4CallSite {
  /** The alias the diagram refers to it by. */
  id: string;
  category: Exclude<C4Category, "relationship">;
  label: string;
  technology?: string;
  description?: string;
  external: boolean;
  /** The alias of the boundary or node it sits in. */
  parent?: string;
  /** Position among all elements and boundaries, in source order. */
  index: number;
  /** A boundary or node whose `{` is on the call's line. */
  blockOpen: boolean;
  /** 1-based line of the closing `}`. Missing for an element, and for a boundary that is never closed. */
  closeLine?: number;
  /** The closing `}` line, without its line ending. */
  closeRange?: TextRange;
}

export interface C4Relationship extends C4CallSite {
  from: string;
  to: string;
  label: string;
  technology?: string;
  /** Position among all the relationships the parser reads, in source order. The drawn links follow this order. */
  index: number;
}

/** `LAYOUT_*` and legend macros. */
export interface C4Setting extends C4CallSite {
  kind: "layout" | "legend";
}

/** `Lay_U(a, b)` and the other layout hints. */
export interface C4LayoutHint extends C4CallSite {
  from: string;
  to: string;
}

/** `AddElementTag("name", ...)`, `AddRelTag` and `AddBoundaryTag`. */
export interface C4TagDefinition extends C4CallSite {
  kind: "element" | "relationship" | "boundary";
  tag: string;
}

export interface C4Settings {
  layout: C4Setting[];
  legend: C4Setting[];
  hints: C4LayoutHint[];
  tags: C4TagDefinition[];
}

export interface C4Document {
  elements: C4Element[];
  relationships: C4Relationship[];
  settings: C4Settings;
  includesLibrary: boolean;
}
