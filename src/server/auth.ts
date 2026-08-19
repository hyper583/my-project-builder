import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { env } from "@/lib/env";
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
