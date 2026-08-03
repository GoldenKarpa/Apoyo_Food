import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AcceptOrderForm } from "@/components/seller/accept-order-form";
import { OrderCompleteButton } from "@/components/order-simple-action";
import { OrderReasonAction } from "@/components/order-reason-action";
import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import { StatusChip } from "@/components/ui/chip";
import { loadSellerWorkspace } from "@/lib/seller";
import { sellerOrderDetail } from "@/lib/order";
import { ORDER_STATUS_TONE } from "@/lib/order-status-labels";
import { markOrderNotificationsRead } from "@/lib/notifications";
import { formatCentsTtd } from "@/lib/money";
import { formatFulfillmentInstant } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.orders");
  return { title: t("detailTitle") };
}

/**
 * `/food/orders/[id]` — accept (with quote-price adjustment)/decline for a
 * PENDING order, complete/cancel for an ACCEPTED one (Slice 17, architecture
 * E5). Ownership is `sellerOrderDetail`'s own `{ id, sellerId }` scoping —
 * same shape as the listing edit page's, applied to orders.
 */
export default async function SellerOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await loadSellerWorkspace();

  if (workspace.state === "signed-out") return <SignedOutNotice />;
  if (!workspace.seller) redirect("/food/onboarding");

  const order = await sellerOrderDetail(id, workspace.seller.id);
  if (!order) notFound();

  if (workspace.session) await markOrderNotificationsRead(workspace.session.userId, id);

  const [t, ts, tf, locale] = await Promise.all([
    getTranslations("seller.orders"),
    getTranslations("orderStatus"),
    getTranslations("fulfillmentModes"),
    getLocale(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-display font-semibold text-ink">{order.orderNumber}</h1>
        <StatusChip tone={ORDER_STATUS_TONE[order.status]}>{ts(order.status)}</StatusChip>
      </div>

      <section className="flex flex-col gap-3 rounded-card border border-hairline bg-card p-6">
        <h2 className="text-h2 font-semibold text-ink">{t("itemsHeading")}</h2>
        <ul className="flex flex-col gap-2">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 text-body text-ink">
              <span>
                {item.quantity}× {item.titleSnapshot}
                {item.note && <span className="block text-caption text-ink-muted">{item.note}</span>}
              </span>
              {item.priceCentsSnapshot !== null && (
                <span className="shrink-0 text-terracotta">{formatCentsTtd(item.priceCentsSnapshot * item.quantity)}</span>
              )}
            </li>
          ))}
        </ul>
        {order.subtotalCents !== null && (
          <p className="text-h3 font-semibold text-terracotta">{formatCentsTtd(order.subtotalCents)}</p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-card border border-hairline bg-card p-6">
        <h2 className="text-h2 font-semibold text-ink">{t("fulfillmentHeading")}</h2>
        <p className="text-body text-ink">{tf(order.fulfillmentMode)}</p>
        <p className="text-body text-ink">{formatFulfillmentInstant(order.fulfillmentAt, locale)}</p>
        {order.fulfillmentAreaOrNote && <p className="text-body text-ink-muted">{order.fulfillmentAreaOrNote}</p>}
        {order.customerNote && (
          <p className="mt-2 text-label text-ink-muted">
            {t("customerNotePrefix")}: {order.customerNote}
          </p>
        )}
      </section>

      {order.status === "PENDING" && (
        <>
          <p className="rounded-card bg-gold-soft p-4 text-label text-ink">
            {t("respondByPrefix")}: {formatFulfillmentInstant(order.respondBy, locale)}
          </p>
          <section className="flex flex-col gap-4 rounded-card border border-hairline bg-card p-6">
            <h2 className="text-h2 font-semibold text-ink">{t("acceptHeading")}</h2>
            <AcceptOrderForm orderId={order.id} items={order.items} />
          </section>
          <OrderReasonAction
            spec={{ kind: "decline", orderId: order.id }}
            triggerLabel={t("declineTrigger")}
            reasonLabel={t("declineReasonLabel")}
            reasonPlaceholder={t("declineReasonPlaceholder")}
            confirmLabel={t("declineConfirm")}
            cancelLabel={t("declineDismiss")}
            errorLabel={t("declineError")}
          />
        </>
      )}

      {order.status === "ACCEPTED" && (
        <div className="flex flex-wrap gap-3">
          <OrderCompleteButton
            orderId={order.id}
            label={t("completeTrigger")}
            confirmMessage={t("completeConfirm")}
            errorLabel={t("completeError")}
          />
          <OrderReasonAction
            spec={{ kind: "cancel", orderId: order.id, actor: "seller" }}
            triggerLabel={t("cancelTrigger")}
            reasonLabel={t("cancelReasonLabel")}
            reasonPlaceholder={t("cancelReasonPlaceholder")}
            confirmLabel={t("cancelConfirm")}
            cancelLabel={t("cancelDismiss")}
            errorLabel={t("cancelError")}
          />
        </div>
      )}

      {order.status === "DECLINED" && order.declineReason && (
        <p className="rounded-card bg-sunken p-4 text-label text-ink">
          {t("declineReasonPrefix")}: {order.declineReason}
        </p>
      )}
      {(order.status === "CANCELLED_BY_CUSTOMER" || order.status === "CANCELLED_BY_SELLER") &&
        order.cancellationReason && (
          <p className="rounded-card bg-sunken p-4 text-label text-ink">
            {t("cancellationReasonPrefix")}: {order.cancellationReason}
          </p>
        )}
    </div>
  );
}
