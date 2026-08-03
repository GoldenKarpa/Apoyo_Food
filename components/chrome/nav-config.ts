import { BookMarked, Home, ReceiptText, Search, User, type LucideIcon } from "lucide-react";

import type { ComingSoonFeature } from "@/lib/coming-soon";

/**
 * The five buyer-surface destinations, in Part F3's own order:
 * **Home · Browse · Orders · Saved · Account**, active = green.
 *
 * Defined once and consumed by both `<BottomNav>` (mobile) and `<SiteHeader>`
 * (≥768px) so the two cannot drift into offering different navigation — which
 * is the usual way a "mobile nav" and a "desktop nav" end up being two products.
 *
 * No `"use client"`: this module holds no state and no handlers, so the
 * server-rendered header and the client-rendered bottom nav can both import it.
 *
 * ── href vs feature ──
 * A destination gets an `href` when the route is real. It gets a `feature`
 * when nothing in the current phase creates it, in which case tapping it
 * opens the `<ComingSoon>` sheet rather than landing on a scaffold page:
 *   - Orders → real since Slice 17 (`/orders`), the one-line contract applied
 *     — this entry used to read `feature: "buyerOrders"`.
 *   - Account → ⚠ **no slice in Phases 0–3 builds a buyer account area at all.**
 *     The route stub exists from Slice 1, but a nav icon leading to a page that
 *     explains it isn't built yet is the exact dead end the stub pattern exists
 *     to prevent.
 * Replacing a `feature` is deleting that line and adding an `href`.
 */
export interface NavItem {
  key: string;
  icon: LucideIcon;
  /** A real destination. Mutually exclusive with `feature`. */
  href?: string;
  /** An unbuilt destination — opens the `<ComingSoon>` sheet instead. */
  feature?: ComingSoonFeature;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "home", icon: Home, href: "/" },
  { key: "browse", icon: Search, href: "/browse" },
  { key: "orders", icon: ReceiptText, href: "/orders" },
  { key: "saved", icon: BookMarked, href: "/saved" },
  { key: "account", icon: User, feature: "buyerAccount" },
];
