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
    /*
     * Sign-in is NOT gated on verification.
     *
     * Stated explicitly because the tempting reading is that it should be.
     * Turning it on would lock out every account that already exists — none of
     * them are verified, because until now nothing ever sent a verification
     * email — and it would put a mail round trip between a student and the work
     * they came back for.
     *
     * Verification is what unlocks linking a Google sign-in to an existing
     * password account; see `emailVerification` below.
     */
    requireEmailVerification: false,
    async sendResetPassword({ user, url }) {
      await emailDriver.send({
        to: user.email,
        subject: "Reset your My Project Builder password",
        body: `Open this link to choose a new password:\n\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
      });
    },
  },

  /**
   * Proving an address belongs to the person who typed it.
   *
   * This exists because of what happens without it once Google sign-in is
   * enabled. Better Auth will not link a social login to an existing password
   * account unless that account's email is verified — `requireLocalEmailVerified`
   * defaults to true — and nothing here had ever set `emailVerified`, so every
   * account was unverified and every such attempt would return a bare
   * "account not linked".
   *
   * The tempting fix is to turn that requirement off. It must not be, and the
   * default is not timid: with no verification anywhere, anyone can register
   * someone else's address with a password of their choosing. If linking were
   * then allowed, the real owner signing in with Google would be dropped into
   * the attacker's account — who knows the password, and can read every project
   * in it. That is account pre-hijacking, and this product holds unsubmitted
   * dissertations.
   *
   * So the requirement stays, and this supplies the proof it asks for.
   */
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      await emailDriver.send({
        to: user.email,
        subject: "Confirm your email for My Project Builder",
        body:
          `Open this link to confirm your email address:\n\n${url}\n\n` +
          "You can carry on using your account without this. Confirming lets " +
          "you sign in with Google as well as with your password.\n\n" +
          "If you didn't create an account, you can ignore this email.",
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
            /*
             * Always show Google's account chooser.
             *
             * Without this, Google silently uses whichever account the browser
             * is already signed in to and never offers a choice. On the
             * sign-up page that is the wrong behaviour outright: someone who
             * pressed "Sign up with Google" to register a DIFFERENT address is
             * signed straight back into their existing one and bounced to the
             * sign-in page being told the account already exists. There is no
             * way, from inside the product, to reach any other Google account
             * — the only workaround is signing out of Google in the browser.
             *
             * `select_account` also makes "Use another account" available, so
             * a shared machine is not stuck with whoever used it last.
             *
             * The cost is one extra click for a returning user with a single
             * account. That is worth paying to make a whole flow reachable.
             */
            prompt: "select_account",
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
