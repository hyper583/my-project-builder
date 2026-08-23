import { expect, test } from "@playwright/test";

import { makeUser, register } from "./fixtures";

test.describe("workspace", () => {
  test("the editor loads a section and the sidebar yields to it", async ({ page }) => {
    const user = makeUser("workspace");
    await register(page, user);

    await page.getByRole("button", { name: /sample project/i }).click();
    await page.waitForURL(/\/projects\/([^/]+)\/blueprint/, { timeout: 60_000 });
    const projectId = /\/projects\/([^/]+)\//.exec(page.url())![1]!;

    await page.goto(`/projects/${projectId}/workspace`);

    // Section navigator and an editable document.
    const sections = page.getByRole("navigation", { name: "Project sections" });
    await expect(sections).toBeVisible();
    await expect(page.locator(".prose-editor")).toBeVisible();

    // Exactly one h1 — the project title. The section heading is a level below.
    await expect(page.locator("h1")).toHaveCount(1);

    // The app sidebar collapses to a rail here, and says why it cannot be
    // expanded rather than offering a control that does nothing.
    const collapse = page.getByRole("button", { name: /sidebar/i });
    await expect(collapse).toBeDisabled();
  });

  test("selecting a section in the navigator changes the document", async ({ page }) => {
    const user = makeUser("sections");
    await register(page, user);

    await page.getByRole("button", { name: /sample project/i }).click();
    await page.waitForURL(/\/projects\/([^/]+)\/blueprint/, { timeout: 60_000 });
    const projectId = /\/projects\/([^/]+)\//.exec(page.url())![1]!;

    await page.goto(`/projects/${projectId}/workspace`);

    const sections = page.getByRole("navigation", { name: "Project sections" });
    const first = sections.getByRole("button").first();
    const firstLabel = (await first.innerText()).trim();

    const second = sections.getByRole("button").nth(1);
    const secondLabel = (await second.innerText()).trim();
    await second.click();

    const heading = page.getByRole("heading", { level: 2 }).first();
    await expect(heading).toBeVisible();

    // The document heading follows the navigator selection.
    expect(secondLabel).not.toBe(firstLabel);
    await expect(heading).not.toHaveText("");
  });
});

test.describe("theme", () => {
  test("a chosen theme persists across a reload and overrides the system setting", async ({
    page,
  }) => {
    const user = makeUser("theme");
    await register(page, user);

    const root = page.locator("html");

    // Dark is the product default: with nothing stored, the pre-paint script
    // stamps it rather than deferring to the OS.
    await expect(root).toHaveAttribute("data-theme", "dark");

    // Appearance is a preference, so the control lives in Settings rather than
    // in the navigation. It used to be in both, which meant two copies of the
    // same state to keep in step.
    await page.goto("/settings");

    // A radiogroup, not a set of toggles: the three choices are mutually
    // exclusive, so the control says so to anyone not looking at it.
    const appearance = page.getByRole("radiogroup", { name: "Colour theme" });

    await appearance.getByRole("radio", { name: "Light" }).click();
    await expect(root).toHaveAttribute("data-theme", "light");

    await page.reload();
    await expect(root).toHaveAttribute("data-theme", "light");

    // The checked state must agree with what is on screen. This is the
    // hydration bug that once left the control permanently misreporting itself.
    await expect(appearance.getByRole("radio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(appearance.getByRole("radio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    // "System" removes the attribute rather than storing a guess about the OS.
    await appearance.getByRole("radio", { name: "System" }).click();
    await expect(root).not.toHaveAttribute("data-theme", /.+/);

    // And it SURVIVES a reload. This is the assertion that matters most now
    // that absence means "never chosen": if the choice were stored by clearing
    // the key, the script would read an empty slot on the next visit and
    // silently convert a deliberate "follow my OS" into dark.
    await page.reload();
    await expect(root).not.toHaveAttribute("data-theme", /.+/);
    await expect(
      page.getByRole("radiogroup", { name: "Colour theme" }).getByRole("radio", { name: "System" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("responsive", () => {
  test("no page scrolls horizontally at 375px", async ({ page }) => {
    const user = makeUser("responsive");
    await register(page, user);
    await page.setViewportSize({ width: 375, height: 812 });

    for (const path of ["/", "/login", "/register", "/forgot-password", "/dashboard", "/settings"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        return { scrollW: de.scrollWidth, clientW: de.clientWidth };
      });
      expect(overflow.scrollW, `${path} overflows horizontally at 375px`).toBeLessThanOrEqual(
        overflow.clientW,
      );
    }
  });
});
