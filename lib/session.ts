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
  const token = await getToken({
    req: { headers: await headers() },
    secret: process.env.AUTH_SECRET,
    // Must mirror portal-web's `isSecure` exactly — see the note above.
    secureCookie: process.env.NODE_ENV === "production",
  });
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
