/**
 * C4-PlantUML source support: the macro catalog (names and parameters, checked against the bundled library
 * by a test), detection, and a light read of a diagram's elements, boundaries and relationships for the
 * outline. C4 macros are preprocessor procedures; the engine expands them, so this reads the call sites only.
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

const C4_INCLUDE =
  /^\s*!\s*include\w*\s+(?:<C4\/[\w.]+>|"?https:\/\/raw\.githubusercontent\.com\/plantuml-stdlib\/C4-PlantUML\/[^\s"]+"?)\s*$/im;
const ELEMENT_CALL = new RegExp(
  `^\\s*(?:${macros
    .filter((macro) => macro.category !== "layout" && macro.category !== "relationship" && macro.name !== "Node")
    .map((macro) => macro.name)
    .join("|")})\\s*\\(`,
  "im",
);

/** A source is a C4 diagram when it includes the C4 library or calls a C4 element macro. */
export function isC4Source(source: string): boolean {
  return C4_INCLUDE.test(source) || ELEMENT_CALL.test(source);
}

export function includesC4Library(source: string): boolean {
  return C4_INCLUDE.test(source);
}

// -- Reading call sites ------------------------------------------------------------------------------

export interface C4Argument {
  name?: string;
  value: string;
}

/** Splits the text between a macro's parentheses into arguments, keeping quoted commas and nested calls. */
export function parseC4Arguments(text: string): C4Argument[] {
  const result: C4Argument[] = [];
  let current = "";
  let quote = false;
  let depth = 0;
  const flush = () => {
    const trimmed = current.trim();
    current = "";
    const named = trimmed.match(/^\$([A-Za-z_]\w*)\s*=\s*([\s\S]*)$/);
    const raw = named ? named[2]!.trim() : trimmed;
    const value = raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2 ? raw.slice(1, -1) : raw;
    result.push({ ...(named ? { name: named[1]! } : {}), value });
  };
  for (const character of text) {
    if (character === '"') quote = !quote;
    if (!quote && (character === "(" || character === "[")) depth += 1;
    if (!quote && (character === ")" || character === "]")) depth -= 1;
    if (character === "," && !quote && depth === 0) flush();
    else current += character;
  }
  if (current.trim() || result.length) flush();
  return result;
}

export interface C4Element {
  /** The alias the diagram refers to it by. */
  id: string;
  macro: string;
  category: Exclude<C4Category, "relationship">;
  label: string;
  technology?: string;
  description?: string;
  external: boolean;
  /** The alias of the boundary or node it sits in. */
  parent?: string;
  line: number;
  range: { from: number; to: number };
}

export interface C4Relationship {
  from: string;
  to: string;
  label: string;
  technology?: string;
  macro: string;
  line: number;
  range: { from: number; to: number };
}

export interface C4Document {
  elements: C4Element[];
  relationships: C4Relationship[];
  includesLibrary: boolean;
}

const CALL = /^(\s*)([A-Za-z_]\w*)\s*\((.*)\)\s*(\{)?\s*(?:'.*)?$/;

/** Reads the elements, boundaries and relationships a C4 source declares. Unknown lines are ignored. */
export function parseC4(source: string): C4Document {
  const elements: C4Element[] = [];
  const relationships: C4Relationship[] = [];
  const stack: Array<string | undefined> = [];
  let offset = 0;
  let comment = false;
  source.split("\n").forEach((raw, index) => {
    const from = offset;
    offset += raw.length + 1;
    const line = raw.replace(/\r$/, "");
    const text = line.trim();
    if (comment) {
      if (text.includes("'/")) comment = false;
      return;
    }
    if (text.startsWith("/'")) {
      comment = !text.includes("'/", 2);
      return;
    }
    if (!text || text.startsWith("'")) return;
    const to = from + line.length;
    if (/^\}/.test(text)) {
      stack.pop();
      return;
    }
    const call = line.match(CALL);
    const macro = call ? c4Macro(call[2]!) : undefined;
    if (!call || !macro) {
      if (/\{\s*(?:'.*)?$/.test(text)) stack.push(undefined);
      return;
    }
    const opens = Boolean(call[4]);
    const args = parseC4Arguments(call[3]!);
    const positional = args.filter((item) => !item.name);
    const value = (name: string) => {
      const named = args.find((item) => item.name === name);
      if (named) return named.value;
      const position = macro.params.findIndex((item) => item.name === name);
      return position >= 0 ? positional[position]?.value : undefined;
    };
    if (macro.category === "relationship") {
      const source = value("from");
      const target = value("to");
      if (source && target) {
        const technology = value("techn");
        relationships.push({
          from: source,
          to: target,
          label: value("label") ?? "",
          ...(technology ? { technology } : {}),
          macro: macro.name,
          line: index + 1,
          range: { from, to },
        });
      }
    } else if (macro.category !== "layout") {
      const id = value("alias");
      if (id) {
        const technology = value("techn") ?? value("type");
        const description = value("descr");
        const parent = [...stack].reverse().find((item) => item !== undefined);
        elements.push({
          id,
          macro: macro.name,
          category: macro.category,
          label: value("label") ?? id,
          ...(technology ? { technology } : {}),
          ...(description ? { description } : {}),
          external: Boolean(macro.external),
          ...(parent ? { parent } : {}),
          line: index + 1,
          range: { from, to },
        });
        if (opens) stack.push(id);
      } else if (opens) stack.push(undefined);
    } else if (opens) stack.push(undefined);
  });
  return { elements, relationships, includesLibrary: includesC4Library(source) };
}
