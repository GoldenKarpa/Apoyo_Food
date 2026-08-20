import { getDemoAccessMode, getMemberships } from "@/lib/ecosystem";
import { getFoodSession, type FoodSession } from "@/lib/session";

/**
 * PD-S10 — may this visitor open the Food seller demo?
 *
 * Plan: `Apoyo-Portal/Provider_Demo_Plan.md` §2.2. Ported from Salon's
 * `lib/demo/access.ts` (PD-S2) by way of Apparel's PD-S9 copy, almost verbatim;
 * the guard logic is vertical-agnostic apart from the session type, which is
 * exactly why the plan proved it once and ports it twice.
 *
 * ⚠ **A denial is a 404, never a 403.** A 403 confirms the route exists to
 * someone who is not supposed to know that it does. Callers must `notFound()`,
 * and must do it before rendering anything at all.
 *
 * ⚠ **Provider standing is read from the ecosystem API, not the JWT.** The
 * `memberships` claim in the shared token can predate a membership being
 * granted or revoked — the staleness case `lib/session.ts` documents at length
 * and which `scripts/mint-test-session.ts` deliberately reproduces — so
 * trusting it would let a stale token through `APPROVED_PROVIDER` mode. The
 * extra round trip happens once per demo page load, behind a 60s TTL cache, and
 * is not a hot path.
 *
 * ⚠ **This demo has no accounts and no rows of its own.** It renders fixtures.
 * Nothing here relates to the Demia/Social demo's pool accounts, `DemoSession`
 * table or any visibility class — see the plan's opening note. It also
 * deliberately does NOT call `loadSellerWorkspace()` or `requireFoodSeller()`:
 * a demo visitor has no `FoodSeller` row, and needing one is precisely why they
 * are here.
 */

export interface DemoViewer {
  session: FoodSession;
}

/**
 * Resolves access. Returns the viewer when allowed, or a deliberately
 * undifferentiated denial for every refusal — so a caller cannot accidentally
 * render a different response for "wrong mode" than for "not a provider".
 *
 * The one exception a caller may want to distinguish is a signed-OUT visitor,
 * who should be offered a sign-in rather than a 404: `signedOut` says so
 * without revealing whether they would have been allowed in had they signed in.
 */
export async function resolveDemoAccess(): Promise<
  { allowed: true; viewer: DemoViewer } | { allowed: false; signedOut: boolean }
> {
  const mode = await getDemoAccessMode();
  // Checked first and unconditionally: when the demo is off it does not exist,
  // and no amount of session state changes that.
  if (mode === "OFF") return { allowed: false, signedOut: false };

  const session = await getFoodSession();
  if (!session) return { allowed: false, signedOut: true };

  // Every open mode requires a verified email. An unverified account is not a
  // person we can attribute anything to yet.
  if (!session.emailVerified) return { allowed: false, signedOut: false };

  if (mode === "VERIFIED_EMAIL") return { allowed: true, viewer: { session } };

  // APPROVED_PROVIDER — an ACTIVE provider membership in ANY vertical, not just
  // Food (user ruling 2026-08-19: provider standing anywhere unlocks every
  // demo, since the point is to help someone weigh a SECOND vertical). ⚠ Note
  // this is NOT `isFoodSeller()`, which asks the narrower Food-only question.
  let memberships;
  try {
    memberships = await getMemberships(session.userId);
  } catch (err) {
    // Fail closed, consistent with every other read in this path.
    console.error("[demo] membership read failed — denying", err);
    return { allowed: false, signedOut: false };
  }
  const hasProviderStanding = memberships.some(
    (m) => m.role === "PROVIDER" && m.status === "ACTIVE",
  );
  if (!hasProviderStanding) return { allowed: false, signedOut: false };

  return { allowed: true, viewer: { session } };
}
