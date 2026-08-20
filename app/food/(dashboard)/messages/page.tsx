import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SignedOutNotice } from "@/components/seller/signed-out-notice";
import { ThreadList } from "@/components/thread-list";
import { loadSellerWorkspace } from "@/lib/seller";
import { sellerThreadSummaries } from "@/lib/thread";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.messages");
  return { title: t("title") };
}

export const dynamic = "force-dynamic";

/**
 * `/food/messages` — PC-1's Messages section.
 *
 * ⚠ Without this page the persistent thread has no home and the whole feature
 * is pointless: a message arriving four months after an order would land
 * buried in an old order's detail page, which is the exact failure the
 * 2026-08-19 ruling names. That is why it is a nav destination, not a tab
 * inside Orders.
 *
 * Mirrors `/food/orders`'s shape (signed-out notice, redirect-to-onboarding
 * for a session with no seller row, otherwise the real list) rather than
 * inventing a new one.
 */
export default async function SellerMessagesPage() {
  const t = await getTranslations("seller.messages");
  const workspace = await loadSellerWorkspace();

  if (workspace.state === "signed-out") return <SignedOutNotice />;
  if (!workspace.seller) redirect("/food/setup");

  const threads = await sellerThreadSummaries(workspace.seller.id, workspace.seller.userId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-display font-semibold text-ink">{t("title")}</h1>
        <p className="text-label text-ink-muted">{t("subtitle")}</p>
      </div>

      {!workspace.seller.postOrderMessaging && (
        // Shown to the seller only. A setting this quiet is easy to forget you
        // turned on, and "why has nobody written to me" is the support ticket
        // it produces. The link goes to the switch itself, not to a help page.
        <p className="rounded-card border border-hairline bg-gold-soft p-4 text-label text-ink">
          {t("optedOutNotice")}
        </p>
      )}

      <ThreadList
        threads={threads.map((thread) => ({
          id: thread.id,
          lastMessageAt: thread.lastMessageAt,
          unreadCount: thread.unreadCount,
          // The buyer has no local display name — the snapshotted email is the
          // only label this app holds, the same fallback the order emails use.
          counterpartLabel: thread.clientEmail,
          messages: thread.messages,
        }))}
        hrefBase="/food/messages"
        emptyMessage={t("empty")}
      />
    </div>
  );
}
