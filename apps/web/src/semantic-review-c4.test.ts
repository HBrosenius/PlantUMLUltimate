import { describe, expect, it } from "vitest";
import {
  addC4Element,
  addC4Relationship,
  changeC4ElementMacro,
  moveC4Element,
  removeC4Element,
  removeC4Relationship,
  renameC4Alias,
  reverseC4Relationship,
  setC4RelationshipDirection,
  setC4RelationshipMacro,
  setC4Settings,
  updateC4Argument,
  type C4EditResult,
} from "@plantuml-studio/diagram-c4";
import { C4_STARTERS } from "./c4-starters";
import { reviewProposal } from "./features/ai-edits/proposal-checks";
import { createReviewMarkdown } from "./features/git/git-propose";
import { applyReviewGroups, buildReviewGroups, type ReviewGroup } from "./semantic-review";

const BASE = `@startuml
!include <C4/C4_Container>

title Shop

Person(user, "Customer", "Buys things")
System_Boundary(shop, "Web shop") {
  Container(web, "Web app", "React", "The UI")
  ContainerDb(db, "Database", "PostgreSQL")
}
System_Ext(mail, "Mail")

Rel(user, web, "Uses", "HTTPS")
Rel(web, db, "Reads and writes")
Rel_R(web, mail, "Sends")
Lay_R(user, shop)
SHOW_LEGEND()
@enduml`;

const edited = (result: C4EditResult): string => {
  if (!result.ok) throw new Error(result.message);
  return result.source;
};
const replace = (source: string, from: string, to: string) => {
  if (!source.includes(from)) throw new Error(`Fixture does not contain ${from}`);
  return source.replace(from, to);
};
const review = (before: string, after: string) => buildReviewGroups(before, after, "c4");
const summary = (groups: ReviewGroup[]) => groups.map((group) => `${group.title} [${group.confidence}]`);

const TWO_RELS = `@startuml
!include <C4/C4_Container>
Container(a, "A")
Container(b, "B")
Rel(a, b, "First")
Rel(a, b, "Second")
@enduml`;

const IF_BLOCK = `@startuml
!include <C4/C4_Container>
Container(a, "A")
!if (%true())
Container(b, "B", "Go")
!endif
Rel(a, b, "Calls")
@enduml`;

const PROCEDURE = `@startuml
!include <C4/C4_Container>
!procedure Service($name)
Container($name, "Service")
!endprocedure
Service(x)
Container(a, "A")
@enduml`;

/** Each case: the two sources and the review groups the user should see. */
const CASES: [string, () => [string, string], string[]][] = [
  [
    "an added element",
    () => [
      BASE,
      edited(
        addC4Element(BASE, { macro: "Container", alias: "cache", label: "Cache", technology: "Redis", parent: "shop" }),
      ),
    ],
    ["Add container `cache` [confirmed]"],
  ],
  [
    "a removed element and its relationships",
    () => [BASE, edited(removeC4Element(BASE, "db"))],
    ["Remove container `db` [confirmed]", "Remove relationship `web → db` [confirmed]"],
  ],
  [
    "a changed label",
    () => [BASE, edited(updateC4Argument(BASE, { kind: "element", alias: "web" }, "label", "Storefront"))],
    ["Change container `web`: label [confirmed]"],
  ],
  [
    "a changed technology",
    () => [BASE, edited(updateC4Argument(BASE, { kind: "element", alias: "web" }, "technology", "Vue"))],
    ["Change container `web`: technology [confirmed]"],
  ],
  [
    "a changed description",
    () => [BASE, edited(updateC4Argument(BASE, { kind: "element", alias: "web" }, "description", "The shop UI"))],
    ["Change container `web`: description [confirmed]"],
  ],
  [
    "changed tags",
    () => [BASE, edited(updateC4Argument(BASE, { kind: "element", alias: "web" }, "tags", "public"))],
    ["Change container `web`: tags [confirmed]"],
  ],
  [
    "a changed link",
    () => [BASE, edited(updateC4Argument(BASE, { kind: "element", alias: "web" }, "link", "https://example.com"))],
    ["Change container `web`: link [confirmed]"],
  ],
  [
    "a changed sprite",
    () => [BASE, edited(updateC4Argument(BASE, { kind: "element", alias: "web" }, "sprite", "react"))],
    ["Change container `web`: sprite [confirmed]"],
  ],
  [
    "a changed macro (Container to ContainerDb)",
    () => [BASE, edited(changeC4ElementMacro(BASE, "web", "ContainerDb"))],
    ["Change `web` from Container to ContainerDb [confirmed]"],
  ],
  [
    "a changed external macro (System to System_Ext)",
    () => {
      const before = replace(BASE, 'System_Ext(mail, "Mail")', 'System(mail, "Mail")');
      return [before, edited(changeC4ElementMacro(before, "mail", "System_Ext"))];
    },
    ["Change `mail` from System to System_Ext [confirmed]"],
  ],
  [
    "an element moved out of its boundary",
    () => [BASE, edited(moveC4Element(BASE, "web", undefined))],
    ["Move `web` out of `shop` (part 1) [probable]", "Move `web` out of `shop` (part 2) [probable]"],
  ],
  [
    "an element moved into a boundary",
    () => [BASE, edited(moveC4Element(BASE, "mail", "shop"))],
    ["Move `mail` into `shop` (part 1) [probable]", "Move `mail` into `shop` (part 2) [probable]"],
  ],
  [
    "a renamed alias with its relationships and layout hints",
    () => [BASE, edited(renameC4Alias(BASE, "web", "storefront"))],
    ["Rename `web` → `storefront` (part 1) [probable]", "Rename `web` → `storefront` (part 2) [probable]"],
  ],
  [
    "a renamed alias whose relationships follow, with a new label",
    () => {
      const renamed = edited(renameC4Alias(BASE, "mail", "email"));
      return [BASE, replace(renamed, '"Mail"', '"E-mail"')];
    },
    [
      "Rename `mail` → `email` and change label (part 1) [probable]",
      "Rename `mail` → `email` and change label (part 2) [probable]",
    ],
  ],
  [
    "an element replaced by an unrelated one is a removal and an addition",
    () => {
      const after = edited(removeC4Element(BASE, "db"));
      return [
        BASE,
        edited(addC4Element(after, { macro: "ContainerQueue", alias: "events", label: "Event bus", parent: "shop" })),
      ];
    },
    ["Remove 1 container, add 1 container [confirmed]", "Remove relationship `web → db` [confirmed]"],
  ],
  [
    "two same-labelled elements renamed together are not guessed to be renames",
    () => {
      const before = `@startuml\n!include <C4/C4_Container>\nContainer(a, "Service")\nContainer(b, "Service")\n@enduml`;
      return [before, replace(replace(before, "Container(a,", "Container(a2,"), "Container(b,", "Container(b2,")];
    },
    ["Remove 2 containers, add 2 containers [confirmed]"],
  ],
  [
    "a boundary label",
    () => [BASE, edited(updateC4Argument(BASE, { kind: "element", alias: "shop" }, "label", "Shop system"))],
    ["Change boundary `shop`: label [confirmed]"],
  ],
  [
    "an added boundary with an element inside",
    () => {
      const withBoundary = replace(
        BASE,
        "System_Ext(mail",
        'Container_Boundary(jobs, "Jobs") {\n  Container(worker, "Worker")\n}\nSystem_Ext(mail',
      );
      return [BASE, withBoundary];
    },
    ["Add 1 boundary and 1 container [confirmed]"],
  ],
  [
    "an added relationship",
    () => [BASE, edited(addC4Relationship(BASE, { from: "user", to: "mail", label: "Gets mail from" }))],
    ["Add relationship `user → mail` [confirmed]"],
  ],
  [
    "a removed relationship",
    () => [BASE, edited(removeC4Relationship(BASE, 1))],
    ["Remove relationship `web → db` [confirmed]"],
  ],
  [
    "a re-pointed relationship",
    () => {
      const before = replace(
        BASE,
        'Rel(web, db, "Reads and writes")',
        'Rel(web, db, "Reads and writes")\nContainerDb(cache, "Cache")',
      );
      return [before, replace(before, 'Rel(web, db, "Reads', 'Rel(web, cache, "Reads')];
    },
    ["Re-point `web → db` to `web → cache` [confirmed]"],
  ],
  [
    "a reversed relationship",
    () => [BASE, edited(reverseC4Relationship(BASE, 0))],
    ["Reverse relationship `user → web` [confirmed]"],
  ],
  [
    "a changed direction (Rel to Rel_R)",
    () => [BASE, edited(setC4RelationshipDirection(BASE, 0, "right"))],
    ["Change relationship `user → web`: direction [confirmed]"],
  ],
  [
    "a changed macro (Rel to BiRel)",
    () => [BASE, edited(setC4RelationshipMacro(BASE, 0, "BiRel"))],
    ["Change relationship `user → web`: macro [confirmed]"],
  ],
  [
    "a changed relationship label",
    () => [BASE, edited(updateC4Argument(BASE, { kind: "relationship", index: 1 }, "label", "Stores in"))],
    ["Change relationship `web → db`: label [confirmed]"],
  ],
  [
    "a changed relationship technology",
    () => [BASE, edited(updateC4Argument(BASE, { kind: "relationship", index: 0 }, "technology", "gRPC"))],
    ["Change relationship `user → web`: technology [confirmed]"],
  ],
  [
    "two relationships between the same pair, the first removed",
    () => [TWO_RELS, edited(removeC4Relationship(TWO_RELS, 0))],
    ["Remove relationship `a → b` [confirmed]"],
  ],
  [
    "two relationships between the same pair, one relabelled",
    () => [TWO_RELS, edited(updateC4Argument(TWO_RELS, { kind: "relationship", index: 1 }, "label", "Other"))],
    ["Change relationship `a → b`: label [confirmed]"],
  ],
  [
    "a changed layout",
    () => [BASE, edited(setC4Settings(BASE, { layout: "left-right" }))],
    ["Set layout LAYOUT_LEFT_RIGHT [confirmed]"],
  ],
  [
    "a removed legend",
    () => [BASE, edited(setC4Settings(BASE, { legend: "none" }))],
    ["Remove legend SHOW_LEGEND [confirmed]"],
  ],
  [
    "a legend that changes kind",
    () => [BASE, edited(setC4Settings(BASE, { legend: "with-legend" }))],
    [
      "Change legend SHOW_LEGEND → LAYOUT_WITH_LEGEND (part 1) [probable]",
      "Change legend SHOW_LEGEND → LAYOUT_WITH_LEGEND (part 2) [probable]",
    ],
  ],
  [
    "a title edit falls back to an unclassified change",
    () => [BASE, replace(BASE, "title Shop", "title The shop")],
    ["Unclassified source change [unclassified]"],
  ],
  [
    "an edit inside an !if is reviewed with a note and cannot be applied alone",
    () => [IF_BLOCK, replace(IF_BLOCK, 'Container(b, "B", "Go")', 'Container(b, "B", "Rust")')],
    ["Change container `b`: technology [probable]"],
  ],
  [
    "an edit inside a procedure falls back or is probable",
    () => [PROCEDURE, replace(PROCEDURE, 'Container($name, "Service")', 'Container($name, "Backend service")')],
    ["Change container `$name`: label [probable]"],
  ],
];

describe("C4 semantic review", () => {
  it.each(CASES)("reviews %s", (_name, build, expected) => {
    const [before, after] = build();
    expect(review(before, after).map((group) => `${group.title} [${group.confidence}]`)).toEqual(expected);
  });

  it("falls back to the line review when a side has no C4 declarations", () => {
    expect(summary(review("@startuml\n@enduml", BASE))).toEqual(["Unclassified source change [unclassified]"]);
    expect(summary(review(BASE, "@startuml\nA -> B\n@enduml"))).toEqual(["Unclassified source change [unclassified]"]);
  });

  it("reviews real edits of the starters", () => {
    const container = C4_STARTERS.find((starter) => starter.level === "container")!.source;
    const deployment = C4_STARTERS.find((starter) => starter.level === "deployment")!.source;
    const next = edited(
      updateC4Argument(
        edited(
          addC4Element(container, {
            macro: "ContainerDb",
            alias: "cache",
            label: "Cache",
            technology: "Redis",
            parent: "shop",
          }),
        ),
        { kind: "element", alias: "web" },
        "technology",
        "Vue",
      ),
    );
    const groups = review(container, next);
    expect(summary(groups)).toEqual([
      "Change container `web`: technology [confirmed]",
      "Add container `cache` [confirmed]",
    ]);
    // Each confirmed group applies on its own.
    expect(applyReviewGroups(container, groups, new Set([groups[0]!.id]))).toBe(
      edited(updateC4Argument(container, { kind: "element", alias: "web" }, "technology", "Vue")),
    );
    expect(applyReviewGroups(container, groups, new Set(groups.map((group) => group.id)))).toBe(next);
    expect(groups.map((group) => group.rightTargets)).toEqual([
      [{ kind: "c4-element", id: "web", label: "Web app", alias: "web" }],
      [{ kind: "c4-element", id: "cache", label: "Cache", alias: "cache" }],
    ]);

    const renamed = review(container, edited(renameC4Alias(container, "api", "orders_api")));
    expect(renamed.every((group) => group.confidence === "probable")).toBe(true);
    expect(renamed[0]!.detail).toContain(
      "Container “API”: alias api → orders_api; 3 lines referring to it were updated",
    );
    expect(summary(review(deployment, edited(renameC4Alias(deployment, "cloud", "region"))))).toEqual([
      "Rename `cloud` → `region` [confirmed]",
    ]);
  });

  it("explains a re-pointed and a reversed relationship", () => {
    const withCache = replace(
      BASE,
      'Rel(web, db, "Reads and writes")',
      'Rel(web, db, "Reads and writes")\nContainerDb(cache, "Cache")',
    );
    const repointed = review(withCache, replace(withCache, "Rel(web, db,", "Rel(web, cache,"))[0]!;
    expect(repointed.detail).toBe("`web → db` now `web → cache`.");
    const reversed = review(BASE, edited(reverseC4Relationship(BASE, 1)))[0]!;
    expect(reversed.detail).toBe("`web → db` is now `db → web`.");
  });

  it("does not treat a renamed end as a re-pointed relationship", () => {
    const renamed = edited(renameC4Alias(BASE, "db", "data"));
    const titles = review(BASE, renamed).map((group) => group.title);
    expect(titles.join(" ")).not.toContain("Re-point");
    expect(titles).toEqual(["Rename `db` → `data` (part 1)", "Rename `db` → `data` (part 2)"]);
  });

  it("treats comments and formatting as changes without meaning", () => {
    expect(summary(review(BASE, replace(BASE, "title Shop", "' note\ntitle Shop")))).toEqual([
      "Edit comments or blank lines [confirmed]",
    ]);
    expect(summary(review(BASE, replace(BASE, 'Container(web, "Web app"', 'Container( web , "Web app"')))).toEqual([
      "Reorder or reformat C4 declarations [confirmed]",
    ]);
  });

  it("reaches the AI edit review, the Propose description and the project review", () => {
    const after = edited(updateC4Argument(BASE, { kind: "element", alias: "web" }, "label", "Storefront"));
    const proposal = reviewProposal("c4", BASE, after, undefined);
    expect(proposal.groups.map((group) => group.title)).toEqual(["Change container `web`: label"]);
    expect(proposal.initiallySelected.size).toBe(1);
    const markdown = createReviewMarkdown("docs/shop.puml", BASE, after, buildReviewGroups(BASE, after, "c4"));
    expect(markdown).toContain("Change container");
    expect(markdown).toMatch(/Web app.*Storefront/);
  });
});
