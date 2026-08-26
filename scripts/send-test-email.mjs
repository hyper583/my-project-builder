#!/usr/bin/env node
import { config as loadEnv } from "dotenv";

/**
 * Sends one real email through whatever driver is configured.
 *
 *   npm run email:test -- you@example.com
 *
 * This exists because email is the one path in the product nobody can exercise
 * by using it. Registration sends a confirmation and carries on regardless;
 * a password reset says "check your inbox" whether or not anything left the
 * building. The console driver — the default — genuinely prints the message and
 * reports success. So a broken mail setup looks exactly like a working one
 * until a real person is locked out of their account and cannot get back in.
 *
 * It sends a real message on purpose. Resend will accept an API key, accept the
 * request, and still refuse to deliver from a domain that is not verified; only
 * an actual send tells you which.
 *
 * Reads .env.local the same way the app does, so it tests the configuration the
 * app will use rather than a copy of it.
 */

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const to = process.argv[2];

if (!to || !to.includes("@")) {
  console.error(
    [
      "Usage: npm run email:test -- you@example.com",
      "",
      "Send it to an address you can actually open. While a domain is still",
      "being verified, Resend usually only accepts the address that owns the",
      "Resend account.",
    ].join("\n"),
  );
  process.exit(1);
}

const driver = process.env.EMAIL_DRIVER ?? "console";
const from = process.env.EMAIL_FROM ?? "(unset)";

console.log(`EMAIL_DRIVER = ${driver}`);
console.log(`EMAIL_FROM   = ${from}`);
console.log(`RESEND_API_KEY ${process.env.RESEND_API_KEY ? "is set" : "is NOT set"}`);
console.log("");

if (driver === "console") {
  console.log(
    [
      "This driver prints mail instead of sending it, so a successful run here",
      "proves nothing about delivery. Set EMAIL_DRIVER=resend with RESEND_API_KEY",
      "and EMAIL_FROM to test for real.",
      "",
      "Sending anyway, so you can see the shape of what would go out:",
      "",
    ].join("\n"),
  );
}

/*
 * Imported after the environment is loaded, and after the report above.
 *
 * `src/lib/env.ts` validates at module load and refuses to start production on
 * a development driver, so importing it earlier would fail before printing the
 * configuration that explains why.
 */
const { emailDriver } = await import("../src/server/services/email/index.ts");

const stamp = new Date().toISOString();

try {
  await emailDriver.send({
    to,
    subject: `My Project Builder — test email (${stamp})`,
    body: [
      "If you are reading this in an inbox, the email driver works.",
      "",
      "That matters more than it sounds: password resets and address",
      "confirmation both go through this path, and an account that cannot",
      "confirm its address can never link a Google sign-in either.",
      "",
      `Sent ${stamp} from ${from} via the ${driver} driver.`,
    ].join("\n"),
  });

  if (driver === "console") {
    console.log("\nPrinted above. Nothing was delivered — that is what this driver does.");
  } else {
    console.log(`Accepted for delivery to ${to}.`);
    console.log("");
    console.log("Now open the inbox. Accepted is not delivered: check spam, and if it");
    console.log("never arrives, look at the Resend dashboard's Emails tab for the reason.");
  }
} catch (error) {
  console.error("\nThe send FAILED, which is the useful outcome — it tells you why:\n");
  console.error(`  ${error instanceof Error ? error.message : String(error)}\n`);
  console.error(
    [
      "Common causes:",
      "  - EMAIL_FROM is at a domain that is not verified in Resend yet.",
      "  - The domain verified, but EMAIL_FROM uses a different one.",
      "  - The API key is from a different Resend account, or was revoked.",
      "  - Sending to an address other than the account owner's before the",
      "    domain finished verifying.",
    ].join("\n"),
  );
  process.exit(1);
}
