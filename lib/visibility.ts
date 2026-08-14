import type { Prisma, VisibilityClass } from "@prisma/client";

import { isFoodPubliclyLaunched } from "@/lib/ecosystem";

/**
 * LC-4 — the launch gate for every buyer-facing query.
 *
 * Plan: `Launch_Control_Plan.md` §LC-4 (Apoyo-Portal). Spec:
 * `Provider_Onboarding_Workflow.md` §6.1/§6.2.
 *
 * ## The rule, in one line
 *
 *     closed  ->  the storefront shows SHOWCASE sellers
 *     open    ->  the storefront shows REAL sellers
 *
 * `DEMO` and `INTERNAL` are returned by **neither** state. DEMO powers the demo
 * experience and is never in a public storefront before or after launch;
 * INTERNAL is development junk that must never appear anywhere. Because this
 * helper returns exactly one class, both are excluded structurally rather than
 * by remembering to exclude them.
 *
 * ## Why this is async, and why that is the point
 *
 * Reading the switch is a network call to portal-web, so the gate cannot be a
 * plain constant. That is inconvenient exactly once — at the call site — and it
 * buys the thing LC-4 most needs: **the compiler visits every query that
 * surfaces a seller.** `DISCOVERABLE` used to be a const that a new query could
 * spread without thinking; `discoverable()` cannot be used without awaiting it,
 * so a new buyer-facing query cannot silently skip the gate. The plan warns
 * "miss one and it leaks" — this makes missing one a type error rather than a
 * code-review hope.
 *
 * ## Fail closed
 *
 * `isFoodPubliclyLaunched()` returns `false` on every failure path (see its own
 * comment). So an unreachable ecosystem API shows SHOWCASE sellers, never REAL
 * ones. A bug that hides real sellers is recoverable; one that reveals them
 * before launch is not.
 *
 * ## What this does NOT gate
 *
 * Seller dashboards, onboarding, order threads and admin. A seller whose
 * vertical is closed must still sign in, build their profile and manage their
 * catalogue — **hidden must not mean locked out** is the point of the whole
 * program. Only buyer-facing reads go through here.
 */

/** The single visibility class the public storefront may show right now. */
export async function publicVisibilityClass(): Promise<VisibilityClass> {
  return (await isFoodPubliclyLaunched()) ? "REAL" : "SHOWCASE";
}

/**
 * The seller-side filter fragment, for queries whose root model is `FoodSeller`.
 *
 *     where: { ...(await publicSellerWhere()), slug }
 */
export async function publicSellerWhere(): Promise<Prisma.FoodSellerWhereInput> {
  return { status: "ACTIVE", visibilityClass: await publicVisibilityClass() };
}
