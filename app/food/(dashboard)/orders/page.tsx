import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import {
  SELLER_ORDER_ROW_CLASS,
  SellerOrderRow,
} from "@/components/seller/order-summary-row";
import { loadSellerWorkspace } from "@/lib/seller";
import { sellerOrderSummaries, type SellerOrderSummary } from "@/lib/order";

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
  const workspace = await loadSellerWorkspace();

  if (workspace.state === "signed-out") return <SignedOutNotice />;
  if (!workspace.seller) redirect("/food/setup");

  const { pending, other } = await sellerOrderSummaries(workspace.seller.id);

  // ⚠ The row itself is `<SellerOrderRow>` (PD-S10) — extracted so the demo
  // renders the real thing rather than a copy. Only the WRAPPER differs there:
  // a `<button>` that opens the order in place, because a navigation would
  // reset the sandbox. See that component's own note.
  function OrderRow({ order }: { order: SellerOrderSummary }) {
    return (
      <li>
        <Link href={`/food/orders/${order.id}`} className={SELLER_ORDER_ROW_CLASS}>
          <SellerOrderRow order={order} />
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
