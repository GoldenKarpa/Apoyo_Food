import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { ListingSellerRow } from "@/components/listing-seller-row";
import { OrderReasonAction } from "@/components/order-reason-action";
import { OrderThread } from "@/components/order-thread";
import { ThreadComposerSection } from "@/components/thread-composer-section";
import { OrderThreadPoller } from "@/components/order-thread-poller";
import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import { StatusChip } from "@/components/ui/chip";
import { clientOrderDetail } from "@/lib/order";
import { ORDER_STATUS_TONE } from "@/lib/order-status-labels";
import { markOrderNotificationsRead } from "@/lib/notifications";
import { resolveThreadAccess } from "@/lib/thread";
import { formatCentsTtd } from "@/lib/money";
import { formatFulfillmentInstant } from "@/lib/time";
import { getFoodSession } from "@/lib/session";
import type { Locale } from "@/i18n/request";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("client.orders");
  return { title: t("title") };
}

export const dynamic = "force-dynamic";

const CANCELLABLE = new Set(["PENDING", "ACCEPTED"]);

/**
 * `/orders/[id]` — the buyer's own order detail (Slice 17, architecture F1:
 * "order detail + thread"; the thread itself is Slice 18).
 *
 * ⚠ Ownership is enforced by `clientOrderDetail`'s own `{ id, clientId }`
 * scoping — a buyer looking at someone else's order id gets a 404, the same
 * shape `lib/listing.ts`'s `requireOwnListing` uses for the seller surface.
 */
export default async function ClientOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getFoodSession();
  if (!session) return <SignedOutNotice namespace="client.signedOut" loginHref="/login" />;

  const order = await clientOrderDetail(id, session.userId);
  if (!order) notFound();

  await markOrderNotificationsRead(session.userId, id);

  // PC-1 — see the seller page's note; the same gate, asked from the other side.
  const access = await resolveThreadAccess(order.seller.id, session.userId, order.seller.postOrderMessaging);

  const [t, ts, tf, locale] = await Promise.all([
    getTranslations("client.orderDetail"),
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

      <ListingSellerRow
        href={`/sellers/${order.seller.slug}`}
        name={order.seller.displayName}
        avatar={
          order.seller.profileImageThumb
            ? { src: order.seller.profileImageThumb, blurDataUrl: order.seller.profileImageBlur }
            : null
        }
      />

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
        {order.subtotalCents !== null ? (
          <p className="text-h3 font-semibold text-terracotta">{formatCentsTtd(order.subtotalCents)}</p>
        ) : (
          <p className="text-label text-ink-muted">{t("priceOnAcceptance")}</p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-card border border-hairline bg-card p-6">
        <h2 className="text-h2 font-semibold text-ink">{t("fulfillmentHeading")}</h2>
        <p className="text-body text-ink">{tf(order.fulfillmentMode)}</p>
        <p className="text-body text-ink">{formatFulfillmentInstant(order.fulfillmentAt, locale)}</p>
        {order.fulfillmentAreaOrNote && <p className="text-body text-ink-muted">{order.fulfillmentAreaOrNote}</p>}
        {order.customerNote && (
          <p className="mt-2 text-label text-ink-muted">
            {t("yourNote")}: {order.customerNote}
          </p>
        )}
      </section>

      {order.status === "PENDING" && (
        <p className="rounded-card bg-gold-soft p-4 text-label text-ink">
          {t("respondByNotice", { time: formatFulfillmentInstant(order.respondBy, locale) })}
        </p>
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
      {order.status === "EXPIRED" && (
        <div className="rounded-card bg-sunken p-4">
          <p className="text-label text-ink">{t("expiredNotice")}</p>
          <Link href="/browse" className="mt-2 inline-block text-label font-medium text-green">
            {t("browseSimilar")}
          </Link>
        </div>
      )}

      {CANCELLABLE.has(order.status) && (
        <OrderReasonAction
          spec={{ kind: "cancel", orderId: order.id, actor: "client" }}
          triggerLabel={t("cancelTrigger")}
          reasonLabel={t("cancelReasonLabel")}
          reasonPlaceholder={t("cancelReasonPlaceholder")}
          confirmLabel={t("cancelConfirm")}
          cancelLabel={t("cancelDismiss")}
          errorLabel={t("cancelError")}
        />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 font-semibold text-ink">{t("threadHeading")}</h2>
        <OrderThread
          messages={order.messages}
          viewerUserId={session.userId}
          viewerLocale={locale as Locale}
          surface="buyer"
          showReadReceipts={order.seller.messageReadReceipts}
        />
        <ThreadComposerSection access={access} target={{ kind: "order", orderId: order.id }} actor="client" />
      </section>
      <OrderThreadPoller />
    </div>
  );
}
