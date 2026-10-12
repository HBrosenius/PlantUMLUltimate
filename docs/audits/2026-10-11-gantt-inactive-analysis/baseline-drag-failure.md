# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: editor-gantt.spec.ts >> clears baseline variance when a moved task returns to its original dates
- Location: tests\e2e\editor-gantt.spec.ts:298:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.schedule-analysis-report summary')
Expected substring: "0 changed tasks"
Received string:    "Baseline · 1 changed task · 0 dependency changes"
Timeout: 8000ms

Call log:
  - Expect "toContainText" with timeout 8000ms
  - waiting for locator('.schedule-analysis-report summary')
    20 × locator resolved to <summary>…</summary>
       - unexpected value "Baseline · 1 changed task · 0 dependency changes"

```

```yaml
- text: Baseline · 1 changed task · 0 dependency changes
```

# Test source

```ts
  242 |   await page.keyboard.press("Shift+F10");
  243 |   await menu.getByRole("menuitem", { name: "Rename…" }).click();
  244 |   const rename = page.getByRole("dialog", { name: "Rename task" });
  245 |   await rename.getByLabel("New name").fill("Compile");
  246 |   await rename.getByRole("button", { name: "Rename" }).click();
  247 |   await expect(page.locator(".cm-content")).toContainText("[Compile] lasts 3 days");
  248 |   await expect(page.locator(".cm-content")).toContainText("[Compile]'s end");
  249 |   await expect(page.locator('[data-task-id="compile"][tabindex="0"]').first()).toBeFocused();
  250 | });
  251 | 
  252 | test("duplicates a task from source and diagram context menus", async ({ page }) => {
  253 |   await setSource(page, source("[Build] on {Alice} lasts 3 days\n[Build] is colored in Blue"));
  254 |   const sourceTask = await pointInText(page, 3, "Build");
  255 |   await page.mouse.click(sourceTask.x, sourceTask.y, { button: "right" });
  256 |   await page.getByRole("menuitem", { name: "Duplicate task" }).click();
  257 |   await expect(page.locator(".cm-content")).toContainText("[Build copy] on {Alice} lasts 3 days");
  258 |   await expect(page.locator(".cm-content")).toContainText("[Build copy] is colored in Blue");
  259 | 
  260 |   const diagramCopy = page.locator('[data-task-id="build copy"]').first();
  261 |   await expect(diagramCopy).toBeVisible();
  262 |   await diagramCopy.click({ button: "right" });
  263 |   await page.getByRole("menuitem", { name: "Duplicate task" }).click();
  264 |   await expect(page.locator(".cm-content")).toContainText("[Build copy 2] on {Alice} lasts 3 days");
  265 | });
  266 | 
  267 | test("reports added, removed, moved, and out-of-range baseline tasks", async ({ page }) => {
  268 |   await setSource(page, source("[A] starts 2026-09-01\n[A] lasts 2 days\n[B] starts 2026-09-04\n[B] lasts 2 days"));
  269 |   // setSource deliberately accepts the previous successful SVG while a new render is pending.
  270 |   // Wait for this fixture's semantic overlay before capturing the version so slow CI browsers do
  271 |   // not accidentally store the default diagram as the baseline.
  272 |   await expect(page.locator('[data-task-id="a"]')).toBeVisible();
  273 |   await expect(page.locator('[data-task-id="b"]')).toBeVisible();
  274 |   await page.getByRole("button", { name: "File" }).click();
  275 |   await page.getByRole("menuitem", { name: "Version history…" }).click();
  276 |   const history = page.getByRole("dialog", { name: "Version history" });
  277 |   await history.getByLabel("New version name").fill("Planning baseline");
  278 |   await history.getByRole("button", { name: "Create version" }).click();
  279 |   await history.getByRole("button", { name: "Set as baseline" }).click();
  280 |   await history.getByRole("button", { name: "Close", exact: true }).click();
  281 | 
  282 |   await setSource(
  283 |     page,
  284 |     "@startgantt\nProject starts 2026-10-01\n[B] starts 2026-10-03\n[B] lasts 3 days\n[C] starts 2026-10-08\n[C] lasts 2 days\n@endgantt",
  285 |   );
  286 |   const report = page.locator(".schedule-analysis-report");
  287 |   await report.locator("summary").click();
  288 |   await expect(report).toContainText("A");
  289 |   await expect(report).toContainText("Removed after baseline");
  290 |   await expect(report).toContainText("C");
  291 |   await expect(report).toContainText("Added after baseline");
  292 |   await expect(report).toContainText("outside visible timeline");
  293 |   await expect(page.locator(".removed-baseline-lane")).toBeVisible();
  294 |   await expect(page.locator('.removed-baseline-bar[data-baseline-task-id="a"]')).toBeVisible();
  295 |   await expect(page.locator(".removed-baseline-label")).toContainText("A");
  296 | });
  297 | 
  298 | test("clears baseline variance when a moved task returns to its original dates", async ({ page, browserName }) => {
  299 |   test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  300 |   await setSource(
  301 |     page,
  302 |     "@startgantt\nProject starts 2026-10-01\n[Frontend] starts 2026-10-02\n[Frontend] lasts 10 days\n@endgantt",
  303 |   );
  304 |   await page.getByRole("button", { name: "File" }).click();
  305 |   await page.getByRole("menuitem", { name: "Version history…" }).click();
  306 |   const history = page.getByRole("dialog", { name: "Version history" });
  307 |   await history.getByLabel("New version name").fill("Original schedule");
  308 |   await history.getByRole("button", { name: "Create version" }).click();
  309 |   await history.getByRole("button", { name: "Set as baseline" }).click();
  310 |   await history.getByRole("button", { name: "Close", exact: true }).click();
  311 |   await expect(page.locator('[data-timeline-header="top"]').nth(1)).toBeVisible({ timeout: 20_000 });
  312 | 
  313 |   const task = page.locator('[data-task-id="frontend"]');
  314 |   const dragByDays = async (days: number) => {
  315 |     await waitForDiagramRender(page);
  316 |     const headers = page.locator('[data-timeline-header="top"]');
  317 |     await expect(headers.nth(1)).toBeVisible();
  318 |     let dayWidth = 0;
  319 |     await expect
  320 |       .poll(async () => {
  321 |         dayWidth = await headers.evaluateAll((elements) => {
  322 |           if (elements.length < 2) return 0;
  323 |           return elements[1].getBoundingClientRect().x - elements[0].getBoundingClientRect().x;
  324 |         });
  325 |         return dayWidth;
  326 |       })
  327 |       .toBeGreaterThan(0);
  328 |     const pixels = dayWidth * days;
  329 |     const box = await task.locator(".bar").boundingBox();
  330 |     expect(box).not.toBeNull();
  331 |     const x = box!.x + box!.width / 2;
  332 |     const y = box!.y + box!.height / 2;
  333 |     await page.mouse.move(x, y);
  334 |     await page.mouse.down();
  335 |     await page.mouse.move(x + pixels, y, { steps: 4 });
  336 |     await page.mouse.up();
  337 |   };
  338 |   await dragByDays(3);
  339 |   await expect(page.locator(".schedule-analysis-report summary")).toContainText("1 changed task");
  340 |   await expect(page.locator('[data-baseline-task-id="frontend"]')).toBeVisible();
  341 |   await dragByDays(-3);
> 342 |   await expect(page.locator(".schedule-analysis-report summary")).toContainText("0 changed tasks");
      |                                                                   ^ Error: expect(locator).toContainText(expected) failed
  343 |   await expect(page.locator('[data-baseline-task-id="frontend"]')).toHaveCount(0);
  344 | });
  345 | 
  346 | test("groups creation commands in an accessible Add menu", async ({ page }) => {
  347 |   const modifier = await page.evaluate(() => (/Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "⌥" : "Alt+"));
  348 |   const add = page.getByRole("button", { name: "Add", exact: true });
  349 |   await add.click();
  350 |   const menu = page.getByRole("menu", { name: "Add" });
  351 |   await expect(menu.getByRole("menuitem")).toHaveText([
  352 |     `Task…${modifier}T`,
  353 |     `Milestone…${modifier}M`,
  354 |     `Divider…${modifier}D`,
  355 |     "Closed day…",
  356 |   ]);
  357 |   await menu.getByRole("menuitem", { name: "Milestone…" }).click();
  358 |   await expect(page.getByRole("dialog", { name: "Add milestone" })).toBeVisible();
  359 |   await page.keyboard.press("Escape");
  360 |   await expect(page.getByRole("dialog", { name: "Add milestone" })).toBeHidden();
  361 | });
  362 | 
  363 | test("opens creation dialogs with keyboard shortcuts", async ({ page }) => {
  364 |   await page.getByRole("button", { name: "Add", exact: true }).focus();
  365 |   await page.keyboard.press("Alt+t");
  366 |   await expect(page.getByRole("dialog", { name: "Add task" })).toBeVisible();
  367 |   await page.keyboard.press("Alt+m");
  368 |   await expect(page.getByRole("dialog", { name: "Add milestone" })).toBeHidden();
  369 |   await page.keyboard.press("Escape");
  370 | 
  371 |   await page.keyboard.press("Alt+m");
  372 |   await expect(page.getByRole("dialog", { name: "Add milestone" })).toBeVisible();
  373 |   await page.keyboard.press("Escape");
  374 | 
  375 |   await page.keyboard.press("Alt+d");
  376 |   await expect(page.getByRole("dialog", { name: "Add separator" })).toBeVisible();
  377 |   await page.keyboard.press("Escape");
  378 | 
  379 |   await page.locator(".cm-content").click();
  380 |   await page.keyboard.press("Alt+t");
  381 |   await expect(page.getByRole("dialog", { name: "Add task" })).toBeVisible();
  382 | });
  383 | 
  384 | test("creates standalone tasks with a movable project-start date", async ({ page }) => {
  385 |   await setSource(page, source("[Existing] starts 2026-09-01 and lasts 2 days"));
  386 |   await openAddDialog(page, "Task…");
  387 |   const dialog = page.getByRole("dialog", { name: "Add task" });
  388 |   await dialog.getByLabel("Name").fill("New task");
  389 |   await expect(dialog.getByLabel("Start date")).toHaveValue("2026-09-01");
  390 |   await dialog.getByRole("button", { name: "Add task" }).click();
  391 |   await expect(page.locator(".cm-content")).toContainText("[New task] starts 2026-09-01");
  392 | 
  393 |   const task = page.locator('[data-task-id="new task"]');
  394 |   await expect(task).toHaveAttribute("data-draggable", "true");
  395 |   // Keep the task and drag destination inside the canvas on every browser's SVG scale.
  396 |   await page.getByRole("button", { name: "Fit diagram", exact: true }).click();
  397 |   await task.locator(".bar").scrollIntoViewIfNeeded();
  398 |   const bar = await task.locator(".bar").boundingBox();
  399 |   expect(bar).not.toBeNull();
  400 |   await page.mouse.move(bar!.x + bar!.width / 2, bar!.y + bar!.height / 2);
  401 |   await page.mouse.down();
  402 |   await page.mouse.move(bar!.x + bar!.width / 2 + 80, bar!.y + bar!.height / 2, { steps: 4 });
  403 |   await page.mouse.up();
  404 |   await expect(page.locator(".cm-content")).not.toContainText("[New task] starts 2026-09-01");
  405 | });
  406 | 
  407 | test("places a newly added task on the selected task row", async ({ page, browserName }) => {
  408 |   test.setTimeout(browserName === "webkit" ? 120_000 : 60_000);
  409 |   await openAddDialog(page, "Task…");
  410 |   const dialog = page.getByRole("dialog", { name: "Add task" });
  411 |   await dialog.getByLabel("Name").fill("New task");
  412 |   await dialog.getByRole("button", { name: "Add task" }).click();
  413 | 
  414 |   await page.locator('[data-task-id="new task"] .bar').click();
  415 |   const inspector = page.getByRole("complementary", { name: "Task inspector" });
  416 |   await inspector.getByText("Appearance", { exact: true }).click();
  417 |   await inspector.getByLabel("Display on same row as").selectOption("architecture");
  418 |   await expect(page.locator(".render-notice.rendering")).toBeHidden({ timeout: 45_000 });
  419 | 
  420 |   await expect(page.locator(".cm-content")).toContainText("[New task] displays on same row as [Architecture]");
  421 |   await expect(page.locator(".cm-content")).toContainText("[New task] starts at [Architecture]'s end");
  422 |   await expect
  423 |     .poll(async () => {
  424 |       const architecture = await page.locator('[data-task-id="architecture"] .bar').boundingBox();
  425 |       const newTask = await page.locator('[data-task-id="new task"] .bar').boundingBox();
  426 |       if (!architecture || !newTask) return undefined;
  427 |       return {
  428 |         sameRow: Math.abs(architecture.y - newTask.y) < 2,
  429 |         separated: newTask.x >= architecture.x + architecture.width,
  430 |       };
  431 |     })
  432 |     .toEqual({ sameRow: true, separated: true });
  433 | });
  434 | 
  435 | test("suggests inline task continuations after a fixed start date", async ({ page }) => {
  436 |   await setSource(page, source("[New task] starts 2026-09-01"));
  437 |   const taskLine = page.locator(".cm-line").filter({ hasText: "[New task] starts 2026-09-01" });
  438 |   await taskLine.click();
  439 |   await page.keyboard.press("End");
  440 |   await page.keyboard.type(" ");
  441 |   const completions = page.locator(".cm-tooltip-autocomplete");
  442 |   await expect(completions).toBeVisible();
```