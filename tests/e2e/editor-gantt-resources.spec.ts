import { openRibbonGroup, prepareEditor, setSource, source, waitForDiagramRender } from "./editor-helpers";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
});

test("migrates dependencies in every persisted open Gantt tab on reload", async ({ page }) => {
  // Seed storage with the app unmounted so an autosave cannot overwrite the fixture.
  await page.route("**/__migration_fixture", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Migration fixture</title>" }),
  );
  await page.goto("/__migration_fixture");
  await page.evaluate(async () => {
    // This fixture deliberately seeds the older IndexedDB workspace format. Remove the
    // shared and per-window recovery snapshots so they cannot take precedence.
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("plantuml-studio.workspace.")) localStorage.removeItem(key);
    }
    const request = indexedDB.open("plantuml-studio", 2);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("workspace", "readwrite");
    transaction.objectStore("workspace").clear();
    transaction.objectStore("workspace").put(
      {
        version: 4,
        activeDocumentId: "first",
        viewMode: "split",
        splitPercent: 50,
        theme: "system",
        documents: [
          {
            id: "first",
            historyId: "history-first",
            diagramKind: "gantt",
            source:
              "@startgantt\n[Frontend] starts at [Testing]'s end\n[Frontend] lasts 3 days\n[Testing] lasts 2 days\n@endgantt",
            fileName: "first.puml",
            dirty: false,
            zoom: 1,
            cursor: { line: 1, column: 1 },
          },
          {
            id: "second",
            historyId: "history-second",
            diagramKind: "gantt",
            source: "@startgantt\n[B] starts at [A]'s end\n[B] lasts 2 days\n[A] lasts 1 day\n@endgantt",
            fileName: "second.puml",
            dirty: false,
            zoom: 1,
            cursor: { line: 1, column: 1 },
          },
        ],
      },
      "current",
    );
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });

  await page.goto("/");
  await expect(page.locator('.document-tab > button[title*="File: first.puml"]')).toBeVisible();
  await expect(page.locator('.document-tab > button[title*="File: second.puml"]')).toBeVisible();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await expect(chooser).toBeHidden();
  await expect
    .poll(async () => {
      const text = await page.locator(".cm-content").innerText();
      return text.indexOf("[Frontend] starts at [Testing]'s end") > text.indexOf("[Testing] lasts 2 days");
    })
    .toBe(true);
  await page.locator('.document-tab > button[title*="File: second.puml"]').click();
  await expect
    .poll(async () => {
      const text = await page.locator(".cm-content").innerText();
      return text.indexOf("[B] starts at [A]'s end") > text.indexOf("[A] lasts 1 day");
    })
    .toBe(true);
});

test("removes one person from a task with multiple assignments", async ({ page }) => {
  await setSource(page, source("[A] on {Kalle:100%} {Lisa:50%} starts 2026-09-01\n[A] lasts 4 days"));
  await page.locator('[data-task-id="a"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Person name")).toHaveCount(2);
  await inspector.getByRole("button", { name: "Remove Kalle" }).click();

  await expect(inspector.getByLabel("Person name")).toHaveCount(1);
  await expect(inspector.getByLabel("Person name")).toHaveValue("Lisa");
  await expect(page.locator(".cm-content")).toContainText("[A] on {Lisa:50%} starts 2026-09-01");
  await expect(page.locator(".cm-content")).not.toContainText("{Kalle:100%}");
});

test("edits an end-to-end task relationship from the task inspector", async ({ page }) => {
  await setSource(page, source("[A] starts 2026-09-01\n[A] lasts 5 days\n[B] lasts 3 days\n[B] starts at [A]'s end"));
  await page.locator('[data-task-id="b"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Linked task")).toHaveValue("a");
  await inspector.getByLabel("Relationship").selectOption("end-after-end");
  await expect(page.locator(".cm-content")).toContainText("[B] ends at [A]'s end");
  await expect(page.locator(".cm-content")).not.toContainText("[B] starts at [A]'s end");

  await expect(page.getByRole("complementary", { name: "Task inspector" }).getByLabel("Relationship")).toHaveValue(
    "end-after-end",
  );
});

test("shows an existing end-linked relationship in the task inspector", async ({ page }) => {
  await setSource(
    page,
    source(
      "[Prototype design] lasts 13 days and is colored in Lavender/LightBlue\n[Write tests] lasts 5 days and ends at [Prototype design]'s end\n[Hire tests writers] lasts 6 days and ends at [Write tests]'s start",
    ),
  );
  await page.locator('[data-task-id="write tests"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Linked task")).toHaveValue("prototype design");
  await expect(inspector.getByLabel("Relationship")).toBeEnabled();
  await expect(inspector.getByLabel("Relationship")).toHaveValue("end-after-end");
});

test("keeps the relationship choice available before selecting a linked task", async ({ page }) => {
  await setSource(page, source("[A] lasts 2 days\n[B] lasts 2 days"));
  await page.locator('[data-task-id="b"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Linked task")).toHaveValue("");
  await expect(inspector.getByLabel("Relationship")).toBeEnabled();
  await inspector.getByLabel("Relationship").selectOption("end-after-end");
  await inspector.getByLabel("Linked task").selectOption("a");
  await expect(page.locator(".cm-content")).toContainText("[B] ends at [A]'s end");
});

test("keeps resource capacities isolated between document tabs", async ({ page }) => {
  const firstSource = source("[A] on {Kalle:100%} starts 2026-09-01\n[A] lasts 2 days");
  await setSource(page, firstSource);
  await openRibbonGroup(page, "Plan", "Planning tools");
  await page.getByRole("button", { name: "Workload" }).click();
  await page.getByRole("spinbutton", { name: "Capacity for Kalle" }).fill("50");
  await expect(page.locator(".resource-card details")).toHaveCount(1);
  await page.getByRole("button", { name: "Close resource workload" }).click();
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Gantt diagram", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Create diagram", exact: true })
    .click();
  await setSource(page, firstSource.replaceAll("[A]", "[B]"));
  await openRibbonGroup(page, "Plan", "Planning tools");
  await page.getByRole("button", { name: "Workload" }).click();
  await expect(page.getByRole("spinbutton", { name: "Capacity for Kalle" })).toHaveValue("100");
  await expect(page.locator(".resource-card details")).toHaveCount(0);
});

test("shows resource over-allocation directly below the diagram", async ({ page }) => {
  await setSource(page, source("[A] on {Kalle:100%} starts 2026-09-01\n[A] lasts 2 days"));
  await openRibbonGroup(page, "Plan", "Planning tools");
  await page.getByRole("button", { name: "Workload" }).click();
  await page.getByRole("spinbutton", { name: "Capacity for Kalle" }).fill("50");
  await page.getByRole("button", { name: "Close resource workload" }).click();

  const warning = page.getByRole("alert", { name: "Resource over-allocation" });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("Kalle: 100% assigned / 50% capacity across 2 days (A)");
  await warning.getByRole("button", { name: "Review workload" }).click();
  await expect(page.getByRole("complementary", { name: "Resource workload" })).toBeVisible();
});

test("does not over-allocate a person when multiple people shorten a task", async ({ page }) => {
  await setSource(
    page,
    source(
      "saturday are closed\nsunday are closed\n[Backend] on {Kalle:100%} {Tyra:100%} starts 2026-09-07\n[Backend] lasts 8 days\n[Testing] on {Tyra:100%} starts 2026-09-14\n[Testing] lasts 5 days",
    ),
  );

  await expect(page.getByRole("alert", { name: "Resource over-allocation" })).toHaveCount(0);
  await openRibbonGroup(page, "Plan", "Planning tools");
  await page.getByRole("button", { name: "Workload" }).click();
  const tyra = page.locator(".resource-card").filter({ has: page.getByRole("button", { name: "Tyra" }) });
  await expect(tyra).toContainText("Peak 100%");
});

test.describe(() => {
  // At natural-size zoom these small plans sit low in the pane; on Linux fonts the preview toolbar wraps further
  // and the bottom-pinned baseline report / over-allocation alert would cover the bars being dragged.
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("shows resource over-allocation after dragging assigned tasks into overlap", async ({ page }) => {
    await setSource(page, source("[A] starts 2026-09-01\n[A] lasts 3 days\n[B] starts 2026-09-08\n[B] lasts 3 days"));
    for (const taskId of ["a", "b"]) {
      await page.locator(`[data-task-id="${taskId}"] .bar`).click();
      const inspector = page.getByRole("complementary", { name: "Task inspector" });
      if (!(await inspector.getByRole("button", { name: "+ Add person" }).isVisible()))
        await inspector.getByText("Resources", { exact: true }).click();
      await inspector.getByRole("button", { name: "+ Add person" }).click();
      await inspector.getByLabel("Person name").fill("Kalle");
      await inspector.getByLabel("Person name").blur();
      await expect(page.locator(".cm-content")).toContainText(
        taskId === "a" ? "[A] on {Kalle:100%} starts 2026-09-01" : "[B] on {Kalle:100%} starts 2026-09-08",
      );
    }
    const warning = page.getByRole("alert", { name: "Resource over-allocation" });
    await expect(warning).toHaveCount(0);
    const firstTask = page.locator('[data-task-id="a"] .bar');
    const secondTask = page.locator('[data-task-id="b"] .bar');
    await expect(firstTask).toBeVisible();
    await expect(secondTask).toBeVisible();
    const readRect = (task: typeof firstTask) =>
      task.evaluate((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      });
    let first = await readRect(firstTask);
    let second = await readRect(secondTask);
    await expect
      .poll(async () => {
        first = await readRect(firstTask);
        second = await readRect(secondTask);
        return Math.min(first.width, second.width);
      })
      .toBeGreaterThan(0);

    const start = { x: second.x + second.width / 2, y: second.y + second.height / 2 };
    const targetPoint = { x: first.x + first.width / 2, y: start.y };
    await secondTask.dispatchEvent("pointerdown", {
      pointerId: 19,
      pointerType: "mouse",
      button: 0,
      buttons: 1,
      clientX: start.x,
      clientY: start.y,
    });
    await page.evaluate(
      ({ x, y }) =>
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            pointerId: 19,
            pointerType: "mouse",
            buttons: 1,
            clientX: x,
            clientY: y,
          }),
        ),
      targetPoint,
    );
    await page.evaluate(
      ({ x, y }) =>
        window.dispatchEvent(
          new PointerEvent("pointerup", {
            bubbles: true,
            pointerId: 19,
            pointerType: "mouse",
            button: 0,
            clientX: x,
            clientY: y,
          }),
        ),
      targetPoint,
    );

    await expect(page.locator(".cm-content")).toContainText("[B] on {Kalle:100%} starts 2026-09-01");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Kalle: 200% assigned / 100% capacity");

    await expect
      .poll(async () => {
        const a = await page.locator('[data-task-id="a"] .bar').boundingBox();
        const b = await page.locator('[data-task-id="b"] .bar').boundingBox();
        return a && b ? Math.abs(a.x - b.x) : Number.POSITIVE_INFINITY;
      })
      .toBeLessThan(10);

    await page.locator('[data-task-id="a"] .bar').click();
    await waitForDiagramRender(page);
    await page.locator('[data-task-id="a"] [data-dependency-handle="end"]').hover();
    await page.mouse.down();
    await page.locator('[data-task-id="b"] .bar').hover();
    await page.mouse.up();

    await expect(page.locator(".cm-content")).toContainText("[B] on {Kalle:100%} starts at [A]'s end");
    await expect(warning).toHaveCount(0);
  });
});
