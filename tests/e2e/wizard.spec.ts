import { expect, test } from "@playwright/test";

import { createProject, makeUser, register, waitForSaved } from "./fixtures";

test.describe("project setup wizard", () => {
  test("answers survive a reload mid-wizard", async ({ page }) => {
    const user = makeUser("wizard");
    await register(page, user);
    const projectId = await createProject(page, "Persistence check");

    await page.getByLabel(/^Institution/).fill("University of Verification");
    await page.getByLabel(/^Department/).fill("Computer Science");
    await waitForSaved(page);

    // A hard reload, not client navigation — this is the "I closed my laptop"
    // case the brief cares about.
    await page.reload();

    await expect(page.getByLabel(/^Institution/)).toHaveValue("University of Verification");
    await expect(page.getByLabel(/^Department/)).toHaveValue("Computer Science");

    // And it survives leaving the wizard entirely and coming back.
    await page.goto("/dashboard");
    await page.goto(`/projects/${projectId}/wizard/1`);
    await expect(page.getByLabel(/^Institution/)).toHaveValue("University of Verification");
  });

  test("the step rail reflects what has actually been filled in", async ({ page }) => {
    const user = makeUser("rail");
    await register(page, user);
    const projectId = await createProject(page, "Rail check");

    const rail = page.getByRole("navigation", { name: "Setup steps" });
    const institutionStep = rail.getByRole("link", { name: /Institution/ });

    // Nothing entered yet.
    await expect(institutionStep).toContainText("not started");

    await page.getByLabel(/^Institution/).fill("University of Verification");
    await waitForSaved(page);

    await page.goto(`/projects/${projectId}/wizard/2`);
    await expect(rail.getByRole("link", { name: /Institution/ })).toContainText("has content");
    await expect(rail.getByRole("link", { name: /Project type/ })).toContainText("not started");
  });

  test("every field is optional — a step can be skipped entirely", async ({ page }) => {
    const user = makeUser("optional");
    await register(page, user);
    const projectId = await createProject(page, "Skip check");

    // Straight from step 1 to the blueprint without entering anything.
    await page.goto(`/projects/${projectId}/blueprint`);
    await expect(page.getByRole("heading", { name: "Your Project Blueprint" })).toBeVisible();

    // Missing values are shown as missing, never invented.
    await expect(page.getByText("Not provided").first()).toBeVisible();
  });

  test("navigation reaches every step and the shell tracks position", async ({ page }) => {
    const user = makeUser("nav");
    await register(page, user);
    const projectId = await createProject(page, "Navigation check");

    for (const step of [1, 4, 6, 9]) {
      await page.goto(`/projects/${projectId}/wizard/${step}`);
      // The header states the phase and the step; the rail groups the nine
      // steps into four phases, so "STEP n/9" is where the number now lives.
      await expect(page.getByText(new RegExp(`STEP ${step}/9`))).toBeVisible();
    }

    // The sidebar marks the project section it is in.
    const sidebar = page.getByRole("complementary", { name: "Primary" });
    await expect(sidebar.getByRole("link", { name: "Setup" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
