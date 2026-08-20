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
 * Resolves access. Returns the viewer when allowed, or an **entirely
 * undifferentiated denial** otherwise. Callers must `notFound()`, and must do it
 * before rendering anything at all.
 *
 * ## ⚠ R6 — why there is no longer a `signedOut` escape hatch (2026-08-20)
 *
 * This used to report `signedOut` so the page could offer a login instead of a
 * 404. That was the disclosure `Provider_Demo_Plan.md` R6 recorded: the mode is
 * checked first, so a signed-out visitor got a **404 when the demo was OFF** and
 * a **login redirect when it was ON** — which let anyone with no account at all
 * probe the current toggle state.
 *
 * ⚠ **The fix is NOT to move the session check ahead of the mode check.** That
 * closes the toggle leak by opening a permanent one: `/…/demo` would then answer
 * a login redirect to every signed-out visitor in every mode, confirming
 * forever that the route exists — the exact thing this file's "404, never 403"
 * rule exists to prevent, and it would still be true in `APPROVED_PROVIDER`
 * mode, which exists precisely to make the provider's-eye view hideable (R4).
 *
 * So a signed-out visitor now gets the same 404 in **every** mode, making the
 * route indistinguishable from one that does not exist. That is the whole point.
 *
 * ⚠ **It is a trade, not a free win, and here is the cost so nobody has to
 * rediscover it:** a signed-out person holding the URL gets a dead end rather
 * than a sign-in prompt. That is acceptable because **D3 makes the entry point
 * the `/home` launchpad, and `/home` is itself sign-in-only** (Apoyo-Demia
 * `app/home/page.tsx` redirects to `/login` before it renders any card), so no
 * visitor ever reaches here signed-out through the product. If the demo is ever
 * meant to be shareable as a raw link to logged-out strangers, that is the
 * decision to revisit — and reversing this is one branch, right here.
 *
 * ⚠ **Amended in all three verticals in one pass**, because §2.2's ladder is
 * shared: three ports disagreeing about what a signed-out visitor can infer is
 * worse than any single answer.
 */
export async function resolveDemoAccess(): Promise<
  { allowed: true; viewer: DemoViewer } | { allowed: false }
> {
  const mode = await getDemoAccessMode();
  // Checked first and unconditionally: when the demo is off it does not exist,
  // and no amount of session state changes that.
  if (mode === "OFF") return { allowed: false };

  const session = await getFoodSession();
  // ⚠ R6: the SAME denial as every other refusal. Not a login redirect — see
  // the note above; a differentiated response here is the leak itself.
  if (!session) return { allowed: false };

  // Every open mode requires a verified email. An unverified account is not a
  // person we can attribute anything to yet.
  if (!session.emailVerified) return { allowed: false };

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
    return { allowed: false };
  }
  const hasProviderStanding = memberships.some(
    (m) => m.role === "PROVIDER" && m.status === "ACTIVE",
  );
  if (!hasProviderStanding) return { allowed: false };

  return { allowed: true, viewer: { session } };
}
