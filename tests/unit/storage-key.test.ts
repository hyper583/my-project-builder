import { describe, expect, it } from "vitest";

import { buildStorageKey } from "@/server/services/storage";

/**
 * The keys exported documents are stored under.
 *
 * Written after finding a bucket full of names like
 * `projects/<id>/8c1f…addocx` — no dot anywhere. Renderers report their
 * extension as "docx" rather than ".docx", and the separator was expected from
 * the caller instead of being added here.
 *
 * Nothing failed, which is why it lasted: the key is opaque and the download
 * filename is set on the response, so every export downloaded correctly the
 * whole time. It only showed up when someone listed the bucket.
 */

const KEY = /^projects\/proj_1\/[0-9a-f-]{36}(\.[a-z0-9]+)?$/;

describe("the extension", () => {
  it("is separated by a dot the caller did not have to supply", () => {
    expect(buildStorageKey("proj_1", "docx")).toMatch(/\.docx$/);
    expect(buildStorageKey("proj_1", "pdf")).toMatch(/\.pdf$/);
  });

  it("does not double the dot when the caller supplies one", () => {
    // Both spellings reach this: the renderers say "docx", and anything reading
    // a filename says ".docx".
    expect(buildStorageKey("proj_1", ".docx")).toMatch(/[0-9a-f]\.docx$/);
    expect(buildStorageKey("proj_1", ".docx")).not.toContain("..");
  });

  it("leaves no trailing dot when there is no extension", () => {
    expect(buildStorageKey("proj_1", "")).not.toMatch(/\.$/);
    expect(buildStorageKey("proj_1", "...")).not.toMatch(/\.$/);
  });
});

describe("what a key may contain", () => {
  it("is built from a fresh uuid rather than anything a user typed", () => {
    // The filename a student uploaded is never part of the key: it is the one
    // string here an attacker controls.
    const a = buildStorageKey("proj_1", "pdf");
    const b = buildStorageKey("proj_1", "pdf");

    expect(a).not.toBe(b);
    expect(a).toMatch(KEY);
  });

  it("strips anything that could climb out of the project's folder", () => {
    const key = buildStorageKey("proj_1", "../../etc/passwd");

    expect(key).not.toContain("..");
    expect(key).not.toContain("/etc/");
    expect(key).toMatch(KEY);
  });

  it("bounds a long extension rather than storing it whole", () => {
    const key = buildStorageKey("proj_1", "a".repeat(200));

    expect(key.split(".").pop()!.length).toBeLessThanOrEqual(10);
  });

  it("keeps every file under its own project", () => {
    expect(buildStorageKey("proj_9", "pdf").startsWith("projects/proj_9/")).toBe(true);
  });
});
