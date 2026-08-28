export type ViewMode = "code" | "split" | "diagram";
export type Theme = "light" | "dark" | "system";
export type RenderStatus = "idle" | "rendering" | "error";
export type DiagramKind = "gantt" | "sequence" | "usecase" | "class" | "activity" | "wbs";

export interface RenderRequest {
  requestId: number;
  source: string;
}

export interface RenderResult {
  requestId: number;
  svg?: string | undefined;
  durationMs: number;
  error?: string | undefined;
}

export const DEFAULT_SOURCE = `@startgantt

Project starts 2026-09-01
saturday are closed
sunday are closed

[Architecture] starts 2026-09-01
[Architecture] lasts 4 days

[Backend] starts 2026-09-05
[Backend] lasts 8 days

[Frontend] starts 2026-09-05
[Frontend] lasts 10 days

[Testing] starts 2026-09-13
[Testing] lasts 5 days

@endgantt`;

export const DEFAULT_SEQUENCE_SOURCE = `@startuml
participant User
participant System

User -> System: Request
System --> User: Response
@enduml`;

export const DEFAULT_USECASE_SOURCE = `@startuml
left to right direction

actor Customer

rectangle "Ordering system" {
  usecase "Browse products" as Browse
  usecase "Place order" as Order
  usecase "Process payment" as Payment
}

Customer --> Browse
Customer --> Order
Order ..> Payment : <<include>>

@enduml`;

export const DEFAULT_CLASS_SOURCE = `@startuml
skinparam classAttributeIconSize 0

package "Ordering" {
  class Order {
    -id: UUID
    +submit(): void
  }
  class OrderLine {
    +quantity: int
  }
  interface OrderRepository {
    +save(order: Order): void
  }
}

Order "1" *-- "many" OrderLine
OrderRepository ..> Order : persists
@enduml`;

export const DEFAULT_ACTIVITY_SOURCE = `@startuml
start

partition "Order processing" {
  :Receive order;
  if (Payment valid?) then (yes)
    :Reserve stock;
    fork
      :Create shipment;
    fork again
      :Send confirmation;
    end fork
  else (no)
    :Request new payment details;
  endif
}

stop
@enduml`;

export const DEFAULT_WBS_SOURCE = `@startwbs
* Website redesign
** Discovery
*** Stakeholder interviews
*** Content inventory
** Design
*** Information architecture
*** Visual design
** Delivery
*** Frontend implementation
*** Quality assurance
@endwbs`;
