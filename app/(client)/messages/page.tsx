import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import { ThreadList } from "@/components/thread-list";
import { clientThreadSummaries } from "@/lib/thread";
import { getFoodSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("client.messages");
  return { title: t("title") };
}

export const dynamic = "force-dynamic";

/**
 * `/messages` — the buyer's conversations.
 *
 * ⚠ **Scope, stated rather than assumed.** The 2026-08-19 brief puts "buyer-side
 * inbox design beyond what item 1 requires" out of scope, and item 1 requires
 * exactly this much: a buyer who can start a thread must be able to find the
 * reply. So this is the same `<ThreadList>` the seller's Messages section
 * renders, with no filtering, search, archiving or unread management of its
 * own — and no sixth entry in the bottom tab bar, which Part F3 reserves for
 * five buyer destinations. It is reachable from the order list and from a
 * seller's profile, which are the two places a buyer is already thinking about
 * that seller.
 *
 * ⚠ No redirect for an anonymous visitor — `<SignedOutNotice>`'s standing rule,
 * same as `/orders`.
 */
export default async function ClientMessagesPage() {
  const session = await getFoodSession();
  if (!session) return <SignedOutNotice namespace="client.signedOut" loginHref="/login" />;

  const [t, threads] = await Promise.all([
    getTranslations("client.messages"),
    clientThreadSummaries(session.userId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-display font-semibold text-ink">{t("title")}</h1>

      <ThreadList
        threads={threads.map((thread) => ({
          id: thread.id,
          lastMessageAt: thread.lastMessageAt,
          unreadCount: thread.unreadCount,
          counterpartLabel: thread.seller.displayName,
          messages: thread.messages,
        }))}
        hrefBase="/messages"
        emptyMessage={t("empty")}
      />
    </div>
  );
}
