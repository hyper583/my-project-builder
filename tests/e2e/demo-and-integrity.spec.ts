import { expect, test } from "@playwright/test";

import { makeUser, register } from "./fixtures";

/**
 * The safeguards the brief is built around.
 *
 * These are the tests worth having: a sample project must be unmistakably
 * labelled as illustrative, a free student must not be able to export one, and
 * an installation with no AI provider must say so rather than pretending.
 */

test.describe("demo mode and academic integrity", () => {
  test("a sample project is badged and carries its disclaimer", async ({ page }) => {
    const user = makeUser("demo");
    await register(page, user);

    await page.getByRole("button", { name: /sample project/i }).click();
    await page.waitForURL(/\/projects\/[^/]+\/blueprint/, { timeout: 60_000 });

    // The disclaimer travels with the data, so it must be on the project view.
    await expect(page.getByText(/this is a sample project/i)).toBeVisible();
    await expect(page.getByText(/illustrative/i).first()).toBeVisible();
    await expect(page.getByText(/no real study|no real participants/i).first()).toBeVisible();
  });

  test("a free student cannot export a sample, and is told why", async ({ page }) => {
    const user = makeUser("export");
    await register(page, user);

    await page.getByRole("button", { name: /sample project/i }).click();
    await page.waitForURL(/\/projects\/[^/]+\/blueprint/, { timeout: 60_000 });

    // The control explains the upgrade rather than vanishing or silently
    // producing a file — a free plan has canExportDemo: false.
    const exportControl = page.getByText(/paid plan|upgrade/i).first();
    await expect(exportControl).toBeVisible();

    // Nothing on the page offers an actual download to a free student.
    await expect(page.getByRole("link", { name: /download/i })).toHaveCount(0);
  });

  test("the dashboard shows the sample as a distinct kind of project", async ({ page }) => {
    const user = makeUser("badge");
    await register(page, user);

    await page.getByRole("button", { name: /sample project/i }).click();
    await page.waitForURL(/\/projects\/[^/]+\/blueprint/, { timeout: 60_000 });

    await page.goto("/dashboard");
    // The card pill. Amber, and the only place that word appears alone —
    // the launcher copy around it is a full sentence.
    await expect(page.getByText("Sample", { exact: true })).toBeVisible();
  });

  test("with no AI provider configured the app says so instead of faking output", async ({
    page,
  }) => {
    const user = makeUser("noai");
    await register(page, user);

    await page.getByRole("button", { name: /sample project/i }).click();
    await page.waitForURL(/\/projects\/([^/]+)\/blueprint/, { timeout: 60_000 });
    const projectId = /\/projects\/([^/]+)\//.exec(page.url())![1]!;

    await page.goto(`/projects/${projectId}/workspace`);

    // The assistant input is disabled and labelled, not a dead-looking box.
    const input = page.getByLabel(/ask the assistant/i);
    await expect(input).toBeDisabled();
    await expect(input).toHaveAttribute("placeholder", /isn't configured/i);

    // Selection actions are unavailable for the same reason, and say why.
    await page.getByRole("tab", { name: "Selection" }).click();
    await expect(page.getByText(/AI isn't configured on this installation/i)).toBeVisible();
  });
});
