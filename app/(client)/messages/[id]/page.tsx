import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { OrderThread } from "@/components/order-thread";
import { OrderThreadPoller } from "@/components/order-thread-poller";
import { ThreadComposerSection } from "@/components/thread-composer-section";
import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import { markThreadNotificationsRead } from "@/lib/notifications";
import { markThreadRead, resolveThreadAccess, threadDetail } from "@/lib/thread";
import { getFoodSession } from "@/lib/session";
import type { Locale } from "@/i18n/request";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("client.messages");
  return { title: t("title") };
}

export const dynamic = "force-dynamic";

/**
 * `/messages/[id]` — the buyer's side of one conversation.
 *
 * ⚠ Ownership is the thread's own `clientId`, checked against the session
 * before anything renders — never the id in the URL alone, same rule as
 * `clientOrderDetail`'s `{ id, clientId }` scoping.
 */
export default async function ClientThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getFoodSession();
  if (!session) return <SignedOutNotice namespace="client.signedOut" loginHref="/login" />;

  const thread = await threadDetail(id);
  if (!thread || thread.clientId !== session.userId) notFound();

  const [t, locale] = await Promise.all([getTranslations("client.messages"), getLocale()]);

  await Promise.all([
    markThreadRead(thread.id, session.userId),
    markThreadNotificationsRead(session.userId, thread.id),
  ]);

  const access = await resolveThreadAccess(thread.sellerId, session.userId, thread.seller.postOrderMessaging);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-display font-semibold text-ink">{thread.seller.displayName}</h1>
        <Link href={`/sellers/${thread.seller.slug}`} className="text-caption text-green underline">
          {t("viewKitchen")}
        </Link>
      </div>

      <OrderThread
        messages={thread.messages}
        viewerUserId={session.userId}
        viewerLocale={locale as Locale}
        surface="buyer"
        // The seller's disclosure setting. `readAt` is written regardless; this
        // only decides whether the buyer is shown it.
        showReadReceipts={thread.seller.messageReadReceipts}
        showOrderContext
      />

      <ThreadComposerSection access={access} target={{ kind: "thread", threadId: thread.id }} actor="client" />
      <OrderThreadPoller />
    </div>
  );
}
