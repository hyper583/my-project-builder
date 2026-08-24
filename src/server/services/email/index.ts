import { env } from "@/lib/env";

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

export interface EmailDriver {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Development driver. Prints the message to the server log so password-reset
 * flows are usable locally without an SMTP account. It is not a stub standing
 * in for a working feature — the reset link it prints is genuine.
 */
class ConsoleEmailDriver implements EmailDriver {
  async send(message: EmailMessage): Promise<void> {
    console.info(
      [
        "",
        "──────────── EMAIL (console driver) ────────────",
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        "",
        message.body,
        "────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
  }
}


/**
 * Resend, over its HTTP API.
 *
 * No SDK, for the same reason the storage driver has none: one endpoint does
 * not justify another dependency in the supply chain of an app that handles
 * payments.
 *
 * Everything this application sends is transactional and consequential — a
 * password reset, the address confirmation that unlocks Google sign-in, a
 * receipt for a pass. A message that silently fails to arrive looks to the
 * student exactly like a product that is broken, so a failed send throws
 * rather than being logged and swallowed.
 */
class ResendEmailDriver implements EmailDriver {
  private config() {
    const key = env.RESEND_API_KEY;
    const from = env.EMAIL_FROM;
    if (!key || !from) {
      throw new Error(
        "EMAIL_DRIVER=resend needs RESEND_API_KEY and EMAIL_FROM. Set both, or use " +
          "EMAIL_DRIVER=console for local development.",
      );
    }
    return { key, from };
  }

  async send(message: EmailMessage): Promise<void> {
    const { key, from } = this.config();

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        text: message.body,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // The address is included because the most common failure is a `from`
      // at a domain that was never verified, and Resend's message says so
      // only if you can see which address it rejected.
      throw new Error(
        `Resend refused to send to ${message.to} from ${from} ` +
          `(${response.status}): ${detail.slice(0, 300)}`,
      );
    }
  }
}

/**
 * Placeholder for a real transport. Configuring EMAIL_DRIVER=smtp without
 * implementing this throws loudly rather than silently dropping mail.
 */
class SmtpEmailDriver implements EmailDriver {
  async send(): Promise<void> {
    throw new Error(
      "EMAIL_DRIVER=smtp is not implemented yet. Set EMAIL_DRIVER=console for local " +
        "development, or implement SmtpEmailDriver before deploying.",
    );
  }
}

function selectDriver(): EmailDriver {
  switch (env.EMAIL_DRIVER) {
    case "resend":
      return new ResendEmailDriver();
    case "smtp":
      return new SmtpEmailDriver();
    default:
      return new ConsoleEmailDriver();
  }
}

export const emailDriver: EmailDriver = selectDriver();
