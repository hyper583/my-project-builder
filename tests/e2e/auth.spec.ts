import { expect, test } from "@playwright/test";

import { makeUser, register, signIn } from "./fixtures";

test.describe("authentication", () => {
  test("register, sign out and sign back in", async ({ page }) => {
    const user = makeUser("auth");

    await register(page, user);
    await expect(page.getByRole("heading", { name: "My Projects" })).toBeVisible();

    // Sign out through the account menu, which is the only route a real user has.
    await page.getByRole("button", { name: /account/i }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/dashboard"), { timeout: 30_000 });

    // The session must actually be gone, not merely navigated away from.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);

    await signIn(page, user);
    await expect(page.getByRole("heading", { name: "My Projects" })).toBeVisible();
  });

  test("an unauthenticated visitor cannot reach the dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a wrong password is rejected and reported", async ({ page }) => {
    const user = makeUser("badpass");
    await register(page, user);

    await page.getByRole("button", { name: /account/i }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/dashboard"), { timeout: 30_000 });

    await page.goto("/login");
    await page.getByLabel("Email address").fill(user.email);
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("the password reset request never reveals whether an account exists", async ({ page }) => {
    // The confirmation must be identical for a real and an unknown address,
    // or the form becomes an account-enumeration oracle.
    const known = makeUser("enum");
    await register(page, known);

    await page.getByRole("button", { name: /account/i }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/dashboard"), { timeout: 30_000 });

    const confirmationFor = async (email: string) => {
      await page.goto("/forgot-password");
      await page.getByLabel("Email address").fill(email);
      await page.getByRole("button", { name: "Send reset link" }).click();
      await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible({
        timeout: 20_000,
      });
      return (await page.locator("main").innerText()).replace(/\s+/g, " ").trim();
    };

    const forKnown = await confirmationFor(known.email);
    const forUnknown = await confirmationFor(`nobody-${Date.now()}@example.test`);

    expect(forKnown).toBe(forUnknown);
  });

  test("an invalid reset link is explained instead of showing a form", async ({ page }) => {
    await page.goto("/reset-password?error=INVALID_TOKEN");

    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
  });
});
