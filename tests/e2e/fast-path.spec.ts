import { expect, test } from "@playwright/test";

import { makeUser, register } from "./fixtures";

/**
 * Starting a project from the dashboard.
 *
 * Two things are covered here. The disclosure — the dashboard shows existing
 * work, so a permanently-open form with an empty field, a dropdown and two
 * buttons made starting a project look like the main event on a page about
 * everything else. And the fast path itself, driven through the real UI rather
 * than the action, because the integration tests already cover the action and
 * what was left unproven was the wiring.
 */

test.describe("starting a project", () => {
  test("the form stays out of the way until it is asked for", async ({ page }) => {
    const user = makeUser("disclosure");
    await register(page, user);

    // Closed: one button, nothing else.
    await expect(page.getByRole("button", { name: "Create New Project" })).toBeVisible();
    await expect(page.getByLabel("Project topic")).toHaveCount(0);
    await expect(page.getByLabel("Type")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Skip setup" })).toHaveCount(0);

    await page.getByRole("button", { name: "Create New Project" }).click();

    // Opened: the two things that actually shape the document, and the choice.
    await expect(page.getByLabel("Project topic")).toBeVisible();
    await expect(page.getByLabel("Type")).toBeVisible();
    await expect(page.getByRole("button", { name: "Set up my project" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip setup" })).toBeVisible();
  });

  test("cancelling puts it away again", async ({ page }) => {
    const user = makeUser("cancel");
    await register(page, user);

    await page.getByRole("button", { name: "Create New Project" }).click();
    await expect(page.getByLabel("Project topic")).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByLabel("Project topic")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create New Project" })).toBeVisible();
  });

  test("skipping setup builds a structured project and stops at the blueprint", async ({
    page,
  }) => {
    const user = makeUser("skip");
    await register(page, user);

    await page.getByRole("button", { name: "Create New Project" }).click();
    await page
      .getByLabel("Project topic")
      .fill("Effect of mobile phone use on sleep quality among nursing students");
    await page.getByRole("button", { name: "Skip setup" }).click();

    // The blueprint, NOT a running generation — a run costs real money, so a
    // typo must not be able to start one.
    await page.waitForURL(/\/projects\/[^/]+\/blueprint/, { timeout: 30_000 });

    // A structure it can generate against.
    await expect(page.getByText("1.1 Background to the Study")).toBeVisible();

    // And an honest account of everything that was skipped, rather than
    // invented values standing in for it.
    await expect(page.getByText("Not provided yet").first()).toBeVisible();
  });

  test("refuses a topic too short to build anything from", async ({ page }) => {
    const user = makeUser("short");
    await register(page, user);

    await page.getByRole("button", { name: "Create New Project" }).click();
    await page.getByLabel("Project topic").fill("test");

    // The fast path builds a whole document from this one sentence, so it is
    // disabled rather than accepting something that would shape a project
    // around nothing.
    await expect(page.getByRole("button", { name: "Skip setup" })).toBeDisabled();
  });
});

test.describe("the shell", () => {
  test("the sidebar stays put while the page scrolls", async ({ page }) => {
    const user = makeUser("sticky");
    await register(page, user);
    await page.setViewportSize({ width: 1280, height: 800 });

    const sidebar = page.getByRole("complementary", { name: "Primary" });
    await expect(sidebar).toBeVisible();

    // A long page — the blueprint runs to several thousand pixels.
    await page.evaluate(() => window.scrollTo(0, 400));

    // It scrolled off the top before this was sticky, leaving nowhere to
    // navigate from on a long page.
    const top = await sidebar.evaluate((el) => Math.round(el.getBoundingClientRect().top));
    expect(top).toBe(0);
    await expect(sidebar.getByRole("link", { name: "Dashboard" })).toBeVisible();
  });

  test("the breadcrumb inside a project does not lead to a dead page", async ({ page }) => {
    const user = makeUser("crumb");
    await register(page, user);

    await page.getByRole("button", { name: "Create New Project" }).click();
    await page.getByLabel("Project topic").fill("Breadcrumb destination check");
    await page.getByRole("button", { name: "Set up my project" }).click();
    await page.waitForURL(/\/projects\/[^/]+\/wizard\/1/, { timeout: 30_000 });

    // "/projects" has no page — projects live at "/projects/[id]" and the list
    // of them is the dashboard. This crumb used to 404 from inside every
    // project.
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await breadcrumb.getByRole("link", { name: "Projects" }).click();

    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "My Projects" })).toBeVisible();
  });
});
