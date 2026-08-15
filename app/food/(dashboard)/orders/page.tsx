import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import { StatusChip } from "@/components/ui/chip";
import { loadSellerWorkspace } from "@/lib/seller";
import { sellerOrderSummaries, type SellerOrderSummary } from "@/lib/order";
import { ORDER_STATUS_TONE } from "@/lib/order-status-labels";
import { formatCentsTtd } from "@/lib/money";
import { formatFulfillmentInstant } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.orders");
  return { title: t("title") };
}

/**
 * `/food/orders` — the seller's order inbox, PENDING first (Slice 17,
 * architecture F1). Mirrors `/food/listings`'s shape (signed-out notice,
 * redirect-to-onboarding for a session with no seller row, otherwise the
 * real list) rather than inventing a new one.
 */
export default async function SellerOrdersPage() {
  const t = await getTranslations("seller.orders");
  const ts = await getTranslations("orderStatus");
  const locale = await getLocale();
  const workspace = await loadSellerWorkspace();

  if (workspace.state === "signed-out") return <SignedOutNotice />;
  if (!workspace.seller) redirect("/food/setup");

  const { pending, other } = await sellerOrderSummaries(workspace.seller.id);

  function OrderRow({ order }: { order: SellerOrderSummary }) {
    const item = order.items[0];
    return (
      <li>
        <Link
          href={`/food/orders/${order.id}`}
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
        </Link>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-display font-semibold text-ink">{t("title")}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 font-semibold text-ink">{t("pendingHeading", { count: pending.length })}</h2>
        {pending.length === 0 ? (
          <p className="rounded-card border border-dashed border-hairline bg-sunken p-6 text-center text-label text-ink">
            {t("pendingEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 font-semibold text-ink">{t("historyHeading")}</h2>
        {other.length === 0 ? (
          <p className="text-label text-ink-muted">{t("historyEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {other.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
