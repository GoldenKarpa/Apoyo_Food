"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChefHat, Camera, LayoutDashboard, MessagesSquare, Receipt, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The seller dashboard's navigation — the shell Slice 13 owes the rest of
 * Phase 2 and 3.
 *
 * ⚠ **All five destinations are real as of Slice 17.** `sellerOrders` was the
 * last stub standing (`sellerListings` retired at Slice 14, `sellerStories`
 * at Slice 15) — the conventions block's rule is that an unbuilt action opens
 * a localized explain-the-feature modal, never a dead link, a disabled
 * control or a missing nav item, and Orders held that line until the real
 * order lifecycle existed to link to. Replacing a stub is always this same
 * shape: delete one line here plus one registry entry in `lib/coming-soon.ts`.
 *
 * Same source of truth for both widths (`components/chrome/nav-config.ts`'s
 * lesson from the buyer surface): one array, rendered as a scrolling row on a
 * phone and a wrapped row above it. The seller surface has no bottom tab bar —
 * this is a workspace, not a browse surface, and Part F3 reserves that bar for
 * the buyer's five destinations.
 */

const REAL_ITEMS = [
  { href: "/food", key: "dashboard", icon: LayoutDashboard },
  { href: "/food/listings", key: "listings", icon: ChefHat },
  { href: "/food/stories", key: "stories", icon: Camera },
  { href: "/food/orders", key: "orders", icon: Receipt },
  // PC-1 — sits next to Orders on purpose. A persistent conversation is a
  // sibling of the order pipeline, not a tab inside it: the whole point is
  // that it outlives any one order.
  { href: "/food/messages", key: "messages", icon: MessagesSquare },
  { href: "/food/profile", key: "profile", icon: UserRound },
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
      </ul>
    </nav>
  );
}
