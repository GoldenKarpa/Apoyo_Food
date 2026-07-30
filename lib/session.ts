import { getToken } from "next-auth/jwt";
import { headers } from "next/headers";

/**
 * Food NEVER issues a session (architecture Part B1) — it only decodes the
 * shared JWT cookie set on `.apoyolime.com`. `getToken` is next-auth's low-level
 * cross-app JWT primitive; this app has no NextAuth instance of its own (no
 * providers, no adapter) because it never signs a token, only verifies one.
 *
 * ⚠ Re-verified at the source 2026-07-30, not inherited from another vertical's
 * notes: the issuer is **portal-web** (`Apoyo-Portal/portal-web/lib/auth.ts`),
 * whose cookie naming is
 *   const isSecure = process.env.NODE_ENV === "production";                // :50
 *   const sessionCookieName = isSecure
 *     ? "__Secure-authjs.session-token"
 *     : "authjs.session-token";                                            // :55
 * `secureCookie` below must mirror that expression exactly. If the two ever
 * drift, `getToken` looks for the cookie under the wrong name, finds nothing,
 * and every session silently reads as signed-out — with no error anywhere. It
 * is worse than a lookup miss: portal-web passes `salt: sessionCookieName`
 * (:440), and next-auth v5 derives the JWE key from (secret, salt), so a
 * mismatched name makes the token *undecryptable*, not merely un-found.
 * ⚠ `next start` forces NODE_ENV=production, which is exactly how Apparel hit
 * this during its own Slice 3 verification.
 */

export interface FoodSession {
  userId: string;
  email: string | null;
  locale: string;
  /**
   * The identity store's legacy global `role`. ⚠ Read-only here, and it does NOT
   * answer "is this user a Food seller" — tie-up #1 keeps this field
   * Demia/Social-scoped, so a Food seller's global role stays `CLIENT`.
   * Memberships answer that question; see lib/ecosystem.ts.
   */
  legacyRole: string;
  emailVerified: boolean;
  /**
   * Memberships as embedded in the JWT at issuance (portal-web's B-S7
   * `memberships` claim). ⚠ POSSIBLY STALE — see `sessionMemberships` below
   * before using this for anything that authorizes.
   */
  memberships: SessionMembership[];
}

export interface SessionMembership {
  vertical: string;
  role: string;
  status: string;
}

export async function getFoodSession(): Promise<FoodSession | null> {
  let token: Awaited<ReturnType<typeof getToken>> = null;
  try {
    token = await getToken({
      req: { headers: await headers() },
      secret: process.env.AUTH_SECRET,
      // Must mirror portal-web's `isSecure` exactly — see the note above.
      secureCookie: process.env.NODE_ENV === "production",
    });
  } catch (err) {
    // ⚠ Defensive, and deliberately proportionate. `getToken` is documented to
    // RETURN null on a token it can't read, so a throw here would be a bug in
    // the dependency rather than a normal outcome — but this function runs on
    // essentially every request, so an uncaught throw would 500 the entire
    // surface rather than degrading one signed-out request.
    //
    // Context (checked at Slice 6's deploy, 2026-07-30): `npm audit` reports two
    // CRITICAL advisories in `@auth/core` via our pinned next-auth
    // 5.0.0-beta.31, one of which is literally "getToken() throws an uncaught
    // exception on malformed Bearer authorization headers"
    // (GHSA-xmf8-cvqr-rfgj). That path genuinely exists in the installed source
    // (`@auth/core/jwt.js:92-94` reads the header and splits on " "), but it was
    // NOT reproducible against this app — six malformed Bearer shapes and four
    // garbage/empty session cookies all returned 200 with nothing logged,
    // against a production build. So this catch is insurance against a vector
    // that testing could not trigger, not a fix for an observed failure.
    //
    // ⚠ Do NOT "fix" the advisory by bumping next-auth in THIS app alone. The
    // beta.31 pin is JWT wire-format compatibility with the issuer and every
    // other vertical, not a dependency preference — `npm audit fix --force`
    // would move Food to beta.32 on its own and risk breaking cross-app session
    // decode, which is the entire auth model. Moving off beta.31 is an
    // ecosystem-wide, lockstep decision.
    console.error("[session] getToken threw — treating as signed out", err);
    return null;
  }
  if (!token) return null;

  const userId = (token.id as string | undefined) ?? token.sub;
  if (!userId) return null;

  return {
    userId,
    email: (token.email as string | undefined) ?? null,
    locale: (token.locale as string | undefined) ?? "en",
    legacyRole: (token.role as string | undefined) ?? "CLIENT",
    emailVerified: (token.emailVerified as boolean | undefined) ?? false,
    memberships: (token.memberships as SessionMembership[] | undefined) ?? [],
  };
}

/**
 * The JWT's embedded memberships claim — fast (no network) but **possibly
 * stale**, and the staleness is proven, not theoretical: Apparel's Slice 3
 * verification caught a live request where this claim read `[]` while the
 * ecosystem API already reported an ACTIVE PROVIDER membership.
 *
 * portal-web refreshes this claim only when the token is re-issued or on an
 * explicit `trigger === "update"`. So a membership this app mints itself —
 * `(FOOD, CLIENT)` on a buyer's first save/follow/order, or `(FOOD, PROVIDER)`
 * at Slice 13's onboarding submit — will NOT appear here until the user's
 * session is re-issued. Authorizing off this claim would deny a seller access
 * to the dashboard they just successfully created.
 *
 * **Rule:** use this only where a round-trip is impossible or a stale read is
 * harmless — i.e. edge middleware, or hiding/showing a nav item. Every
 * authorization decision goes through `lib/ecosystem.ts`, which reads the
 * ecosystem API and is authoritative.
 */
export function sessionMemberships(session: FoodSession, vertical = "FOOD"): SessionMembership[] {
  return session.memberships.filter((m) => m.vertical === vertical);
}
