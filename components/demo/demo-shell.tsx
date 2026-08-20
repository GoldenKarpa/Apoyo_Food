"use client";

import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { MealCard } from "@/components/meal-card";
import { SellerCard } from "@/components/seller-card";
import { OrderThread } from "@/components/order-thread";
import { OrderReasonAction } from "@/components/order-reason-action";
import { OrderCompleteButton } from "@/components/order-simple-action";
import { ThreadComposerSection } from "@/components/thread-composer-section";
import { ThreadList } from "@/components/thread-list";
import { StatusChip } from "@/components/ui/chip";
import { AcceptOrderForm } from "@/components/seller/accept-order-form";
import { ActiveStoriesList } from "@/components/seller/active-stories-list";
import { HighlightManager } from "@/components/seller/highlight-manager";
import { MessageSettingsFields } from "@/components/seller/message-settings-fields";
import { SellerListingRow } from "@/components/seller/listing-summary-row";
import {
  SELLER_ORDER_ROW_CLASS,
  SellerOrderRow,
} from "@/components/seller/order-summary-row";
import { StoryPostForm } from "@/components/seller/story-post-form";
import { DemoSandbox, useDemoSandbox } from "@/components/demo/demo-sandbox";
import {
  DEMO_SELLER_USER_ID,
  initialHighlights,
  initialStories,
  photoCredits,
  type DemoOrder,
  type DemoThread,
} from "@/lib/demo/fixtures";
import { ORDER_STATUS_TONE } from "@/lib/order-status-labels";
import { formatCentsTtd } from "@/lib/money";
import { formatFulfillmentInstant, formatMediumDate } from "@/lib/time";
import { portalPageUrl } from "@/lib/links";
import type { Locale } from "@/i18n/request";

/**
 * PD-S10 — the Food seller demo's shell: navigation, chrome, and exactly the
 * sections the coverage contract names.
 *
 * Plan: `Apoyo-Portal/Provider_Demo_Plan.md` §3, Food row.
 *
 * ## ⚠ One route, sections switched client-side — not sub-routes
 *
 * `/food/demo/orders`, `/food/demo/messages` and so on would each be a server
 * navigation, and every one would re-run the access guard and re-seed the
 * fixtures. A visitor who accepted an order and then clicked "Menu" would come
 * back to find their acceptance undone. Keeping the whole demo on one route
 * means the sandbox stays mounted and what a visitor builds up survives for as
 * long as they explore — the entire point of it being interactive rather than a
 * slideshow. Salon and Apparel both reached this conclusion the same way.
 *
 * ## ⚠ These are the REAL seller components
 *
 * Every component imported above is the same file the real dashboard renders.
 * They are not copies and must never become copies — a copy silently stops
 * matching the product, which is exactly how the Demia demo rotted. If a real
 * component gains a required prop this file stops compiling; fix it here rather
 * than loosening the type.
 *
 * ## ⚠ What is NOT here, and why
 *
 * - **No `<OrderThreadPoller>`.** It exists to fire `router.refresh()` on a
 *   timer so a thread picks up the other party's messages. There is no other
 *   party and no database; mounting it would issue an RSC request forever to
 *   re-render a page whose data lives entirely in client state.
 * - **No availability section.** Food has no seller-level hours concept —
 *   availability lives on individual listings (plan §3: omit it entirely, do
 *   not render an empty one).
 * - **No peer view.** Food has no team or roster concept.
 * - **No onboarding.** D8: `/food/apply` already exists and needs no demo.
 * - **No dashboard stats.** Not in the coverage contract; a demo that invented
 *   revenue numbers would be the least honest screen here.
 */

type Section = "orders" | "listings" | "messages" | "stories";

const SECTION_IDS: readonly Section[] = ["orders", "listings", "messages", "stories"];

/**
 * Sections a visitor can look at but not operate.
 *
 * ⚠ Rendered inside an `inert` wrapper rather than simply "not wired up" —
 * Salon's finding, and it holds here. The controls are the REAL ones and would
 * otherwise fire actions the sandbox would have to answer, for a feature
 * outside the tour. `inert` removes them from interaction and from the
 * accessibility tree in one attribute, which is exactly the semantics wanted:
 * this is here to show you the feature exists, not to let you use it.
 */
const INFORMATIONAL: ReadonlySet<Section> = new Set<Section>(["stories"]);

export function DemoShell({ locale, nowMs }: { locale: Locale; nowMs: number }) {
  return (
    <DemoSandbox locale={locale} nowMs={nowMs}>
      <DemoShellBody locale={locale} nowMs={nowMs} />
    </DemoSandbox>
  );
}

/**
 * Neutralises real `<Link>`s inside a subtree.
 *
 * ⚠ Why this rather than a `demo` prop on the components themselves. Both
 * `<SellerListingRow>` and `<ThreadList>` navigate by design — that IS the
 * product. Threading demo-awareness through them is precisely the trade plan
 * §2.3 rejects ("would touch production code on every screen"), so the demo
 * intercepts from outside instead and the components stay unaware a demo
 * exists. A click on any anchor is cancelled and handed to `onNavigate`, which
 * either opens the destination in place (conversations) or explains that it is
 * outside the tour (the listing editor).
 *
 * ## ⚠ `onClickCapture` + `stopPropagation`, and BOTH are load-bearing
 *
 * Found live during PD-S10's browser pass, not reasoned about in advance: with
 * a plain `onClick` this guard runs during BUBBLING, which is after `next/link`
 * has already run its own handler and called `router.push()`. `preventDefault()`
 * at that point stops the browser's default navigation and nothing else — the
 * client-side navigation is already under way. The dev server log showed it
 * plainly: real `GET /food/messages/demo-thread-ayanna` and
 * `GET /food/listings/demo-listing-doubles` requests fired from inside the demo,
 * which in production would eject the visitor onto a dashboard page that
 * redirects a seller-less session to `/food/setup`.
 *
 * Capturing on the ancestor runs BEFORE the anchor's own handler, and
 * `stopPropagation()` there stops the event ever reaching it. `verify-demo-
 * browser.mjs` asserts no such request is ever made, so this cannot silently
 * regress.
 */
function DemoLinkGuard({
  onNavigate,
  children,
}: {
  onNavigate: (href: string) => void;
  children: ReactNode;
}) {
  function handle(event: MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as HTMLElement).closest("a[href]");
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    onNavigate(anchor.getAttribute("href") ?? "");
  }
  return <div onClickCapture={handle}>{children}</div>;
}

function DemoShellBody({ locale, nowMs }: { locale: Locale; nowMs: number }) {
  const t = useTranslations("foodDemo");
  const { seller, orders, listings, threads, notice, showNotice, dismissNotice, threadAccessFor } =
    useDemoSandbox();

  const [section, setSection] = useState<Section>("orders");
  /** Which order is open, or null for the inbox list. Orders only. */
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  /** Which conversation is open, or null for the list. Messages only. */
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  // Same server-resolved epoch as everything else — see `page.tsx`.
  const stories = useMemo(() => initialStories(locale, new Date(nowMs)), [locale, nowMs]);
  const highlights = useMemo(() => initialHighlights(locale), [locale]);

  const openOrder = orders.find((o) => o.id === openOrderId) ?? null;
  const openThread = threads.find((th) => th.id === openThreadId) ?? null;

  const pending = orders.filter((o) => o.status === "PENDING");
  const history = orders.filter((o) => o.status !== "PENDING");

  function goTo(next: Section) {
    setSection(next);
    // Leaving a section closes whatever it had open, so coming back lands on
    // the list rather than mid-conversation.
    if (next !== "orders") setOpenOrderId(null);
    if (next !== "messages") setOpenThreadId(null);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-sunken">
      {/* Persistent, unmissable, and it says the two things a visitor needs:
          this is not real, and nothing they do is kept. */}
      <div className="border-b border-hairline bg-ink px-4 py-2 text-center text-caption text-card">
        {t("bannerText")}{" "}
        <a href={portalPageUrl("/home")} className="underline underline-offset-2">
          {t("leaveDemo")}
        </a>
      </div>

      <nav className="border-b border-hairline bg-card">
        <div className="screen-pad flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
          {SECTION_IDS.map((id) => (
            <button
              key={id}
              type="button"
              data-demo-section={id}
              onClick={() => goTo(id)}
              aria-current={section === id ? "page" : undefined}
              className={`tap-target inline-flex items-center text-label underline-offset-2 hover:underline ${
                section === id ? "font-semibold text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {t(`${id}Label`)}
            </button>
          ))}
        </div>
      </nav>

      <main className="screen-pad flex flex-1 flex-col gap-6 py-8">
        <header className="flex flex-col gap-1">
          <h1 data-demo-heading={section} className="font-display text-display font-semibold text-ink">
            {t(`${section}Label`)}
          </h1>
          <p className="max-w-prose text-body text-ink-muted">{t(`${section}Blurb`)}</p>
          <p className="text-caption text-ink-muted">
            {t("viewingAs", { name: seller.displayName })}
          </p>
        </header>

        {notice && (
          <p
            role="status"
            data-demo-notice
            className="flex items-start justify-between gap-3 rounded-card bg-gold-soft px-4 py-3 text-label text-ink"
          >
            <span>{notice}</span>
            <button
              type="button"
              onClick={dismissNotice}
              aria-label={t("dismissNotice")}
              className="tap-target shrink-0 text-ink-muted hover:text-ink"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </p>
        )}

        {/* ── Orders ──────────────────────────────────────────────────────── */}
        {section === "orders" &&
          (openOrder ? (
            <DemoOrderDetail
              order={openOrder}
              locale={locale}
              onBack={() => setOpenOrderId(null)}
            />
          ) : (
            <div className="flex flex-col gap-8">
              <DemoOrderList
                heading={t("ordersPending", { count: pending.length })}
                orders={pending}
                empty={t("ordersPendingEmpty")}
                onOpen={setOpenOrderId}
              />
              <DemoOrderList
                heading={t("ordersHistory")}
                orders={history}
                empty={t("ordersHistoryEmpty")}
                onOpen={setOpenOrderId}
              />
            </div>
          ))}

        {/* ── Listings ────────────────────────────────────────────────────── */}
        {section === "listings" && (
          // The pause switches inside these rows are genuinely live (they
          // mutate through the actions seam); only the editor links are out of
          // tour, and the guard explains rather than letting them 404.
          <DemoLinkGuard onNavigate={() => showNotice(t("noticeListingEditor"))}>
            <ul className="flex flex-col gap-3">
              {listings.map((listing) => (
                <SellerListingRow key={listing.id} listing={listing} />
              ))}
            </ul>
          </DemoLinkGuard>
        )}

        {/* ── Messages ────────────────────────────────────────────────────── */}
        {section === "messages" &&
          (openThread ? (
            <DemoThreadView
              thread={openThread}
              locale={locale}
              showReadReceipts={seller.messageReadReceipts}
              access={threadAccessFor(openThread.clientId)}
              onBack={() => setOpenThreadId(null)}
            />
          ) : (
            <div className="flex flex-col gap-8">
              {!seller.postOrderMessaging && (
                // The real page shows this to a seller who has opted out —
                // "why has nobody written to me" is the support ticket it
                // exists to prevent. It appears here for the same reason, the
                // moment the visitor flips the switch below.
                <p
                  data-demo-opted-out-notice
                  className="rounded-card border border-hairline bg-gold-soft p-4 text-label text-ink"
                >
                  {t("optedOutNotice")}
                </p>
              )}

              <DemoLinkGuard
                onNavigate={(href) => setOpenThreadId(href.split("/").pop() ?? null)}
              >
                <ThreadList
                  threads={threads.map((thread) => ({
                    id: thread.id,
                    lastMessageAt: thread.lastMessageAt,
                    // Counterpart-authored and unread — the same definition
                    // `withUnreadCounts` uses against the database.
                    unreadCount: thread.messages.filter(
                      (m) => m.senderUserId !== DEMO_SELLER_USER_ID && !m.readAt,
                    ).length,
                    counterpartLabel: thread.clientLabel,
                    messages: [...thread.messages].reverse(),
                  }))}
                  hrefBase="/food/messages"
                  emptyMessage={t("messagesEmpty")}
                />
              </DemoLinkGuard>

              <section className="flex flex-col gap-4 rounded-card border border-hairline bg-card p-6">
                <div className="flex flex-col gap-1">
                  <h2 className="font-display text-h2 font-semibold text-ink">
                    {t("settingsTitle")}
                  </h2>
                  <p className="max-w-prose text-label text-ink-muted">{t("settingsBlurb")}</p>
                </div>
                {/* The REAL settings component on the REAL actions seam. Every
                    switch here changes what the sections above and the phone
                    frame below actually render — the opt-out closes a
                    conversation, and read receipts stop the buyer seeing
                    "Read". Neither is scripted. */}
                <MessageSettingsFields
                  postOrderMessaging={seller.postOrderMessaging}
                  messageReadReceipts={seller.messageReadReceipts}
                  chatDelivery={seller.chatDelivery}
                />
              </section>
            </div>
          ))}

        {/* ── Stories (informational) ─────────────────────────────────────── */}
        {INFORMATIONAL.has(section) && (
          <div className="flex flex-col gap-3">
            <p
              data-demo-preview-only
              className="rounded-control border border-hairline bg-card px-3 py-2 text-label text-ink-muted"
            >
              {t("previewOnly")}
            </p>
            {/* ⚠ `inert` is doing real work here, not decoration — see
                INFORMATIONAL above. The caption says plainly why nothing
                responds, so a visitor reads it as "not part of the tour"
                rather than "broken". */}
            <div inert className="pointer-events-none flex flex-col gap-6 opacity-90 select-none">
              <StoryPostForm listings={listings.map((l) => ({ id: l.id, title: l.title }))} />
              <ActiveStoriesList
                stories={stories}
                highlights={highlights.map((h) => ({ id: h.id, title: h.title }))}
              />
              <HighlightManager highlights={highlights} />
            </div>
          </div>
        )}

        <ClientPerspective locale={locale} />

        {/* Account is deliberately not a section (plan §3: "display-name-mode
            callout only", the same reduced treatment as every other vertical
            in this program). The one account control a prospective seller
            actually weighs before applying is how much of their name buyers
            see. */}
        <aside className="rounded-card border border-hairline bg-card p-4 text-body text-ink-muted">
          <p data-demo-display-name className="font-medium text-ink">
            {t("displayNameTitle")}
          </p>
          <p className="mt-1 max-w-prose">{t("displayNameBody")}</p>
        </aside>

        {/* ⚠ A licence obligation, not a footer nicety — every demo photo is CC
            BY or CC BY-SA and both require attribution. See
            `scripts/build-demo-assets.mjs`. */}
        <p data-demo-photo-credits className="text-caption text-ink-muted">
          {t("photoCreditsPrefix")}: {photoCredits()}
        </p>
      </main>
    </div>
  );
}

// ── Orders ──────────────────────────────────────────────────────────────────

/**
 * The inbox list. Rows are the REAL `<SellerOrderRow>`; only the wrapper
 * differs from the live page — a `<button>` rather than a `<Link>`, because
 * opening an order here must not be a navigation. See that component's note.
 */
function DemoOrderList({
  heading,
  orders,
  empty,
  onOpen,
}: {
  heading: string;
  orders: DemoOrder[];
  empty: string;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h2 font-semibold text-ink">{heading}</h2>
      {orders.length === 0 ? (
        <p className="rounded-card border border-dashed border-hairline bg-card p-6 text-center text-label text-ink">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id}>
              <button
                type="button"
                data-demo-order={order.id}
                onClick={() => onOpen(order.id)}
                className={SELLER_ORDER_ROW_CLASS}
              >
                <SellerOrderRow order={order} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One order, composed exactly as `/food/orders/[id]` composes it: the items and
 * fulfilment blocks, then whichever lifecycle controls the CURRENT status makes
 * legal, then the conversation.
 *
 * ⚠ Which controls render is a function of `order.status` alone, mirroring the
 * real page — so once a visitor accepts, accept/decline are gone and
 * complete/cancel have appeared, because `decideOrderTransition` says so. A
 * demo that kept every button on screen would teach a state machine the product
 * does not have.
 */
function DemoOrderDetail({
  order,
  locale,
  onBack,
}: {
  order: DemoOrder;
  locale: Locale;
  onBack: () => void;
}) {
  const t = useTranslations("seller.orders");
  const ts = useTranslations("orderStatus");
  const tf = useTranslations("fulfillmentModes");
  const td = useTranslations("foodDemo");
  const { threads, threadAccessFor, seller } = useDemoSandbox();
  const thread = threads.find((th) => th.clientId === order.clientId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        data-demo-order-back
        className="tap-target -ml-2 inline-flex w-fit items-center gap-1 rounded-control px-2 text-label text-ink-muted transition-colors duration-200 ease-soft hover:text-ink"
      >
        <ChevronLeft aria-hidden className="h-4 w-4" />
        {td("back")}
      </button>

      {/* ⚠ The status hook lives on this wrapper, not on `<StatusChip>` —
          that component takes `tone`/`children`/`className` and forwards
          nothing else, and widening a shared UI primitive so a demo test can
          hang an attribute off it would be the tail wagging the dog. */}
      <div data-demo-order-status={order.status} className="flex items-center justify-between gap-3">
        <h2 className="font-display text-display font-semibold text-ink">{order.orderNumber}</h2>
        <StatusChip tone={ORDER_STATUS_TONE[order.status]}>{ts(order.status)}</StatusChip>
      </div>

      <section className="flex flex-col gap-3 rounded-card border border-hairline bg-card p-6">
        <h3 className="text-h2 font-semibold text-ink">{t("itemsHeading")}</h3>
        <ul className="flex flex-col gap-2">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 text-body text-ink">
              <span>
                {item.quantity}× {item.titleSnapshot}
                {item.note && <span className="block text-caption text-ink-muted">{item.note}</span>}
              </span>
              {item.priceCentsSnapshot !== null && (
                <span className="shrink-0 text-terracotta">
                  {formatCentsTtd(item.priceCentsSnapshot * item.quantity)}
                </span>
              )}
            </li>
          ))}
        </ul>
        {order.subtotalCents !== null && (
          <p data-demo-order-subtotal className="text-h3 font-semibold text-terracotta">
            {formatCentsTtd(order.subtotalCents)}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-card border border-hairline bg-card p-6">
        <h3 className="text-h2 font-semibold text-ink">{t("fulfillmentHeading")}</h3>
        <p className="text-body text-ink">{tf(order.fulfillmentMode)}</p>
        <p className="text-body text-ink">{formatFulfillmentInstant(order.fulfillmentAt, locale)}</p>
        {order.fulfillmentAreaOrNote && (
          <p className="text-body text-ink-muted">{order.fulfillmentAreaOrNote}</p>
        )}
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
            <h3 className="text-h2 font-semibold text-ink">{t("acceptHeading")}</h3>
            {/* The real form. On the quote order its price field is REQUIRED,
                because that item has no snapshot — the sandbox reproduces
                `acceptOrder`'s own `priceRequired` refusal rather than
                accepting an empty one. */}
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
        <p className="rounded-card bg-card p-4 text-label text-ink">
          {t("declineReasonPrefix")}: {order.declineReason}
        </p>
      )}
      {(order.status === "CANCELLED_BY_CUSTOMER" || order.status === "CANCELLED_BY_SELLER") &&
        order.cancellationReason && (
          <p className="rounded-card bg-card p-4 text-label text-ink">
            {t("cancellationReasonPrefix")}: {order.cancellationReason}
          </p>
        )}

      {thread && (
        <section className="flex flex-col gap-3">
          <h3 className="text-h2 font-semibold text-ink">{t("threadHeading")}</h3>
          <OrderThread
            messages={thread.messages}
            viewerUserId={DEMO_SELLER_USER_ID}
            viewerLocale={locale}
            surface="seller"
            showReadReceipts={seller.messageReadReceipts}
          />
          <ThreadComposerSection
            access={threadAccessFor(order.clientId)}
            target={{ kind: "order", orderId: order.id }}
            actor="seller"
          />
        </section>
      )}
    </div>
  );
}

// ── Conversations ───────────────────────────────────────────────────────────

/**
 * One conversation, composed as `/food/messages/[id]` composes it —
 * transcript with per-message order context, then the composer or the reason
 * there isn't one.
 *
 * ⚠ `access` is the REAL `decideThreadAccess` answer over the fixtures, so the
 * composer's presence is a live consequence of the seller's own opt-out and of
 * whether this buyer has an active order. That is the assertion the plan
 * singles out: a demo whose composer is unconditionally present would
 * misrepresent the feature it exists to show.
 */
function DemoThreadView({
  thread,
  locale,
  showReadReceipts,
  access,
  onBack,
}: {
  thread: DemoThread;
  locale: Locale;
  showReadReceipts: boolean;
  access: ReturnType<ReturnType<typeof useDemoSandbox>["threadAccessFor"]>;
  onBack: () => void;
}) {
  const t = useTranslations("seller.messages");
  const td = useTranslations("foodDemo");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={onBack}
          data-demo-thread-back
          className="tap-target -ml-2 inline-flex w-fit items-center gap-1 rounded-control px-2 text-label text-ink-muted transition-colors duration-200 ease-soft hover:text-ink"
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
          {td("back")}
        </button>
        <h2 className="font-display text-display font-semibold text-ink">{thread.clientLabel}</h2>
        <p className="text-caption text-ink-muted">
          {t("since", { date: formatMediumDate(thread.createdAt, locale) })}
        </p>
      </div>

      <OrderThread
        messages={thread.messages}
        viewerUserId={DEMO_SELLER_USER_ID}
        viewerLocale={locale}
        surface="seller"
        showReadReceipts={showReadReceipts}
        // A thread spans orders, so each message says which one it was about.
        showOrderContext
      />

      <div data-demo-composer-slot={access.canWrite ? "composer" : (access.reason ?? "none")}>
        <ThreadComposerSection
          access={access}
          target={{ kind: "thread", threadId: thread.id }}
          actor="seller"
        />
      </div>
    </div>
  );
}

// ── The buyer's side (plan D6, §2.4) ────────────────────────────────────────

/**
 * A phone frame beside the seller's view, rendering the REAL buyer components
 * against the SAME fixtures. Never a screenshot: an image of "what buyers see"
 * misrepresents the product silently the moment that screen changes, which is
 * exactly how the Demia demo rotted. This cannot drift, and if `<MealCard>`,
 * `<SellerCard>` or `<OrderThread>` gains a required field the demo stops
 * compiling.
 *
 * ⚠ Three views, and the third is the point. The seller card and meal card show
 * how a kitchen and a dish are presented; the transcript below them shows **the
 * same conversation from the buyer's side** — the seller's own messages on the
 * left instead of the right, and the "Read" line governed by the seller's own
 * `messageReadReceipts` switch. Turn that switch off in Messages and it
 * disappears here, live, which is the only way to show what a
 * disclosure-only setting actually does.
 *
 * ⚠ `inert` throughout. These are the real components and their links go to
 * `/meals/...` and `/sellers/...` on the BUYER host — a navigation that would
 * eject a visitor from the demo onto a listing that does not exist.
 */
function ClientPerspective({ locale }: { locale: Locale }) {
  const t = useTranslations("foodDemo");
  const { seller, listings, threads } = useDemoSandbox();
  const featured = listings.find((l) => l.active) ?? listings[0] ?? null;
  const thread = threads[0] ?? null;

  if (!featured) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 data-demo-client-view className="font-display text-h2 font-semibold text-ink">
          {t("clientViewTitle")}
        </h2>
        <p className="max-w-prose text-body text-ink-muted">{t("clientViewBlurb")}</p>
      </div>

      <div className="mx-auto w-full max-w-[22rem] rounded-[2rem] border-8 border-ink/80 bg-card p-3 shadow-soft">
        <div inert className="pointer-events-none flex flex-col gap-4 select-none">
          <SellerCard
            href={`/sellers/${seller.slug}`}
            name={seller.displayName}
            areas={seller.areas}
            specialties={seller.specialties}
            cover={seller.cover}
            avatar={seller.avatar}
            followerLabel={t("followerLabel")}
            hasFreshToday
            freshTodayLabel={t("freshTodayLabel")}
          />

          <MealCard
            href={`/meals/${featured.slug}`}
            title={featured.title}
            priceCents={featured.priceCents}
            priceMode={featured.priceMode}
            startingAtLabel={t("startingAt")}
            quoteLabel={t("quotePrice")}
            photo={featured.photos[0] ? { src: featured.photos[0].pathThumb, blurDataUrl: featured.photos[0].blurDataUrl } : null}
            photoAlt={featured.photoAlt}
            availability={{ tone: "recurring", label: featured.availabilityLabel }}
            seller={{ name: seller.displayName, avatar: seller.avatar }}
            sizes="320px"
          />

          {thread && (
            <div className="flex flex-col gap-2 border-t border-hairline pt-3">
              <p className="text-caption uppercase tracking-wide text-ink-muted">
                {t("clientViewThread")}
              </p>
              {/* Same transcript, same fixtures — only the viewer changes, and
                  `showReadReceipts` is the seller's own live setting. */}
              <OrderThread
                messages={thread.messages}
                viewerUserId={thread.clientId}
                viewerLocale={locale}
                surface="buyer"
                showReadReceipts={seller.messageReadReceipts}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
