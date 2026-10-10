import type { DiagramKind } from "./model";

export interface StarterExample {
  id: string;
  personal?: boolean;
  kind: DiagramKind;
  title: string;
  description: string;
  source: string;
}

// Realistic diagrams offered in the New document dialog. Every source must parse without errors in
// this app's own parsers (see starter-examples.test.ts), so keep them within the supported syntax.
export const STARTER_EXAMPLES: StarterExample[] = [
  {
    id: "product-launch-plan",
    kind: "gantt",
    title: "Product launch plan",
    description: "Phased launch with milestones, dependencies, resources and progress.",
    source: `@startgantt
title Product launch plan
Project starts 2026-10-05
saturday are closed
sunday are closed

-- Discovery --
[Market research] on {Priya} starts 2026-10-05
[Market research] lasts 8 days
[Market research] is 100% completed
[Pricing model] on {Priya:50%} starts at [Market research]'s end
[Pricing model] lasts 5 days
[Pricing model] is 60% completed
[Scope approved] happens at [Pricing model]'s end

-- Build --
[Backend services] on {Marco} starts at [Scope approved]'s end
[Backend services] lasts 15 days
[Backend services] is 20% completed
[Web experience] on {Lena} starts at [Scope approved]'s end
[Web experience] lasts 12 days
[Integration testing] on {Marco} {Lena} starts at [Backend services]'s end
[Integration testing] lasts 6 days

-- Launch --
[Marketing campaign] on {Priya} starts at [Integration testing]'s start
[Marketing campaign] lasts 8 days
[Launch day] happens at [Integration testing]'s end
@endgantt`,
  },
  {
    id: "sprint-release-schedule",
    kind: "gantt",
    title: "Sprint release schedule",
    description: "Two sprints with a code freeze, release hardening and a go-live milestone.",
    source: `@startgantt
title Release 4.2
Project starts 2026-11-02
saturday are closed
sunday are closed

[Sprint 1] starts 2026-11-02
[Sprint 1] lasts 10 days
[Sprint 1] is 100% completed
[Sprint 2] starts at [Sprint 1]'s end
[Sprint 2] lasts 10 days
[Sprint 2] is 40% completed
[Code freeze] happens at [Sprint 2]'s end
[Release hardening] starts at [Code freeze]'s end
[Release hardening] lasts 4 days
[Release notes] starts at [Code freeze]'s end
[Release notes] lasts 2 days
[Go live] happens at [Release hardening]'s end
@endgantt`,
  },
  {
    id: "website-redesign",
    kind: "wbs",
    title: "Website redesign",
    description: "Work breakdown from discovery and design through build and launch.",
    source: `@startwbs
* Website redesign
** Discovery
*** Stakeholder interviews
*** Analytics review
*** Content audit
** Design
*** Information architecture
*** Wireframes
*** Visual design system
** Build
*** Content management setup
*** Page templates
*** Accessibility fixes
** Launch
*** Redirect mapping
*** Performance testing
*** Go-live checklist
@endwbs`,
  },
  {
    id: "mobile-app-release",
    kind: "wbs",
    title: "Mobile app release",
    description: "Deliverables for shipping a new app version to both stores.",
    source: `@startwbs
* Mobile app 2.0
** Product
*** Feature specification
*** User research
** Engineering
*** iOS client
*** Android client
*** Shared API updates
** Quality
*** Automated tests
*** Beta programme
** Release
*** Store listings
*** Staged rollout
@endwbs`,
  },
  {
    id: "login-with-oauth",
    kind: "sequence",
    title: "Login with OAuth",
    description: "Authorization-code flow with consent and an alt/else for denied access.",
    source: `@startuml
title Login with OAuth
participant "Web app" as App
participant "Identity provider" as IdP
database "User store" as Users

User -> App: Click "Sign in"
App -> IdP: Redirect to authorize endpoint
IdP -> User: Show consent screen
alt consent granted
  User -> IdP: Approve access
  IdP --> App: Authorization code
  App -> IdP: Exchange code for tokens
  IdP --> App: Access and ID tokens
  App -> Users: Find or create account
  Users --> App: User profile
  App --> User: Signed in
else consent denied
  User -> IdP: Deny access
  IdP --> App: access_denied error
  App --> User: Show sign-in failed message
end
@enduml`,
  },
  {
    id: "online-shop",
    kind: "usecase",
    title: "Online shop",
    description: "Customers, staff and a payment provider around core shop use cases.",
    source: `@startuml
left to right direction

actor Customer
actor "Shop manager" as Manager
actor "Payment provider" as PSP

rectangle "Online shop" {
  usecase "Browse catalogue" as Browse
  usecase "Manage basket" as Basket
  usecase "Check out" as Checkout
  usecase "Pay for order" as Pay
  usecase "Apply discount code" as Discount
  usecase "Track order" as Track
  usecase "Manage products" as Products
}

Customer --> Browse
Customer --> Basket
Customer --> Checkout
Customer --> Track
Checkout ..> Pay : <<include>>
Discount ..> Checkout : <<extend>>
Pay --> PSP
Manager --> Products
@enduml`,
  },
  {
    id: "order-domain",
    kind: "class",
    title: "Order domain",
    description: "Packages, entities, value types and relationships for ordering.",
    source: `@startuml
skinparam classAttributeIconSize 0

package "Customers" {
  class Customer {
    -id: UUID
    +name: String
    +email: String
  }
  class Address {
    +street: String
    +city: String
    +postalCode: String
  }
}

package "Ordering" {
  class Order {
    -id: UUID
    +placedAt: DateTime
    +status: OrderStatus
    +total(): Money
    +submit(): void
  }
  class OrderLine {
    +quantity: int
    +unitPrice: Money
  }
  enum OrderStatus {
    DRAFT
    SUBMITTED
    SHIPPED
    CANCELLED
  }
  interface OrderRepository {
    +findById(id: UUID): Order
    +save(order: Order): void
  }
}

package "Catalogue" {
  class Product {
    -sku: String
    +name: String
    +price: Money
  }
}

Customer "1" --> "many" Order : places
Customer "1" *-- "1..*" Address
Order "1" *-- "many" OrderLine
OrderLine --> Product
Order --> OrderStatus
OrderRepository ..> Order : persists
@enduml`,
  },
  {
    id: "web-app-architecture",
    kind: "component",
    title: "Web app architecture",
    description: "Browser client, API gateway, services, data stores and messaging.",
    source: `@startuml
left to right direction

component "Single-page app" as SPA

node "Cloud platform" {
  component "API gateway" as Gateway
  package "Services" {
    component "Auth service" as Auth
    component "Catalogue service" as Catalogue
    component "Order service" as Orders
  }
  database "Orders database" as OrdersDb
  database "Catalogue database" as CatalogueDb
  queue "Event bus" as Events
}

SPA --> Gateway : HTTPS
Gateway --> Auth : validate token
Gateway --> Catalogue : REST
Gateway --> Orders : REST
Catalogue --> CatalogueDb : reads
Orders --> OrdersDb : reads and writes
Orders ..> Events : publishes
Catalogue ..> Events : subscribes
@enduml`,
  },
  {
    id: "order-fulfilment",
    kind: "activity",
    title: "Order fulfilment",
    description: "Payment check, parallel picking and invoicing, and shipping decisions.",
    source: `@startuml
title Order fulfilment
start

partition "Sales" {
  :Receive order;
  if (Payment authorised?) then (yes)
    :Confirm order;
  else (no)
    :Notify customer;
    stop
  endif
}

partition "Warehouse" {
  fork
    :Pick items;
    :Pack parcel;
  fork again
    :Create invoice;
  end fork
  if (Express delivery?) then (yes)
    :Book courier;
  else (no)
    :Add to daily collection;
  endif
}

:Send tracking email;
stop
@enduml`,
  },
  {
    id: "support-ticket-triage",
    kind: "activity",
    title: "Support ticket triage",
    description: "Classify incoming tickets, escalate urgent ones and loop until resolved.",
    source: `@startuml
title Support ticket triage
start
:Ticket received;
:Classify request;
if (Urgent?) then (yes)
  :Page on-call engineer;
else (no)
  :Add to support queue;
endif
repeat
  :Work on ticket;
  :Reply to customer;
repeat while (Customer confirms fix?) is (no) not (yes)
:Close ticket;
stop
@enduml`,
  },
];

/** Turns an example title into a tidy file name such as "product-launch-plan.pumlu". */
export function exampleFileName(example: Pick<StarterExample, "title">): string {
  const slug = example.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "example"}.pumlu`;
}
