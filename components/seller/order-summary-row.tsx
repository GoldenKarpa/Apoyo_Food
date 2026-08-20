import { useLocale, useTranslations } from "next-intl";

import { StatusChip } from "@/components/ui/chip";
import { ORDER_STATUS_TONE } from "@/lib/order-status-labels";
import { formatCentsTtd } from "@/lib/money";
import { formatFulfillmentInstant } from "@/lib/time";
import type { SellerOrderSummary } from "@/lib/order";

/**
 * One row of the seller's order inbox (`/food/orders`, Slice 17).
 *
 * ## ⚠ Extracted rather than copied (PD-S10)
 *
 * This markup used to live inline inside `app/food/(dashboard)/orders/page.tsx`.
 * The demo needs the same row, and the plan is explicit that the demo renders
 * the REAL components — "a copy is the thing that silently stops matching the
 * product" (`Provider_Demo_Plan.md` §2.3a, Apparel's own finding for the
 * identical situation). So the row moved here and the page renders it.
 *
 * ## ⚠ The WRAPPER is the caller's, and that is the whole point of the split
 *
 * On `/food/orders` each row is a `<Link>` to the order's page. In the demo,
 * opening an order must NOT be a navigation — a server navigation re-runs the
 * access guard and re-seeds the fixtures, throwing away everything the visitor
 * has done (see `components/demo/demo-shell.tsx`). So the demo wraps the same
 * row in a `<button>` instead. `SELLER_ORDER_ROW_CLASS` is exported so both
 * wrappers carry identical styling and cannot drift apart.
 *
 * ## ⚠ Isomorphic — no `"use client"`, no `async`
 *
 * `useTranslations()`/`useLocale()` resolve on either side of the RSC boundary
 * in next-intl v4 (this repo's own `components/ui/*` pattern). The real page
 * server-renders it; the demo renders the same file client-side, where the row
 * has to re-render the moment a fixture order changes status.
 */

export const SELLER_ORDER_ROW_CLASS =
  "flex w-full flex-col gap-2 rounded-card border border-hairline bg-card p-4 text-left transition-colors duration-200 ease-soft hover:bg-sunken";

export function SellerOrderRow({ order }: { order: SellerOrderSummary }) {
  const t = useTranslations("seller.orders");
  const ts = useTranslations("orderStatus");
  const locale = useLocale();
  const item = order.items[0];

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-label font-semibold text-ink">{order.orderNumber}</span>
        <StatusChip tone={ORDER_STATUS_TONE[order.status]}>{ts(order.status)}</StatusChip>
      </div>
      <p className="text-body text-ink">
        {item ? `${item.quantity}× ${item.titleSnapshot}` : ""}
        {order.items.length > 1 ? t("moreItems", { count: order.items.length - 1 }) : ""}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-ink-muted">
        <span>{formatFulfillmentInstant(order.fulfillmentAt, locale)}</span>
        {order.subtotalCents !== null && (
          <span className="font-medium text-terracotta">{formatCentsTtd(order.subtotalCents)}</span>
        )}
      </div>
      {order.status === "PENDING" && (
        <p className="text-caption text-gold">
          {t("respondByPrefix")}: {formatFulfillmentInstant(order.respondBy, locale)}
        </p>
      )}
    </>
  );
}
