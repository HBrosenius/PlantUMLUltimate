import type { DiagramKind } from "./model";

export const THEME_PREVIEW_SOURCES: Record<DiagramKind, string> = {
  gantt: [
    "@startgantt",
    "Project starts 2026-09-01",
    "[Plan] lasts 3 days",
    "[Build] starts at [Plan]'s end",
    "[Build] lasts 4 days",
    "@endgantt",
  ].join("\n"),
  sequence: [
    "@startuml",
    "actor User",
    "participant App",
    "User -> App: Request",
    "App --> User: Response",
    "@enduml",
  ].join("\n"),
  usecase: ["@startuml", "actor User", "(Sign in) as Login", "User --> Login", "@enduml"].join("\n"),
  class: ["@startuml", "class Order {", "  +total(): Money", "}", "class Item", "Order *-- Item", "@enduml"].join("\n"),
  component: [
    "@startuml",
    'component "Web application" as Web',
    'component "Order service" as Orders',
    'database "Orders" as Database',
    "Web --> Orders",
    "Orders --> Database",
    "@enduml",
  ].join("\n"),
  activity: ["@startuml", "start", ":Plan;", "if (Approved?) then (yes)", "  :Build;", "endif", "stop", "@enduml"].join(
    "\n",
  ),
  wbs: ["@startwbs", "* Project", "** Discovery", "** Delivery", "@endwbs"].join("\n"),
};
