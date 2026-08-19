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

export const emailDriver: EmailDriver =
  env.EMAIL_DRIVER === "smtp" ? new SmtpEmailDriver() : new ConsoleEmailDriver();
