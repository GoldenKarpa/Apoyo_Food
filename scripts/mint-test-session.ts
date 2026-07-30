/**
 * Slice 3 verification helper — mints a session cookie in the exact shape
 * portal-web's own issuer produces, so `getFoodSession()` can be tested against
 * a genuine shared-cookie token.
 *
 * ⚠ TEST TOOLING ONLY. Food never issues sessions in production (architecture
 * Part B1) — this exists purely so the decode path can be verified without
 * standing up a full browser sign-in. It is inert without AUTH_SECRET.
 *
 * Fidelity notes, all read off portal-web/lib/auth.ts directly rather than
 * guessed or copied from another vertical:
 *   - `salt` MUST be the cookie name (portal-web `lib/auth.ts:440`). next-auth
 *     v5 derives the JWE encryption key from (secret, salt), so a wrong salt
 *     fails to DECRYPT — not merely fails to find — with no useful error.
 *   - cookie name is env-dependent, and both sides compute it the same way
 *     (portal-web `lib/auth.ts:50,55`):
 *       production → "__Secure-authjs.session-token"
 *       otherwise  → "authjs.session-token"
 *   - claim set mirrors portal-web's `mintSessionCookie`: id, sub, role,
 *     isGuest, locale, originSubdomain, memberships, emailVerified.
 *
 *   AUTH_SECRET=<shared secret> npx tsx scripts/mint-test-session.ts <userId> [role] [locale]
 */
import { encode } from "next-auth/jwt";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

async function main() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required");

  const userId = process.argv[2];
  if (!userId) throw new Error("usage: mint-test-session.ts <userId> [role] [locale]");
  const role = (process.argv[3] as "CLIENT" | "PROVIDER" | "ADMIN") ?? "CLIENT";
  const locale = process.argv[4] ?? "en";

  const isSecure = process.env.NODE_ENV === "production";
  const cookieName = isSecure ? "__Secure-authjs.session-token" : "authjs.session-token";

  // Deliberately EMPTY memberships, even for a seller: this reproduces the real
  // staleness case documented in lib/session.ts — a token issued before the
  // vertical minted its membership. If an auth guard wrongly trusted the JWT
  // claim instead of the ecosystem API, this token is what would expose it.
  const value = await encode({
    secret,
    salt: cookieName,
    maxAge: SESSION_MAX_AGE_SECONDS,
    token: {
      id: userId,
      sub: userId,
      role,
      isGuest: false,
      locale,
      originSubdomain: "portal",
      memberships: [],
      emailVerified: true,
    },
  });

  console.log(JSON.stringify({ cookieName, value }));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
