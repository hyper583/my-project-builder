/**
 * What to tell someone when Google sends them back with an error.
 *
 * These codes arrive as `?error=` on the page named by `errorCallbackURL`.
 * Getting the important one right is easy to get wrong, and this file exists
 * because it was: `account_not_linked` is not a constant anywhere in Better
 * Auth. The sign-in path returns the string `"account not linked"`, and the
 * callback route turns it into a code by replacing the spaces —
 * `result.error.split(" ").join("_")`. The named constant that looks correct,
 * `unable_to_link_account`, belongs to the *explicit* link flow, for attaching
 * a provider to an account that is already signed in.
 *
 * Mapping only the constant left every real occurrence falling through to the
 * generic message. It was reported as someone pressing "Sign up with Google"
 * and being told, unhelpfully, to try again.
 */

/**
 * The refusal behind `account_not_linked` is deliberate.
 *
 * Better Auth will not attach a social login to an existing password account
 * unless that account's email is verified — which is what stops someone
 * registering another person's address and then inheriting their Google
 * sign-in. So the message names the way out rather than only the refusal.
 */
const OAUTH_ERRORS: Record<string, string> = {
  account_not_linked:
    "There is already an account with this email address and a password. " +
    "Sign in with that password, then confirm your email from Settings — " +
    "Google will work from then on.",
  unable_to_link_account:
    "That Google account could not be attached to this one. Sign in with your " +
    "password, then confirm your email from Settings and try again.",
  email_not_verified:
    "Google has not confirmed that email address, so it cannot be used to sign in.",
  account_already_linked_to_different_user:
    "That Google account is already connected to a different account here.",
  email_does_not_match: "That Google account uses a different email address.",
  email_not_found: "Google did not share an email address, so an account cannot be made.",
  access_denied: "Google sign-in was cancelled. You can try again, or use your password.",
};

export const GENERIC_OAUTH_ERROR =
  "Google sign-in did not complete. Please try again, or use your password.";

/**
 * Resolves a callback error code to something a student can act on.
 *
 * An unmapped code is logged rather than only shown, because that is the
 * failure this file was written after: a vague message with no way for anyone
 * — including whoever is debugging it — to find out what it stood for.
 */
export function describeOAuthError(code: unknown): string | null {
  if (typeof code !== "string" || !code) return null;

  const known = OAUTH_ERRORS[code];
  if (known) return known;

  console.warn(`[auth] unmapped OAuth callback error: ${code}`);
  return GENERIC_OAUTH_ERROR;
}
