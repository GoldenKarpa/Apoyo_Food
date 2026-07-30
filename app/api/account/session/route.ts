import { NextResponse } from "next/server";
import { getFoodSession, sessionMemberships } from "@/lib/session";
import { getMemberships } from "@/lib/ecosystem";
import { requireFoodSeller, requireAdmin } from "@/lib/auth-guards";

/**
 * Slice 3 verification endpoint (ported from Salon/Apparel's equivalent, which
 * exist for the same reason): proves in one call that the shared cookie decodes
 * here and that the ecosystem membership read round-trips.
 *
 * Deliberately returns BOTH membership sources so the staleness gap documented
 * in lib/session.ts is observable rather than theoretical — mint a membership,
 * reload without re-issuing the token, and `session.memberships` will lag while
 * `ecosystem.memberships` is already correct.
 *
 * Exposes only the caller's OWN session, so there is nothing to leak to an
 * unauthenticated request beyond `{ session: null }`.
 */
export async function GET() {
  const session = await getFoodSession();
  if (!session) {
    return NextResponse.json({ session: null }, { status: 200 });
  }

  let ecosystem: unknown;
  try {
    ecosystem = { memberships: await getMemberships(session.userId) };
  } catch (e) {
    // Report the failure rather than 500 — during verification, "the cookie
    // decoded but the ecosystem call failed" is a materially different diagnosis
    // from "no session", and collapsing them wastes debugging time.
    ecosystem = { error: e instanceof Error ? e.message : String(e) };
  }

  // Guard outcomes for the caller's OWN account — reports whether each gate
  // opens, never any other user's data. Also the fastest way to diagnose "why
  // can't this seller reach their dashboard" in Slice 13.
  let sellerGuard: unknown;
  try {
    const ctx = await requireFoodSeller();
    sellerGuard = ctx
      ? { open: true, sellerId: ctx.seller.id, slug: ctx.seller.slug, status: ctx.seller.status }
      : { open: false };
  } catch (e) {
    sellerGuard = { error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json({
    session: {
      userId: session.userId,
      email: session.email,
      locale: session.locale,
      legacyRole: session.legacyRole,
      emailVerified: session.emailVerified,
      // From the JWT claim — fast, possibly stale.
      memberships: session.memberships,
      foodMemberships: sessionMemberships(session),
    },
    // From the ecosystem API — authoritative.
    ecosystem,
    guards: {
      seller: sellerGuard,
      admin: (await requireAdmin()) !== null,
    },
  });
}
