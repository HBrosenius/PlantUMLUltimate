/**
 * Task set for scripts/ai-edit-eval.mjs: 30 Sequence edits over three starting documents and 15 Gantt edits
 * over one plan (each task has a `kind`; Sequence is the default).
 * Each task has an instruction, a starting source, a selection (1-based inclusive lines) and checkable
 * expectations. Selections are written as text anchors so the sources stay easy to edit.
 */
const CHECKOUT = `@startuml
actor User
participant "Web App" as Web
participant "Order Service" as Orders
database DB

User -> Web : Place order
Web -> Orders : Create order
Orders -> DB : Save order
DB --> Orders : Saved
Orders --> Web : Order id
Web --> User : Confirmation
@enduml`;

const LOGIN = `@startuml
' Login flow v2
title Login
participant Browser
participant "Auth API" as Auth
participant "User Store" as Users #LightBlue

autonumber
Browser -> Auth : POST /login
activate Auth
Auth -> Users : Find user
Users --> Auth : User record
alt valid password
  Auth --> Browser : 200 token
else invalid password
  Auth --> Browser : 401
end
deactivate Auth
@enduml`;

const PAYMENT = `@startuml
actor Customer
participant Shop
participant Gateway
participant Bank

Customer -> Shop : Checkout
Shop -> Gateway : Charge card
Gateway -> Bank : Authorize
Bank --> Gateway : Approved
Gateway --> Shop : Paid
note right of Shop : Receipt is emailed
loop every night
  Shop -> Shop : Reconcile
end
Shop --> Customer : Receipt
@enduml`;

/** 1-based inclusive line range from the first line containing `from` to the first line containing `to`. */
function lines(source, from, to = from) {
  const all = source.split("\n");
  const start = all.findIndex((line) => line.includes(from));
  const end = all.findIndex((line, index) => index >= start && line.includes(to));
  if (start < 0 || end < 0) throw new Error(`Selection anchor not found: ${from} .. ${to}`);
  return { startLine: start + 1, endLine: end + 1 };
}
const body = (source) => ({ startLine: 2, endLine: source.split("\n").length - 1 });

const sequenceTasks = [
  {
    id: "checkout-timeout",
    title: "Add a timeout path to the database call",
    instruction: "Add a timeout path to the call to the database.",
    source: CHECKOUT,
    selection: lines(CHECKOUT, "Orders -> DB", "DB --> Orders"),
    expect: { messages: ["timeout"], contains: ["alt", "else", "end"], messageCount: { min: 6 } },
  },
  {
    id: "checkout-retry",
    title: "Retry the save up to 3 times",
    instruction: "Retry the save up to 3 times.",
    source: CHECKOUT,
    selection: lines(CHECKOUT, "Orders -> DB", "DB --> Orders"),
    expect: { contains: ["loop"], messages: ["save order"] },
  },
  {
    id: "checkout-rename",
    title: "Rename Web App to Storefront",
    instruction: 'Rename the participant "Web App" to "Storefront".',
    source: CHECKOUT,
    selection: body(CHECKOUT),
    expect: {
      participants: ["Storefront"],
      absentParticipants: ["Web App"],
      notContains: ["Web App"],
      messageCount: { min: 6, max: 6 },
    },
  },
  {
    id: "checkout-new-participant",
    title: "Add a payment service after saving",
    instruction:
      "After the order is saved, have Orders call a Payment Service to charge the customer, and show its reply back to Orders.",
    source: CHECKOUT,
    selection: lines(CHECKOUT, "Orders -> DB", "DB --> Orders"),
    expect: { contains: ["payment"], messages: ["charge"], messageCount: { min: 8 } },
  },
  {
    id: "checkout-activation",
    title: "Show Orders as active while saving",
    instruction: "Show that Orders is active while it saves the order.",
    source: CHECKOUT,
    selection: lines(CHECKOUT, "Orders -> DB", "DB --> Orders"),
    expect: { contains: ["activate Orders", "deactivate Orders"], messageCount: { min: 6, max: 6 } },
  },
  {
    id: "checkout-split-message",
    title: "Split Create order into two messages",
    instruction: "Split the 'Create order' message into two: first validate the cart, then create the order.",
    source: CHECKOUT,
    selection: lines(CHECKOUT, "Web -> Orders"),
    expect: { messages: ["validate", "create order"], messageCount: { min: 7 } },
  },
  {
    id: "checkout-note",
    title: "Add a note next to Orders",
    instruction: "Add a note next to Orders saying that creating an order is idempotent.",
    source: CHECKOUT,
    selection: lines(CHECKOUT, "Web -> Orders"),
    expect: { contains: ["note", "idempotent"], messageCount: { min: 6, max: 6 } },
  },
  {
    id: "checkout-error-reply",
    title: "Reply with an error when saving fails",
    instruction: "If saving fails, reply to the Web App with an error instead of an order id.",
    source: CHECKOUT,
    selection: lines(CHECKOUT, "Orders -> DB", "Orders --> Web"),
    expect: { messages: ["error"], contains: ["alt", "else"] },
  },
  {
    id: "checkout-needs-sla",
    title: "Ask for a missing timeout value",
    instruction: "Add the timeout from our SLA to the database call.",
    source: CHECKOUT,
    selection: lines(CHECKOUT, "Orders -> DB"),
    expect: { shouldAsk: true },
  },
  {
    id: "checkout-autonumber",
    title: "Number the messages",
    instruction: "Number the messages.",
    source: CHECKOUT,
    selection: body(CHECKOUT),
    expect: { contains: ["autonumber"], messageCount: { min: 6, max: 6 } },
  },
  {
    id: "login-rate-limit",
    title: "Add a 429 rate-limit response",
    instruction: "Add a 429 response for when the user is rate limited.",
    source: LOGIN,
    selection: lines(LOGIN, "alt valid", "end"),
    expect: { messages: ["429"], contains: ["else"], notContains: ["autonumber stop"] },
  },
  {
    id: "login-locked",
    title: "Add a locked-account branch",
    instruction: "Add a branch for locked accounts that returns 423.",
    source: LOGIN,
    selection: lines(LOGIN, "alt valid", "end"),
    expect: { messages: ["423", "200", "401"], contains: ["else"] },
  },
  {
    id: "login-timeout",
    title: "Add a timeout on the user lookup",
    instruction: "Handle a timeout when looking up the user.",
    source: LOGIN,
    selection: lines(LOGIN, "Auth -> Users", "Users --> Auth"),
    expect: { messages: ["timeout"], contains: ["alt"] },
  },
  {
    id: "login-activate-users",
    title: "Activate the user store during lookup",
    instruction: "Show the user store as active while it looks up the user.",
    source: LOGIN,
    selection: lines(LOGIN, "Auth -> Users", "Users --> Auth"),
    expect: { contains: ["activate Users", "deactivate Users", "activate Auth"] },
  },
  {
    id: "login-rename-auth",
    title: "Rename Auth API to Identity API",
    instruction: 'Rename "Auth API" to "Identity API" everywhere.',
    source: LOGIN,
    selection: body(LOGIN),
    expect: {
      participants: ["Identity API"],
      absentParticipants: ["Auth API"],
      notContains: ["Auth API"],
      contains: ["' Login flow v2"],
    },
  },
  {
    id: "login-recolour",
    title: "Recolour the user store",
    instruction: "Change the colour of the user store to LightGreen.",
    source: LOGIN,
    selection: lines(LOGIN, 'participant "User Store"'),
    expect: { contains: ["LightGreen"], notContains: ["LightBlue"], messageCount: { min: 4, max: 4 } },
  },
  {
    id: "login-audit",
    title: "Log failed logins to an audit log",
    instruction: "When the login fails, write an entry to an Audit log.",
    source: LOGIN,
    selection: lines(LOGIN, "else invalid", "Auth --> Browser : 401"),
    expect: { contains: ["audit"], messages: ["401"] },
  },
  {
    id: "login-title",
    title: "Change the title, keep the comment",
    instruction: "Change the title to 'Sign in'.",
    source: LOGIN,
    selection: lines(LOGIN, "title Login"),
    expect: {
      contains: ["title Sign in", "' Login flow v2"],
      notContains: ["title Login"],
      messageCount: { min: 5, max: 5 },
    },
  },
  {
    id: "login-welcome-mail",
    title: "Send a welcome email after login",
    instruction: "After a successful login, send a welcome email through a Mailer.",
    source: LOGIN,
    selection: lines(LOGIN, "valid password", "200 token"),
    expect: { contains: ["mailer"], messages: ["200"] },
  },
  {
    id: "login-group",
    title: "Group the lookup in a box",
    instruction: "Wrap the two lines that look up the user in a group called Lookup.",
    source: LOGIN,
    selection: lines(LOGIN, "Auth -> Users", "Users --> Auth"),
    expect: { contains: ["group Lookup"], messageCount: { min: 5 } },
  },
  {
    id: "payment-declined",
    title: "Tell the customer when the bank declines",
    instruction: "If the bank declines the payment, tell the customer.",
    source: PAYMENT,
    selection: lines(PAYMENT, "Gateway -> Bank", "Gateway --> Shop"),
    expect: { messages: ["declin"], contains: ["alt", "else"] },
  },
  {
    id: "payment-timeout",
    title: "Add a timeout on the bank call",
    instruction: "Add a timeout path to the call to the bank.",
    source: PAYMENT,
    selection: lines(PAYMENT, "Gateway -> Bank", "Bank --> Gateway"),
    expect: { messages: ["timeout"], contains: ["alt"] },
  },
  {
    id: "payment-sms",
    title: "Optional SMS receipt",
    instruction: "Optionally send a receipt by SMS if the customer opted in.",
    source: PAYMENT,
    selection: lines(PAYMENT, "Shop --> Customer"),
    expect: { contains: ["opt"], messages: ["sms", "receipt"] },
  },
  {
    id: "payment-loop-label",
    title: "Reconcile every hour",
    instruction: "Make the nightly reconcile run every hour instead.",
    source: PAYMENT,
    selection: lines(PAYMENT, "loop every night", "end"),
    expect: { contains: ["loop every hour"], notContains: ["every night"], messages: ["reconcile"] },
  },
  {
    id: "payment-remove-note",
    title: "Remove the receipt note",
    instruction: "Remove the note about the receipt.",
    source: PAYMENT,
    selection: lines(PAYMENT, "note right of Shop"),
    expect: { notContains: ["note right of Shop", "emailed"], messageCount: { min: 6 } },
  },
  {
    id: "payment-database-kind",
    title: "Declare Bank as a database",
    instruction: "Show Bank as a database symbol.",
    source: PAYMENT,
    selection: lines(PAYMENT, "participant Bank"),
    expect: { contains: ["database Bank"], notContains: ["participant Bank"], messageCount: { min: 6 } },
  },
  {
    id: "payment-self-message",
    title: "Add a logging self-message",
    instruction: "Add a message from Shop to itself that logs the payment.",
    source: PAYMENT,
    selection: lines(PAYMENT, "Gateway --> Shop"),
    expect: { messages: ["log"], messageCount: { min: 7 } },
  },
  {
    id: "payment-reference",
    title: "Add a reference box",
    instruction: "Add a reference box 'See fraud checks' over Gateway and Bank.",
    source: PAYMENT,
    selection: lines(PAYMENT, "Gateway -> Bank"),
    expect: { contains: ["ref over", "See fraud checks"], messageCount: { min: 6 } },
  },
  {
    id: "payment-delay",
    title: "Add a five minute delay",
    instruction: "Show a five minute delay before the reconcile step.",
    source: PAYMENT,
    selection: lines(PAYMENT, "loop every night", "end"),
    expect: { contains: ["..."], messages: ["reconcile"] },
  },
  {
    id: "payment-needs-name",
    title: "Ask for a missing name",
    instruction: "Rename the customer to the real name of the person who usually pays.",
    source: PAYMENT,
    selection: lines(PAYMENT, "actor Customer"),
    expect: { shouldAsk: true },
  },
];

const PLAN = `@startgantt
Project starts 2026-09-01
[Design] lasts 5 days
[Backend] starts at [Design]'s end
[Backend] lasts 10 days
[Frontend] starts at [Design]'s end
[Frontend] lasts 8 days
[Testing] starts at [Backend]'s end
[Testing] lasts 5 days
[Release] happens at [Testing]'s end
@endgantt`;

const gantt = (task) => ({ kind: "gantt", source: PLAN, ...task });

const ganttTasks = [
  gantt({
    id: "gantt-split-backend",
    title: "Split Backend into API and DB tasks",
    instruction:
      "Split the Backend task into two tasks, Backend API (6 days) and Backend DB (4 days), one after the other. Testing should start after the last of them.",
    selection: lines(PLAN, "[Backend] starts", "[Testing] lasts"),
    expect: {
      tasks: ["Backend API", "Backend DB", "Testing"],
      absentTasks: ["Backend"],
      contains: ["6 days", "4 days"],
    },
  }),
  gantt({
    id: "gantt-review-milestone",
    title: "Add a review milestone after Testing",
    instruction: "Add a Code review milestone after Testing and before Release happens.",
    selection: lines(PLAN, "[Testing] lasts", "[Release] happens"),
    expect: { tasks: ["Code review", "Release"], contains: ["review"] },
  }),
  gantt({
    id: "gantt-rename-frontend",
    title: "Rename Frontend to UI",
    instruction: "Rename the Frontend task to UI everywhere.",
    selection: body(PLAN),
    expect: { tasks: ["UI"], absentTasks: ["Frontend"], notContains: ["Frontend"] },
  }),
  gantt({
    id: "gantt-longer-backend",
    title: "Make Backend take 15 days",
    instruction: "Make Backend take 15 days.",
    selection: lines(PLAN, "[Backend] lasts"),
    expect: { contains: ["15 days"], notContains: ["10 days"], tasks: ["Backend"] },
  }),
  gantt({
    id: "gantt-rewire-frontend",
    title: "Frontend after Backend",
    instruction: "Make Frontend start after Backend ends instead of after Design.",
    selection: lines(PLAN, "[Frontend] starts"),
    expect: { contains: ["[Backend]'s end"], tasks: ["Frontend"] },
  }),
  gantt({
    id: "gantt-resource",
    title: "Assign Alice to Backend",
    instruction: "Assign Alice to the Backend task.",
    selection: lines(PLAN, "[Backend] starts", "[Backend] lasts"),
    expect: { contains: ["Alice"], tasks: ["Backend"] },
  }),
  gantt({
    id: "gantt-complete",
    title: "Mark Design complete",
    instruction: "Mark Design as 100% complete.",
    selection: lines(PLAN, "[Design] lasts"),
    expect: { contains: ["100%"], tasks: ["Design"] },
  }),
  gantt({
    id: "gantt-colour",
    title: "Colour Testing red",
    instruction: "Colour the Testing task red.",
    selection: lines(PLAN, "[Testing] starts", "[Testing] lasts"),
    expect: { contains: ["red"], tasks: ["Testing"] },
  }),
  gantt({
    id: "gantt-documentation",
    title: "Add a Documentation task",
    instruction: "Add a Documentation task of 3 days that starts when Design ends.",
    selection: lines(PLAN, "[Frontend] lasts"),
    expect: { tasks: ["Documentation", "Frontend", "Design"], contains: ["3 days"] },
  }),
  gantt({
    id: "gantt-remove-frontend",
    title: "Remove Frontend",
    instruction: "Remove the Frontend task.",
    selection: lines(PLAN, "[Frontend] starts", "[Frontend] lasts"),
    expect: { absentTasks: ["Frontend"], tasks: ["Design", "Backend", "Testing"] },
  }),
  gantt({
    id: "gantt-project-start",
    title: "Move the project start",
    instruction: "Start the project on 2026-10-05.",
    selection: lines(PLAN, "Project starts"),
    expect: { contains: ["2026-10-05"], notContains: ["2026-09-01"], tasks: ["Design", "Release"] },
  }),
  gantt({
    id: "gantt-note",
    title: "Add a note to Release",
    instruction: "Add a note to Release saying that it needs sign-off.",
    selection: lines(PLAN, "[Release] happens"),
    expect: { contains: ["sign-off"], tasks: ["Release"] },
  }),
  gantt({
    id: "gantt-needs-owner",
    title: "Ask for a missing owner",
    instruction: "Assign the person who actually owns Testing to that task.",
    selection: lines(PLAN, "[Testing] starts", "[Testing] lasts"),
    expect: { shouldAsk: true },
  }),
  gantt({
    id: "gantt-divider",
    title: "Add a divider before Testing",
    instruction: "Add a divider titled Delivery before the Testing task.",
    selection: lines(PLAN, "[Testing] starts"),
    expect: { contains: ["Delivery"], tasks: ["Testing"] },
  }),
  gantt({
    id: "gantt-buffer",
    title: "Add a two-day buffer",
    instruction: "Add a 2-day Buffer task between Backend and Testing.",
    selection: lines(PLAN, "[Testing] starts", "[Testing] lasts"),
    expect: { tasks: ["Buffer", "Testing", "Backend"], contains: ["2 days"] },
  }),
];

export const tasks = [...sequenceTasks, ...ganttTasks];
