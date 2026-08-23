import { expect, test, type Page } from "@playwright/test";

import { ADMIN_EMAIL } from "../../playwright.config";
import { createProject, makeUser, register } from "./fixtures";

/**
 * One password for the admin account, fixed for the run.
 *
 * The first version generated it from `Date.now()`, so the second test could
 * never sign in to the account the first had created and fell through to a
 * registration that failed on the duplicate address. A shared constant is the
 * whole fix.
 */
const ADMIN_PASSWORD = "e2e-admin-password-not-used-anywhere-else";

/** Signs in as the admin, registering the account the first time. */
async function asAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Registration is the fallback rather than the default: whichever test runs
  // first creates the account, and the rest sign in to it.
  await page
    .waitForURL("**/dashboard", { timeout: 10_000 })
    .catch(async () => {
      await page.goto("/register");
      await page.getByLabel("Your name").fill("E2E admin");
      await page.getByLabel("Email address").fill(ADMIN_EMAIL);
      await page.getByLabel("Password").fill(ADMIN_PASSWORD);
      await page.getByRole("button", { name: "Create account" }).click();
      await page.waitForURL("**/dashboard", { timeout: 30_000 });
    });
}

/**
 * The functionality sweep.
 *
 * Walks every page in the app and asserts three things that are easy to break
 * and invisible when broken: the page renders at all, every control it offers
 * has a name a screen reader could announce, and every link it shows leads
 * somewhere real.
 *
 * This exists because the defects it looks for have all actually happened
 * here: an Admin badge that looked like a link and was not, thirteen delete
 * buttons that announced as "button", a breadcrumb that led to a 404, and a
 * magnifier that read as a control and did nothing. Each was found by someone
 * using the site, which is the expensive way.
 */

/** A control the accessibility tree lists with no name at all. */
const UNNAMED = /^\s*-\s*(button|link|textbox|checkbox|radio|combobox|slider)\s*(:.*)?$/;

/**
 * Controls the tree reports without a name that are legitimately unnamed.
 *
 * Kept deliberately short. Every entry is a decision to accept something a
 * screen-reader user cannot identify, so it needs a reason.
 */
const ALLOWED_UNNAMED: string[] = [];

async function unnamedControls(page: Page): Promise<string[]> {
  const snapshot = await page.locator("body").ariaSnapshot();
  return snapshot
    .split("\n")
    .filter((line) => UNNAMED.test(line))
    .map((line) => line.trim())
    .filter((line) => !ALLOWED_UNNAMED.includes(line));
}

/** Every in-app link the page is currently showing. */
async function internalLinks(page: Page): Promise<string[]> {
  const hrefs = await page.locator("a[href]").evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLAnchorElement).getAttribute("href") ?? ""),
  );
  return [
    ...new Set(
      hrefs.filter((h) => h.startsWith("/") && !h.startsWith("//") && !h.startsWith("/#")),
    ),
  ];
}

/**
 * Asserts a page is healthy: it rendered, it names its controls, and its links
 * resolve.
 *
 * The link check uses the page's own request context, so it carries the signed
 * in session — fetching a project page without it would 302 to /login and
 * every assertion would pass for the wrong reason.
 */
const alreadyChecked = new Set<string>();

async function sweep(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `${path} responded ${response?.status()}`).toBeLessThan(400);

  // Next renders a recognisable error page rather than throwing to the client.
  await expect(page.locator("body"), path).not.toContainText("Application error");
  await expect(page.locator("body"), path).not.toContainText("Unhandled Runtime Error");

  const unnamed = await unnamedControls(page);
  expect(unnamed, `${path} has controls with no accessible name:\n${unnamed.join("\n")}`).toEqual(
    [],
  );

  for (const href of await internalLinks(page)) {
    // The shell repeats its navigation on every page, so without this the same
    // dozen URLs are fetched once per page visited and the test times out
    // having proved nothing extra.
    if (alreadyChecked.has(href)) continue;
    alreadyChecked.add(href);

    const linked = await page.request.get(href, { maxRedirects: 5 });
    expect(linked.status(), `${path} links to ${href}, which responded ${linked.status()}`).toBeLessThan(
      400,
    );
  }
}

test.describe("functionality sweep", () => {
  test("every public page is whole", async ({ page }) => {
    for (const path of ["/", "/login", "/register", "/forgot-password"]) {
      await sweep(page, path);
    }
  });

  test("every page of a project is whole", async ({ page }) => {
    const user = makeUser("sweep");
    await register(page, user);

    const id = await createProject(page, "Effect of mobile phone use on sleep quality among nurses");

    await sweep(page, "/dashboard");
    await sweep(page, "/settings");

    for (const path of [
      `/projects/${id}/wizard/1`,
      `/projects/${id}/wizard/5`,
      `/projects/${id}/wizard/9`,
      `/projects/${id}/blueprint`,
      `/projects/${id}/sources`,
      `/projects/${id}/health`,
      `/projects/${id}/history`,
      `/projects/${id}/export`,
      `/projects/${id}/workspace`,
    ]) {
      await sweep(page, path);
    }
  });

  test("every admin page is whole", async ({ page }) => {
    await asAdmin(page);

    for (const path of ["/admin", "/admin/users", "/admin/projects", "/admin/presets", "/admin/health"]) {
      await sweep(page, path);
    }
  });

  test("an admin can reach the console from the account menu", async ({ page }) => {
    // The badge in this menu used to be the only sign an account was an admin,
    // and a badge is a label rather than a way to go anywhere. The console was
    // reachable only by typing the URL.
    await asAdmin(page);

    await page.getByRole("button", { name: "Account" }).click();
    await page.getByRole("menuitem", { name: "Admin console" }).click();
    await page.waitForURL("**/admin", { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
