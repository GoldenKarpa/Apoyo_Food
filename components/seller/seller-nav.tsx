"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChefHat, Camera, LayoutDashboard, Receipt, UserRound } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { cn } from "@/lib/utils";

/**
 * The seller dashboard's navigation — the shell Slice 13 owes the rest of
 * Phase 2 and 3.
 *
 * ⚠ **Two destinations are real and three are stubs, and that is deliberate.**
 * The conventions block's rule is that an unbuilt action opens a localized
 * explain-the-feature modal, never a dead link, a disabled control or a MISSING
 * NAV ITEM. Hiding Listings until Slice 14 would leave a seller with no way to
 * know the product has listings at all — the nav is the only place the shape of
 * the workspace is visible. Replacing each stub is deleting one line here plus
 * one registry entry, exactly as `becomeSeller` was replaced by this slice.
 *
 * Same source of truth for both widths (`components/chrome/nav-config.ts`'s
 * lesson from the buyer surface): one array, rendered as a scrolling row on a
 * phone and a wrapped row above it. The seller surface has no bottom tab bar —
 * this is a workspace, not a browse surface, and Part F3 reserves that bar for
 * the buyer's five destinations.
 */

const REAL_ITEMS = [
  { href: "/food", key: "dashboard", icon: LayoutDashboard },
  { href: "/food/profile", key: "profile", icon: UserRound },
] as const;

const STUB_ITEMS = [
  { feature: "sellerListings", key: "listings", icon: ChefHat },
  { feature: "sellerStories", key: "stories", icon: Camera },
  { feature: "sellerOrders", key: "orders", icon: Receipt },
] as const;

const ITEM_CLASS =
  "tap-target inline-flex shrink-0 items-center gap-2 rounded-pill px-4 text-label font-medium transition-colors duration-200 ease-soft";

export function SellerNav() {
  const t = useTranslations("seller.nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")} className="border-b border-hairline bg-card">
      <ul className="screen-pad rail-scroll flex items-center gap-2 overflow-x-auto py-2">
        {REAL_ITEMS.map(({ href, key, icon: Icon }) => {
          // `/food` must match exactly — a `startsWith` test would light
          // "Dashboard" on every child route in the workspace.
          const active = href === "/food" ? pathname === "/food" : pathname.startsWith(href);
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(ITEM_CLASS, active ? "bg-green text-card" : "text-ink hover:bg-sunken")}
              >
                <Icon aria-hidden className="size-4" />
                {t(`items.${key}`)}
              </Link>
            </li>
          );
        })}

        {STUB_ITEMS.map(({ feature, key, icon: Icon }) => (
          <li key={key}>
            <ComingSoon feature={feature} asChild>
              <button type="button" data-coming-soon={feature} className={cn(ITEM_CLASS, "text-ink hover:bg-sunken")}>
                <Icon aria-hidden className="size-4" />
                {t(`items.${key}`)}
              </button>
            </ComingSoon>
          </li>
        ))}
      </ul>
    </nav>
  );
}
