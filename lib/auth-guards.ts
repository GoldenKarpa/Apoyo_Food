import type { FoodSeller } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFoodSession, type FoodSession } from "@/lib/session";
import { getMemberships, createMembership } from "@/lib/ecosystem";

/**
 * Buyer commitment actions (save, follow, place an order): any authenticated
 * user. `(FOOD, CLIENT)` is minted **lazily on first commitment**, not at
 * sign-in — browsing is anonymous everywhere (architecture F3: "auth gates only
 * at commitment"), and a membership minted for someone who only looked would be
 * meaningless standing.
 *
 * The create endpoint upserts, so a call racing with itself is harmless; reading
 * first just avoids writing on every single commitment.
 */
export async function ensureFoodClientMembership(userId: string): Promise<void> {
  const memberships = await getMemberships(userId);
  const hasClientMembership = memberships.some(
    (m) => m.vertical === "FOOD" && m.role === "CLIENT"
  );
  if (hasClientMembership) return;
  await createMembership({ userId, vertical: "FOOD", role: "CLIENT" });
}

/**
 * `(FOOD, PROVIDER)` — minted at Slice 13's onboarding submit, which is Food's
 * own authorization point for provider standing (architecture B1 / decision 15:
 * the `vertical_registration_config` toggle gates CTA VISIBILITY only and is not
 * a security control).
 *
 * ⚠ Separate from `ensureFoodClientMembership` above rather than a parameter,
 * because the two have opposite failure postures. A missing CLIENT membership
 * costs a buyer nothing — the save still lands. A missing PROVIDER membership is
 * the "ghost provider" state inverted: the seller row exists but carries no
 * ecosystem standing, so no other vertical, and no admin surface reading
 * memberships, can see that this person sells food. It is repairable and it is
 * repaired — `loadSellerWorkspace`'s callers re-run this on every dashboard
 * render — but it must never be silently ignored.
 *
 * Returns whether standing is now in place. Callers decide whether that is
 * fatal; onboarding treats it as non-fatal on purpose (see the write-order note
 * in `lib/actions/onboard-seller.ts`).
 */
export async function ensureFoodProviderMembership(userId: string): Promise<boolean> {
  try {
    const memberships = await getMemberships(userId);
    const has = memberships.some(
      (m) => m.vertical === "FOOD" && m.role === "PROVIDER" && m.status === "ACTIVE",
    );
    if (has) return true;
    await createMembership({ userId, vertical: "FOOD", role: "PROVIDER" });
    return true;
  } catch (err) {
    console.error("[seller] (FOOD, PROVIDER) membership mint failed", err);
    return false;
  }
}

export interface FoodSellerContext {
  session: FoodSession;
  seller: FoodSeller;
}

/**
 * Gates the fully-authorized seller experience: requires BOTH an ACTIVE
 * `(FOOD, PROVIDER)` ecosystem membership AND a local `FoodSeller` row with
 * status `ACTIVE` (architecture Part G).
 *
 * ⚠ Reads memberships from the ecosystem API, never from the JWT's embedded
 * claim. The claim is only refreshed when portal-web re-issues the token, so a
 * seller who just completed onboarding would still be denied here if this
 * trusted it — that exact failure was observed live in Apparel's Slice 3
 * verification. See lib/session.ts.
 *
 * A `PENDING`/`SUSPENDED` seller legitimately has no ACTIVE membership and gets
 * `null`. That is deliberate: Slice 13's dashboard shell must render those
 * states from `FoodSeller` directly (via `resolveFoodSeller`), because they need
 * status-specific UI, not a blanket unauthorized response.
 */
export async function requireFoodSeller(): Promise<FoodSellerContext | null> {
  const session = await getFoodSession();
  if (!session) return null;

  const seller = await prisma.foodSeller.findUnique({ where: { userId: session.userId } });
  if (!seller || seller.status !== "ACTIVE") return null;

  const memberships = await getMemberships(session.userId);
  const hasActiveMembership = memberships.some(
    (m) => m.vertical === "FOOD" && m.role === "PROVIDER" && m.status === "ACTIVE"
  );
  if (!hasActiveMembership) return null;

  return { session, seller };
}

/**
 * Resolves the seller row for ANY standing (including PENDING/SUSPENDED), for
 * the dashboard shell that has to render those states. Deliberately does not
 * check membership — owning the row is what proves "this is my workspace".
 */
export async function resolveFoodSeller(): Promise<{
  session: FoodSession;
  seller: FoodSeller | null;
} | null> {
  const session = await getFoodSession();
  if (!session) return null;
  const seller = await prisma.foodSeller.findUnique({ where: { userId: session.userId } });
  return { session, seller };
}

/**
 * Food admin (`/food/admin`): the legacy global `role === "ADMIN"`. The
 * membership system deliberately does not model admins (locked ecosystem-wide),
 * so this is the one legitimate read of the legacy role field.
 *
 * ⚠ Architecture Part G flags this as "legacy until the foundation program
 * replaces it — re-check at build time". Re-checked 2026-07-30: still the live
 * mechanism, unchanged.
 */
export async function requireAdmin(): Promise<FoodSession | null> {
  const session = await getFoodSession();
  if (!session) return null;
  return session.legacyRole === "ADMIN" ? session : null;
}

/**
 * ⚠ Call this ABOVE THE FIRST QUERY in every data-loading admin page (Slice 16).
 *
 * A layout gate controls what is *displayed*, not what *executes*: a page under
 * a denying layout still runs its own queries and still serializes the results
 * into the RSC payload, which ships to the browser. That was a real, live PII
 * leak in Portal — reproduced against a production build, `/admin/users` and the
 * staged registrations queue both shipped rows to unauthenticated requests
 * (`PRE_LAUNCH_CHECKLIST.md` §0, Apoyo-Demia repo). Slice 16 must not repeat it.
 *
 * Defined here, ahead of the admin pages that need it, so it exists before the
 * first one is written rather than being remembered afterwards.
 *
 * Returns false when the caller must render nothing and query nothing.
 */
export async function adminMayLoadData(): Promise<boolean> {
  return (await requireAdmin()) !== null;
}
