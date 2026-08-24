import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Resend email driver.
 *
 * Everything this application sends is transactional and consequential — a
 * password reset, the address confirmation that unlocks Google sign-in, a
 * receipt for a pass. A message that silently fails to arrive looks to the
 * student exactly like a product that is broken, so what these tests protect
 * is that a failure is raised rather than logged and forgotten.
 *
 * `fetch` is stubbed; the driver reads its configuration at call time, so the
 * environment is set before the module is imported and the import is dynamic.
 */

const FROM = "My Project Builder <hello@example.test>";

let fetchMock: ReturnType<typeof vi.fn>;

async function loadDriver(overrides: Record<string, string> = {}) {
  vi.resetModules();
  process.env.EMAIL_DRIVER = "resend";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.EMAIL_FROM = FROM;
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
  return (await import("@/server/services/email")).emailDriver;
}

const MESSAGE = {
  to: "student@example.test",
  subject: "Reset your My Project Builder password",
  body: "Open this link to choose a new password:\n\nhttps://example.test/reset?token=abc",
};

function respond(ok: boolean, status = ok ? 200 : 422, body = "") {
  return {
    ok,
    status,
    text: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  for (const key of ["EMAIL_DRIVER", "RESEND_API_KEY", "EMAIL_FROM"]) delete process.env[key];
});

describe("sending", () => {
  it("posts the message to Resend with the configured sender", async () => {
    const driver = await loadDriver();
    fetchMock.mockResolvedValue(respond(true));

    await driver.send(MESSAGE);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");

    const sent = JSON.parse(init.body);
    expect(sent).toEqual({
      from: FROM,
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      text: MESSAGE.body,
    });
  });

  it("sends the body as text, so the reset link survives intact", async () => {
    // Sent as HTML, the newlines collapse and a bare URL is not guaranteed to
    // be linked — the student is left with a wall of text and a link they have
    // to reconstruct.
    const driver = await loadDriver();
    fetchMock.mockResolvedValue(respond(true));

    await driver.send(MESSAGE);

    const sent = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(sent.text).toContain("\n\n");
    expect(sent.html).toBeUndefined();
  });

  it("throws when Resend refuses, rather than reporting a sent email", async () => {
    /*
     * The failure this exists for. `fetch` does not reject on 4xx, so an
     * unhandled 422 would let `sendResetPassword` return normally and the
     * product would tell a locked-out student to check an inbox nothing was
     * ever sent to.
     */
    const driver = await loadDriver();
    fetchMock.mockResolvedValue(
      respond(false, 403, '{"message":"The example.test domain is not verified"}'),
    );

    await expect(driver.send(MESSAGE)).rejects.toThrow(/Resend refused[\s\S]*403/);
  });

  it("names both addresses in the failure", async () => {
    // The commonest failure by far is a `from` at an unverified domain, and
    // Resend's own message only makes sense if you can see which address it
    // rejected.
    const driver = await loadDriver();
    fetchMock.mockResolvedValue(respond(false, 403, "not verified"));

    await expect(driver.send(MESSAGE)).rejects.toThrow(
      new RegExp(`${MESSAGE.to}[\\s\\S]*hello@example.test`),
    );
  });
});

describe("configuration", () => {
  it("refuses to run without credentials, naming both", async () => {
    const driver = await loadDriver({ RESEND_API_KEY: "", EMAIL_FROM: "" });

    await expect(driver.send(MESSAGE)).rejects.toThrow(
      /needs RESEND_API_KEY and EMAIL_FROM/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses with only half the configuration", async () => {
    // A key with no sender is the state you land in after copying one value
    // out of the dashboard and being interrupted.
    const driver = await loadDriver({ EMAIL_FROM: "" });
    await expect(driver.send(MESSAGE)).rejects.toThrow(/needs RESEND_API_KEY and EMAIL_FROM/);
  });

  it("still prints to the console when no driver is chosen", async () => {
    // The default has to keep working with no configuration at all, or local
    // development cannot complete a password reset.
    vi.resetModules();
    delete process.env.EMAIL_DRIVER;
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const { emailDriver } = await import("@/server/services/email");
    await emailDriver.send(MESSAGE);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalled();
    expect(String(info.mock.calls[0]![0])).toContain(MESSAGE.to);
    info.mockRestore();
  });
});
