import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Supabase Storage driver.
 *
 * `fetch` is stubbed rather than reaching the network — what is worth pinning
 * is the shape of the request, because every mistake available here is silent.
 * A wrongly encoded key writes to a path nobody looks in; a swallowed error
 * response reports a successful upload of nothing; a missing header fails in a
 * way that reads like a permissions problem.
 *
 * The module reads its configuration at call time, so the environment is set
 * before it is imported and the import is deliberately dynamic.
 */

const URL_BASE = "https://example-project.supabase.co";

let fetchMock: ReturnType<typeof vi.fn>;

async function loadDriver() {
  vi.resetModules();
  process.env.STORAGE_DRIVER = "supabase";
  process.env.SUPABASE_URL = URL_BASE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests";
  process.env.SUPABASE_STORAGE_BUCKET = "project-files";
  return (await import("@/server/services/storage")).storage;
}

function respond(init: { ok: boolean; status?: number; body?: string | ArrayBuffer }) {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    text: async () => (typeof init.body === "string" ? init.body : ""),
    arrayBuffer: async () =>
      init.body instanceof ArrayBuffer ? init.body : new TextEncoder().encode("").buffer,
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  delete process.env.STORAGE_DRIVER;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_STORAGE_BUCKET;
});

describe("uploading", () => {
  it("puts the object where the key says, with slashes intact", async () => {
    /*
     * The slashes in "projects/<id>/<uuid>.docx" are part of the object's
     * name. Encoding the key wholesale turns them into %2F and the file lands
     * under a single flat name that nothing else will ever look for.
     */
    const storage = await loadDriver();
    fetchMock.mockResolvedValue(respond({ ok: true }));

    await storage.put("projects/abc123/file.docx", Buffer.from("x"), "application/msword");

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `${URL_BASE}/storage/v1/object/project-files/projects/abc123/file.docx`,
    );
  });

  it("sends both the api key and the bearer token", async () => {
    // The gateway routes on one and Storage authorises on the other. Sending
    // only one fails as though the key were wrong.
    const storage = await loadDriver();
    fetchMock.mockResolvedValue(respond({ ok: true }));

    await storage.put("projects/a/b.pdf", Buffer.from("x"), "application/pdf");

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers.apikey).toBe("service-role-key-for-tests");
    expect(init.headers.Authorization).toBe("Bearer service-role-key-for-tests");
    expect(init.headers["Content-Type"]).toBe("application/pdf");
    expect(init.method).toBe("POST");
  });

  it("overwrites rather than refusing a repeat", async () => {
    // Keys carry a UUID, so the same key twice is a retry of one write. Left
    // to fail with "already exists", a harmless repeat becomes a lost upload.
    const storage = await loadDriver();
    fetchMock.mockResolvedValue(respond({ ok: true }));

    await storage.put("projects/a/b.pdf", Buffer.from("x"), "application/pdf");

    expect(fetchMock.mock.calls[0]![1].headers["x-upsert"]).toBe("true");
  });

  it("falls back to a generic content type rather than sending none", async () => {
    const storage = await loadDriver();
    fetchMock.mockResolvedValue(respond({ ok: true }));

    await storage.put("projects/a/b", Buffer.from("x"), "");

    expect(fetchMock.mock.calls[0]![1].headers["Content-Type"]).toBe("application/octet-stream");
  });

  it("throws on a failed upload instead of reporting success", async () => {
    // The failure this exists for: a 4xx that is never read, so the export
    // pipeline records a stored file that was never stored.
    const storage = await loadDriver();
    fetchMock.mockResolvedValue(
      respond({ ok: false, status: 403, body: '{"error":"Unauthorized"}' }),
    );

    await expect(
      storage.put("projects/a/b.pdf", Buffer.from("x"), "application/pdf"),
    ).rejects.toThrow(/upload failed[\s\S]*403[\s\S]*Unauthorized/);
  });
});

describe("downloading", () => {
  it("returns the bytes as a Buffer", async () => {
    const storage = await loadDriver();
    const payload = new TextEncoder().encode("hello").buffer;
    fetchMock.mockResolvedValue(respond({ ok: true, body: payload }));

    const out = await storage.get("projects/a/b.txt");

    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.toString()).toBe("hello");
  });

  it("throws when the object is missing rather than returning nothing", async () => {
    // An empty Buffer here would export a zero-byte document and call it done.
    const storage = await loadDriver();
    fetchMock.mockResolvedValue(respond({ ok: false, status: 404, body: "not found" }));

    await expect(storage.get("projects/a/gone.txt")).rejects.toThrow(/download failed[\s\S]*404/);
  });
});

describe("deleting", () => {
  it("issues a DELETE for the object", async () => {
    const storage = await loadDriver();
    fetchMock.mockResolvedValue(respond({ ok: true }));

    await storage.delete("projects/a/b.txt");

    expect(fetchMock.mock.calls[0]![1].method).toBe("DELETE");
  });

  it("treats an object that is already gone as deleted", async () => {
    // The outcome asked for has been reached. The local driver uses
    // `rm --force` for exactly this reason.
    const storage = await loadDriver();
    fetchMock.mockResolvedValue(respond({ ok: false, status: 404, body: "not found" }));

    await expect(storage.delete("projects/a/gone.txt")).resolves.toBeUndefined();
  });

  it("still reports a real failure", async () => {
    const storage = await loadDriver();
    fetchMock.mockResolvedValue(respond({ ok: false, status: 500, body: "boom" }));

    await expect(storage.delete("projects/a/b.txt")).rejects.toThrow(/delete failed[\s\S]*500/);
  });
});

describe("configuration", () => {
  it("refuses to run without credentials rather than failing at the first upload", async () => {
    vi.resetModules();
    process.env.STORAGE_DRIVER = "supabase";
    process.env.SUPABASE_URL = "";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";

    const { storage } = await import("@/server/services/storage");

    await expect(storage.put("k", Buffer.from("x"), "text/plain")).rejects.toThrow(
      /needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it("tolerates a trailing slash on the project URL", async () => {
    vi.resetModules();
    process.env.STORAGE_DRIVER = "supabase";
    process.env.SUPABASE_URL = `${URL_BASE}/`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    process.env.SUPABASE_STORAGE_BUCKET = "project-files";

    const { storage } = await import("@/server/services/storage");
    fetchMock.mockResolvedValue(respond({ ok: true }));
    await storage.put("projects/a/b.txt", Buffer.from("x"), "text/plain");

    // Not ".supabase.co//storage", which 404s in a way that looks like a
    // missing object rather than a malformed URL.
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${URL_BASE}/storage/v1/object/project-files/projects/a/b.txt`,
    );
  });
});
