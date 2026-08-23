import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * Shared e2e helpers.
 *
 * Every test registers its own account rather than sharing one. Sharing a
 * fixture user would couple the tests through the plan limits — the free tier
 * allows two active projects — and make a failure in one show up as a
 * confusing limit error in another.
 */

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

/**
 * A throwaway account for one test.
 *
 * The password is generated per run and only ever exists in the isolated test
 * database; it is not a credential for anything.
 */
export function makeUser(label: string): TestUser {
  const id = randomUUID().slice(0, 8);
  return {
    name: `E2E ${label}`,
    email: `e2e-${label}-${id}@example.test`,
    password: `e2e-${randomUUID()}`,
  };
}

/** Registers a fresh account and lands on the dashboard. */
export async function register(page: Page, user: TestUser): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("Your name").fill(user.name);
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
}

/** Signs in an already-registered account. */
export async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
}

/**
 * Creates a project from the dashboard and returns its id.
 *
 * The id is read back from the URL rather than guessed, so a later assertion
 * is checking the project that was actually created.
 */
export async function createProject(page: Page, title: string): Promise<string> {
  await page.goto("/dashboard");
  // "Create New Project" now opens the form rather than submitting it — the
  // dashboard's job is to show existing work, so starting a project is one
  // button until you ask for it.
  await page.getByRole("button", { name: "Create New Project" }).click();
  await page.getByLabel("Project topic").fill(title);
  await page.getByRole("button", { name: "Set up my project" }).click();
  await page.waitForURL(/\/projects\/[^/]+\/wizard\/1/, { timeout: 30_000 });

  const match = /\/projects\/([^/]+)\/wizard/.exec(page.url());
  expect(match, `could not read a project id from ${page.url()}`).not.toBeNull();
  return match![1]!;
}

/**
 * Waits for the wizard's autosave to report success.
 *
 * Asserting on the status the UI actually shows, rather than sleeping, is what
 * makes the persistence tests meaningful: a reload assertion after a fixed
 * delay would pass even if the save had silently failed.
 */
export async function waitForSaved(page: Page): Promise<void> {
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 20_000 });
}
