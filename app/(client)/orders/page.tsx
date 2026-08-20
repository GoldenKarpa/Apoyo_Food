import Link from "next/link";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import { StatusChip } from "@/components/ui/chip";
import { clientOrderSummaries } from "@/lib/order";
import { ORDER_STATUS_TONE } from "@/lib/order-status-labels";
import { formatCentsTtd } from "@/lib/money";
import { formatFulfillmentInstant } from "@/lib/time";
import { getFoodSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("client.orders");
  return { title: t("title") };
}

export const dynamic = "force-dynamic";

/**
 * `/orders` — the buyer's own order history (Slice 17, architecture F1),
 * replacing Slice 1's placeholder wholesale.
 *
 * ⚠ No redirect for an anonymous visitor — `<SignedOutNotice>`'s standing
 * rule (`components/seller/signed-out-notice.tsx`), reused here with the
 * `client.signedOut` namespace, its first caller on this surface.
 */
export default async function OrdersPage() {
  const session = await getFoodSession();
  if (!session) return <SignedOutNotice namespace="client.signedOut" loginHref="/login" />;

  const [t, tm, ts, locale, orders] = await Promise.all([
    getTranslations("client.orders"),
    getTranslations("client.messages"),
    getTranslations("orderStatus"),
    getLocale(),
    clientOrderSummaries(session.userId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-display font-semibold text-ink">{t("title")}</h1>
        {/* PC-1 — the buyer's route into the Messages surface. Here rather than
            in the bottom tab bar: Part F3 reserves that bar for five
            destinations, and this is the page a buyer is already on when they
            think "what did that kitchen say?". */}
        <Link href="/messages" className="text-label text-green underline">
          {tm("title")}
        </Link>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-card border border-hairline bg-card p-6 text-body text-ink-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => {
            const item = order.items[0];
            return (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="flex flex-col gap-2 rounded-card border border-hairline bg-card p-4 transition-colors duration-200 ease-soft hover:bg-sunken"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-label font-semibold text-ink">{order.orderNumber}</span>
                    <StatusChip tone={ORDER_STATUS_TONE[order.status]}>{ts(order.status)}</StatusChip>
                  </div>
                  <p className="text-body text-ink">
                    {item ? `${item.quantity}× ${item.titleSnapshot}` : ""}
                    {order.items.length > 1 ? t("moreItems", { count: order.items.length - 1 }) : ""}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-ink-muted">
                    <span>{order.seller.displayName}</span>
                    <span>{formatFulfillmentInstant(order.fulfillmentAt, locale)}</span>
                  </div>
                  {order.subtotalCents !== null && (
                    <span className="text-label font-medium text-terracotta">
                      {formatCentsTtd(order.subtotalCents)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
