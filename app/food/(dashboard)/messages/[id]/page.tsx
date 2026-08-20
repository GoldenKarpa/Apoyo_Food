import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { OrderThread } from "@/components/order-thread";
import { OrderThreadPoller } from "@/components/order-thread-poller";
import { ThreadComposerSection } from "@/components/thread-composer-section";
import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import { loadSellerWorkspace } from "@/lib/seller";
import { markThreadNotificationsRead } from "@/lib/notifications";
import { markThreadRead, resolveThreadAccess, threadDetail } from "@/lib/thread";
import { formatMediumDate } from "@/lib/time";
import type { Locale } from "@/i18n/request";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.messages");
  return { title: t("detailTitle") };
}

export const dynamic = "force-dynamic";

/**
 * `/food/messages/[id]` — one conversation, spanning every order this pair has
 * ever transacted.
 *
 * ⚠ Ownership is the thread's own `sellerId`, checked against the session's
 * seller row before anything is rendered — never the id in the URL alone. Same
 * rule as `sellerOrderDetail`'s `{ id, sellerId }` scoping, which is why the
 * lookup below re-checks `thread.sellerId` rather than trusting `threadDetail`.
 */
export default async function SellerThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await loadSellerWorkspace();

  if (workspace.state === "signed-out") return <SignedOutNotice />;
  if (!workspace.seller) redirect("/food/setup");

  const thread = await threadDetail(id);
  if (!thread || thread.sellerId !== workspace.seller.id) notFound();

  const [t, locale] = await Promise.all([getTranslations("seller.messages"), getLocale()]);

  // Both marks, and they are different things: `markThreadRead` stamps the
  // buyer's MESSAGES (what drives this seller's unread badge, and what the
  // buyer sees as "Read" when receipts are on), `markThreadNotificationsRead`
  // clears the NOTIFICATION rows about them.
  await Promise.all([
    markThreadRead(thread.id, workspace.seller.userId),
    markThreadNotificationsRead(workspace.seller.userId, thread.id),
  ]);

  const access = await resolveThreadAccess(
    thread.sellerId,
    thread.clientId,
    workspace.seller.postOrderMessaging,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-display font-semibold text-ink">
          {thread.clientEmail ?? t("unknownCustomer")}
        </h1>
        <p className="text-caption text-ink-muted">
          {t("since", { date: formatMediumDate(thread.createdAt, locale) })}
        </p>
      </div>

      <OrderThread
        messages={thread.messages}
        viewerUserId={workspace.seller.userId}
        viewerLocale={locale as Locale}
        surface="seller"
        // A thread spans orders, so each message says which one it was about;
        // on a single order's page that label would be noise on every line.
        showOrderContext
      />

      <ThreadComposerSection access={access} target={{ kind: "thread", threadId: thread.id }} actor="seller" />
      <OrderThreadPoller />
    </div>
  );
}
