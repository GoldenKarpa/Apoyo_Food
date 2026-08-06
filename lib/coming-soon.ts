/**
 * The `<ComingSoon>` registry — BUILD_SLICES.md's conventions block, and the
 * 2026-07-28 ecosystem ruling that Food ships as a "visual demo" shell.
 *
 * Unbuilt actions never render as a dead link, a disabled control, a silent
 * no-op or a missing nav item; they open a localized modal that explains the
 * planned feature, which doubles as living spec in front of a demo audience.
 * This module is the single registry those modals read from.
 *
 * ── The one-line contract ──
 *   Adding a stub at a call site is ONE line:     <ComingSoon feature="requestOrder" />
 *   Replacing it with the real thing is DELETING  that one line.
 * Registering a *new* feature is one entry here plus its title/description/action
 * in `messages/{en,es}.json` under `comingSoon.features.<key>`. The key set below
 * IS the type — a typo in `feature=` is a compile error, not a modal that renders
 * an empty title during a demo.
 *
 * ── Why `phase` is data and not prose ──
 * Slice 19's done-when is that "every buyer-facing `<ComingSoon>` stub from
 * Phase 1 has been replaced by the real feature it stood in for". A phase stored
 * beside each key means that audit reads this file rather than trusting a
 * hand-maintained list, and the modal can honestly tell a viewer *when* the
 * feature arrives instead of saying "soon". `<ComingSoon>` also stamps
 * `data-coming-soon="<key>"` on its trigger, so the same audit works against a
 * rendered page.
 */

/** BUILD_SLICES.md phase that builds the feature for real. */
export type FeaturePhase = 2 | 3 | 4 | 6;

/**
 * Lucide icon names, resolved to components in `components/coming-soon.tsx`.
 * Kept as strings so this module stays pure data and can be imported by server
 * code, scripts and a later stub audit without pulling in React.
 */
export type FeatureIcon =
  | "utensils"
  | "message"
  | "receipt"
  | "user"
  | "chefHat"
  | "chart";

export interface ComingSoonEntry {
  /** BUILD_SLICES.md phase that builds it. */
  phase: FeaturePhase;
  /** The slice that does it — shown to no one, but it keeps this file honest. */
  slice: number;
  icon: FeatureIcon;
}

/**
 * Every stub the Phase-1 buyer demo needs.
 *
 * The set is deliberately small. Food's plan stubs *actions*, not pages: Phase 1
 * builds home, browse, search, category landings, listing detail, seller
 * profiles, saves, follows and the Fresh Today viewer for real against seed
 * data, so the only things left standing in are the commitments that need a
 * seller on the other end (ordering, messaging) and the two destinations no
 * Phase 0–3 slice creates at all.
 *
 * - `requestOrder`  — GONE (Slice 17). Was the sticky listing CTA (Slice 10
 *   rendered it). `<RequestOrderSheet>` replaces it now.
 * - `messageSeller` — GONE (Slice 19, retired rather than replaced — see the
 *   Slice 19 note below for why this one didn't follow the usual pattern).
 * - `buyerOrders`   — GONE (Slice 17). Was the bottom nav's Orders
 *   destination; it links to the real `/orders` now.
 * - `buyerAccount`  — the nav's Account destination. Flagged as an addition
 *   beyond any brief's list, and for the same reason Apparel added its own:
 *   Part F3's bottom tab bar has an Account destination and NO slice in Phases
 *   0–3 creates a buyer account area. A nav icon that goes nowhere is the exact
 *   dead end the stub pattern exists to prevent.
 *
 * ── Slice 13: one key retired, four added ──
 * `becomeSeller` is GONE, and its removal is the one-line contract working as
 * designed: onboarding now exists, so `components/chrome/site-footer.tsx` links
 * to it for real (gated on the §6b registration toggle, which Slice 13 also
 * flips to true) instead of opening a modal about it.
 *
 * The four new keys are the seller dashboard's own nav destinations. The
 * dashboard shell ships in Slice 13 but the surfaces it navigates to do not, and
 * the conventions block is explicit that an unbuilt destination gets a modal
 * rather than a missing nav item — a seller who cannot see where listings will
 * live has no way to know the product has them.
 * - `sellerListings` (Slice 14) · `sellerStories` (Slice 15) ·
 *   `sellerOrders` — GONE (Slice 17), the seller nav's Orders destination
 *   links to the real `/food/orders` now · `sellerInsights` (Phase 6, unsliced).
 * ⚠ `sellerInsights` is the first entry with `phase: 6`, which is why
 * `FeaturePhase` gained that value. It is deliberately registered even though no
 * slice in this file builds it: Part E7 calls insights the product's signature
 * feature, and Slice 9 has been logging `FoodDemandEvent` rows for it since
 * Phase 1.
 *
 * ── Slice 14: `sellerListings` retired ──
 * The one-line contract again: `/food/listings` is real now, so the seller
 * nav links to it directly (`components/seller/seller-nav.tsx`) instead of
 * opening a modal about it, and the dashboard's listings card
 * (`components/seller/workspace-empty-states.tsx`) became data-driven.
 *
 * ── Slice 15: `sellerStories` retired too ──
 * `/food/stories` (Fresh Today posting + the Menu shelf manager) is real now,
 * same treatment: the nav links to it directly and the dashboard's Fresh
 * Today card is data-driven off a real, non-expired post count. Two stubs
 * remained after this slice: `sellerOrders` (Slice 17), `sellerInsights`
 * (Phase 6).
 *
 * ── Slice 17: three more retired — `requestOrder`, `buyerOrders`, `sellerOrders` ──
 * The real order lifecycle (request → accept/decline → complete, both sides)
 * is built now. The one-line contract, applied a third time: the listing
 * page's sticky CTA (`<RequestOrderSheet>`), the bottom tab bar's Orders
 * destination, and the seller nav's Orders destination all link/render for
 * real instead of opening a modal. `messageSeller` and `sellerInsights` were
 * the two keys still standing after this slice — Slice 18 and Phase 6
 * respectively.
 *
 * ── Slice 19: `messageSeller` retired, but NOT by the usual pattern ──
 * Found during this slice's own bilingual-sweep/no-retrofit-debt pass: this
 * key had never actually been wired to a real call site.
 * `app/(client)/sellers/[slug]/page.tsx` (built Slice 11) never rendered
 * `<ComingSoon feature="messageSeller">` — `git log` on that file confirms no
 * commit ever added it — so the seller profile has shipped, every slice since
 * Slice 11, with no "message me" affordance and no modal explaining its
 * absence either. Only the style guide's component gallery ever rendered
 * this one, which isn't a real user-facing surface. Once Slice 18 built the
 * real order thread (Part E5/E6's actual buyer↔seller channel, reachable
 * once a seller accepts a request), the registry entry's own reason for
 * being — "explain to a demo viewer why there's no message button here" —
 * stopped being reachable by anyone who could act on the explanation. Rather
 * than wire the stub onto the profile this late just to satisfy the pattern,
 * the entry is retired outright: `buyerAccount` and `sellerInsights` are the
 * two keys still standing, both genuinely deferred to a later phase rather
 * than silently dead.
 */
export const COMING_SOON_FEATURES = {
  buyerAccount: { phase: 4, slice: 0, icon: "user" },
  sellerInsights: { phase: 6, slice: 0, icon: "chart" },
} as const satisfies Record<string, ComingSoonEntry>;

export type ComingSoonFeature = keyof typeof COMING_SOON_FEATURES;

/** Stable ordering for the style guide and any later stub audit. */
export const COMING_SOON_KEYS = Object.keys(COMING_SOON_FEATURES) as ComingSoonFeature[];
