/**
 * Starters for the five C4 diagram types. Each includes the bundled C4-PlantUML library, so it renders
 * offline, and uses only macros that library defines (checked by a test). Aliases are declared before use.
 */
export type C4Level = "context" | "container" | "component" | "dynamic" | "deployment";

export interface C4Starter {
  level: C4Level;
  title: string;
  description: string;
  source: string;
}

export const C4_STARTERS: readonly C4Starter[] = [
  {
    level: "context",
    title: "C4 System context",
    description: "A system, the people who use it and the other systems it talks to.",
    source: `@startuml
!include <C4/C4_Context>

title System context for the web shop

Person(customer, "Customer", "Buys products online")
System(shop, "Web shop", "Lets customers browse and order products")
System_Ext(payments, "Payment provider", "Takes card payments")
System_Ext(mail, "Mail service", "Sends order confirmations")

Rel(customer, shop, "Browses and orders", "HTTPS")
Rel(shop, payments, "Takes payments", "HTTPS")
Rel(shop, mail, "Sends confirmations", "SMTP")
@enduml`,
  },
  {
    level: "container",
    title: "C4 Container",
    description: "The applications and data stores inside one system, and how they talk.",
    source: `@startuml
!include <C4/C4_Container>

title Containers of the web shop

Person(customer, "Customer", "Buys products online")
System_Boundary(shop, "Web shop") {
  Container(web, "Web app", "React", "Shows the catalogue and the basket")
  Container(api, "API", "Java, Spring Boot", "Orders, payments and stock")
  ContainerDb(db, "Database", "PostgreSQL", "Orders and customers")
}
System_Ext(payments, "Payment provider", "Takes card payments")

Rel(customer, web, "Uses", "HTTPS")
Rel(web, api, "Calls", "JSON/HTTPS")
Rel(api, db, "Reads and writes", "SQL")
Rel(api, payments, "Takes payments", "HTTPS")
@enduml`,
  },
  {
    level: "component",
    title: "C4 Component",
    description: "The building blocks inside one container.",
    source: `@startuml
!include <C4/C4_Component>

title Components of the API

Container(web, "Web app", "React", "Calls the API")
ContainerDb(db, "Database", "PostgreSQL", "Orders and customers")
Container_Boundary(api, "API") {
  Component(orders, "Order controller", "Spring MVC", "Receives order requests")
  Component(service, "Order service", "Java", "Order rules")
  Component(repository, "Order repository", "Spring Data", "Stores orders")
}

Rel(web, orders, "Calls", "JSON/HTTPS")
Rel(orders, service, "Uses")
Rel(service, repository, "Uses")
Rel(repository, db, "Reads and writes", "SQL")
@enduml`,
  },
  {
    level: "dynamic",
    title: "C4 Dynamic",
    description: "Numbered steps of one scenario between the elements.",
    source: `@startuml
!include <C4/C4_Dynamic>

title Placing an order

Person(customer, "Customer", "Buys products online")
Container(web, "Web app", "React", "Shows the basket")
Container(api, "API", "Java, Spring Boot", "Orders and payments")
ContainerDb(db, "Database", "PostgreSQL", "Orders")

Rel(customer, web, "Presses Order")
Rel(web, api, "Sends the order", "JSON/HTTPS")
Rel(api, db, "Stores the order", "SQL")
Rel(api, web, "Confirms", "JSON/HTTPS")
@enduml`,
  },
  {
    level: "deployment",
    title: "C4 Deployment",
    description: "Where the containers run: nodes, servers and the cloud.",
    source: `@startuml
!include <C4/C4_Deployment>

title Deployment of the web shop

Deployment_Node(cloud, "Cloud region", "Managed hosting") {
  Deployment_Node(app, "App server", "Linux, Docker") {
    Container(api, "API", "Java, Spring Boot", "Orders and payments")
  }
  Deployment_Node(data, "Database server", "Managed PostgreSQL") {
    ContainerDb(db, "Database", "PostgreSQL", "Orders")
  }
}

Rel(api, db, "Reads and writes", "SQL")
@enduml`,
  },
];

export const c4StarterSource = (level: C4Level): string =>
  C4_STARTERS.find((starter) => starter.level === level)!.source;
