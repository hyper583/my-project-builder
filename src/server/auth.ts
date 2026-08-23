import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { env, isGoogleAuthConfigured } from "@/lib/env";
import { prisma } from "@/server/db";
import { emailDriver } from "@/server/services/email";

export const auth = betterAuth({
  appName: "My Project Builder",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    async sendResetPassword({ user, url }) {
      await emailDriver.send({
        to: user.email,
        subject: "Reset your My Project Builder password",
        body: `Open this link to choose a new password:\n\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
      });
    },
  },

  user: {
    additionalFields: {
      // input:false is the security-relevant part — it stops a registration
      // payload from setting its own role or plan. Both are server-controlled.
      role: { type: "string", defaultValue: "STUDENT", input: false },
      planTier: { type: "string", defaultValue: "FREE", input: false },
      suspendedAt: { type: "date", required: false, input: false },
    },
  },

  /**
   * Google sign-in, offered only when it is actually configured.
   *
   * Spread rather than declared, so an installation without credentials
   * registers no provider at all instead of one that fails at the redirect.
   * The sign-in page reads the same flag and omits the button to match.
   *
   * Nothing else needs to change for it: the `create` hooks below run on user
   * creation regardless of how the account arrived, so a Google sign-up gets
   * the same admin bootstrap check and the same audit row as an email one, and
   * `role` and `planTier` stay server-controlled through `input: false`.
   */
  ...(isGoogleAuthConfigured
    ? {
        socialProviders: {
          google: {
            clientId: env.GOOGLE_CLIENT_ID!,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
          },
        },
      }
    : {}),

  databaseHooks: {
    user: {
      create: {
        // The first admin is bootstrapped from ADMIN_BOOTSTRAP_EMAIL. This is the
        // only automatic promotion; afterwards only an existing admin may
        // promote another, and every promotion is audit-logged.
        before: async (user) => {
          const bootstrap = env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
          if (bootstrap && user.email.toLowerCase() === bootstrap) {
            return { data: { ...user, role: "ADMIN" } };
          }
          return { data: user };
        },
        // Registrations are recorded; routine sign-ins are not. At any scale a
        // row per successful login buries the events that actually matter, and
        // the session table already answers "who is signed in".
        after: async (user) => {
          try {
            await prisma.auditLog.create({
              data: {
                userId: user.id,
                action: "auth.register",
                targetType: "user",
                targetId: user.id,
                // Coerced: additional fields arrive loosely typed from Better
                // Auth, and the role is worth recording because the bootstrap
                // hook above can make this very row an admin.
                metadata: { email: user.email, role: String(user.role ?? "STUDENT") },
              },
            });
          } catch {
            // Never block a registration on its own audit row.
          }
        },
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  // nextCookies() must remain last in this array.
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
