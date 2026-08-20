"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";

import { FoodActionsProvider, type FoodActions } from "@/lib/actions/registry";
import { parseTtdToCents } from "@/lib/listing-form";
import { MAX_MESSAGE_LENGTH } from "@/lib/order-message-form";
import { resolveAcceptPricing } from "@/lib/order-form";
import { NOTIFICATION_DELIVERIES, type NotificationDelivery } from "@/lib/notification-prefs";
import { decideOrderTransition } from "@/lib/order-status";
import {
  decideThreadAccess,
  ENGAGED_ORDER_STATUSES,
  OPEN_ORDER_STATUSES,
  orderIsActive,
  type ThreadAccess,
} from "@/lib/thread-access";
import {
  DEMO_SELLER_USER_ID,
  initialListings,
  initialOrders,
  initialSeller,
  initialThreads,
  type DemoListing,
  type DemoOrder,
  type DemoSeller,
  type DemoThread,
} from "@/lib/demo/fixtures";
import type { Locale } from "@/i18n/request";

/**
 * PD-S10 — the sandbox that makes the Food seller demo interactive with no
 * database at all.
 *
 * Plan: `Apoyo-Portal/Provider_Demo_Plan.md` §2.3 / §2.3a.
 *
 * ## What this does
 *
 * The demo renders the REAL seller components — `<SellerOrderRow>`,
 * `<AcceptOrderForm>`, `<OrderReasonAction>`, `<OrderCompleteButton>`,
 * `<SellerListingRow>`, `<OrderThread>`, `<ThreadList>`,
 * `<ThreadComposerSection>`, `<MessageSettingsFields>` — rather than copies, so
 * it cannot drift from the product. Those components mutate through the
 * `useFoodActions()` seam (`lib/actions/registry.tsx`); this provider supplies a
 * COMPLETE alternative implementation of that interface, backed by React state.
 *
 * ## ⚠ Why not Salon's fetch-patching
 *
 * Because there is nothing to patch — Food's seller mutations are direct Server
 * Action calls, exactly like Apparel's. The full evidence, including why
 * matching the `Next-Action` header was rejected, is on
 * `lib/actions/registry.tsx` and in the plan's §2.3a.
 *
 * ## ⚠ The rules here are the PRODUCT's rules, imported, not re-implemented
 *
 * Two decisions in this file could easily have been faked, and faking either
 * would have made the demo teach something untrue:
 *
 *   - **Order transitions go through `decideOrderTransition`** — the real table
 *     in `lib/order-status.ts`. So `cancel` works from PENDING and ACCEPTED and
 *     nowhere else, a seller cannot `complete` a PENDING order, and both
 *     cancellation terminal states are reached the same way they are in
 *     production.
 *   - **Conversation access goes through `decideThreadAccess`/`orderIsActive`**
 *     — the real PC-1 gate in `lib/thread-access.ts` (extracted from
 *     `lib/thread.ts` for exactly this, since that module imports Prisma).
 *     `hasOpenOrder` and `hasEngagedOrder` are computed from the fixture orders
 *     with the real status sets, so flipping `postOrderMessaging` produces the
 *     real consequence rather than a scripted one.
 *
 * If either import ever gets replaced by a local approximation, the demo has
 * stopped demonstrating the product.
 *
 * ## ⚠ What replaces Salon's "unhandled call" alarm
 *
 * `FoodActions` is a TOTAL record, so a MISSING action is a build error rather
 * than a runtime surprise (plan R2, the good failure). What remains is the data
 * half — an action called with an id the fixtures do not contain.
 * `reportProblem()` surfaces exactly that, in the same shape Salon's does
 * (`data-demo-sandbox-problem`), so `verify-demo-browser.mjs` fails loudly
 * instead of a control quietly doing nothing. Plan R1's mitigation, intact
 * through a different mechanism.
 *
 * ## ⚠ Nothing here persists, and that is a guarantee
 *
 * There is no Prisma import in this file or anything it renders as demo data. A
 * refresh resets it.
 */

// ── Read-after-write state ──────────────────────────────────────────────────

/**
 * Demo state the sandbox can read back SYNCHRONOUSLY.
 *
 * ⚠ Ported from Salon's `useDemoState`, which exists because of a real bug a
 * browser test caught there: components follow a mutation with an immediate
 * read, and with the handler closing over `useState` values that read returns
 * the state as it was BEFORE the write. Nothing errors — the interaction just
 * silently does nothing.
 *
 * Food has the identical hazard in the accept flow: `<AcceptOrderForm>` calls
 * `acceptOrder` and then `router.refresh()`, and the demo's own detail view
 * re-reads the order in the same tick. Holding the truth in a ref the setter
 * updates synchronously, and using `useState` only to trigger a render, makes
 * the read-after-write correct.
 */
function useDemoState<T>(
  initial: () => T,
): [React.MutableRefObject<T>, (next: T | ((prev: T) => T)) => void, T] {
  const [value, setValue] = useState<T>(initial);
  const ref = useRef<T>(value);
  const set = useCallback((next: T | ((prev: T) => T)) => {
    const resolved = typeof next === "function" ? (next as (prev: T) => T)(ref.current) : next;
    // Synchronous, so a same-tick read sees it.
    ref.current = resolved;
    setValue(resolved);
  }, []);
  return [ref, set, value];
}

// ── The state the demo exposes to its shell ─────────────────────────────────

export interface DemoSandboxValue {
  seller: DemoSeller;
  orders: DemoOrder[];
  listings: DemoListing[];
  threads: DemoThread[];
  /** Ids of fixtures an action could not find; rendered as a visible alarm. */
  problems: string[];
  /**
   * A control that is real, but whose destination is outside the tour. The
   * shell renders this as an explanation rather than letting a link look broken.
   */
  notice: string | null;
  showNotice: (text: string) => void;
  dismissNotice: () => void;
  /**
   * The REAL PC-1 gate, evaluated over the fixtures for one buyer. Exposed so
   * the shell can hand the answer to `<ThreadComposerSection>` exactly as the
   * four real conversation pages hand it their own `resolveThreadAccess()`
   * result.
   */
  threadAccessFor: (clientId: string) => ThreadAccess;
}

const SandboxContext = createContext<DemoSandboxValue | null>(null);

export function useDemoSandbox(): DemoSandboxValue {
  const value = useContext(SandboxContext);
  if (!value) throw new Error("useDemoSandbox must be used inside <DemoSandbox>");
  return value;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

let sequence = 0;
function demoId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

// ── The sandbox ─────────────────────────────────────────────────────────────

export function DemoSandbox({
  locale,
  nowMs,
  children,
}: {
  locale: Locale;
  /**
   * ⚠ Resolved ONCE on the server (`app/food/demo/page.tsx`) and threaded down.
   * Every initializer below runs on the server render AND again on hydration;
   * reading the clock in them would seed two different fixture sets for one
   * page. See that file's note.
   */
  nowMs: number;
  children: ReactNode;
}) {
  const t = useTranslations("foodDemo");

  const [sellerRef, setSeller, seller] = useDemoState<DemoSeller>(() => initialSeller(locale));
  const [ordersRef, setOrders, orders] = useDemoState<DemoOrder[]>(() =>
    initialOrders(locale, new Date(nowMs)),
  );
  const [listingsRef, setListings, listings] = useDemoState<DemoListing[]>(() =>
    initialListings(locale),
  );
  const [threadsRef, setThreads, threads] = useDemoState<DemoThread[]>(() =>
    initialThreads(locale, new Date(nowMs)),
  );
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const reportProblem = useCallback((label: string) => {
    console.error(
      `[demo-sandbox] ${label} — an action was called with an id the fixtures do not contain. ` +
        `The real component's arguments have probably changed; update lib/demo/fixtures.ts.`,
    );
    setProblems((prev) => (prev.includes(label) ? prev : [...prev, label]));
  }, []);

  /**
   * ⚠ The real gate, over fixture rows. `hasOpenOrder` runs each candidate
   * through `orderIsActive` rather than trusting its status — PC-1's own
   * "open must not mean immortal" finding, which a demo that only checked
   * status would quietly contradict.
   */
  const threadAccessFor = useCallback(
    (clientId: string): ThreadAccess => {
      const mine = ordersRef.current.filter((o) => o.clientId === clientId);
      return decideThreadAccess({
        // ⚠ Evaluated at the SAME pinned epoch the fixtures were built from,
        // not at `new Date()`. The gate is a function of the fixture dates, so
        // pinning both to one instant is what makes the answer identical on the
        // server pass and on hydration. A live clock here would also mean a demo
        // left open long enough could silently change its own answer mid-tour.
        hasOpenOrder: mine.some(
          (o) => OPEN_ORDER_STATUSES.includes(o.status) && orderIsActive(o, new Date(nowMs)),
        ),
        hasEngagedOrder: mine.some((o) => ENGAGED_ORDER_STATUSES.includes(o.status)),
        sellerAllowsPostOrder: sellerRef.current.postOrderMessaging,
      });
    },
    [ordersRef, sellerRef, nowMs],
  );

  /**
   * A complete `FoodActions`. Every key is required by the type, so this object
   * cannot silently fall through to a real Server Action — and adding a new
   * action to the seam breaks this file at build time, which is exactly when it
   * should break.
   */
  const actions = useMemo<FoodActions>(() => {
    /** Applies one lifecycle transition, refusing exactly where the product does. */
    const transition = (
      orderId: string,
      action: "decline" | "complete" | "cancel",
      actor: "seller" | "client",
      reason: string | null,
    ) => {
      const order = ordersRef.current.find((o) => o.id === orderId);
      if (!order) {
        reportProblem(`${action}Order ${orderId}`);
        return { ok: false as const, reason: "unauthorized" };
      }
      const decision = decideOrderTransition(order, action, actor);
      if (!decision.ok) return { ok: false as const, reason: decision.reason };

      const trimmed = reason?.trim().slice(0, 500) || null;
      setOrders((prev) =>
        prev.map((o) =>
          o.id !== orderId
            ? o
            : {
                ...o,
                status: decision.status,
                declineReason: action === "decline" ? trimmed : o.declineReason,
                cancellationReason: action === "cancel" ? trimmed : o.cancellationReason,
              },
        ),
      );
      return { ok: true as const };
    };

    /** Shared by both send entry points — parse, gate, append. */
    const send = (clientId: string, threadId: string, orderId: string | null, formData: FormData) => {
      const text = String(formData.get("text") ?? "").trim();
      const attachmentPath = String(formData.get("attachmentPath") ?? "").trim();
      if (!text && !attachmentPath) return { ok: false as const, reason: "empty" as const };
      if (text.length > MAX_MESSAGE_LENGTH) return { ok: false as const, reason: "tooLong" as const };

      // ⚠ The gate runs on the SEND, not only on the render — exactly as
      // `sendOrderMessage`/`sendThreadMessage` do. A composer left on screen
      // while the opt-out is switched off must be refused, and this is what
      // proves the demo reproduces that rather than glossing it.
      if (!threadAccessFor(clientId).canWrite) return { ok: false as const, reason: "blocked" as const };

      const thread = threadsRef.current.find((th) => th.id === threadId);
      if (!thread) {
        reportProblem(`sendMessage ${threadId}`);
        return { ok: false as const, reason: "unauthorized" as const };
      }
      const order = orderId ? ordersRef.current.find((o) => o.id === orderId) ?? null : null;
      const now = new Date();
      setThreads((prev) =>
        prev.map((th) =>
          th.id !== threadId
            ? th
            : {
                ...th,
                lastMessageAt: now,
                messages: [
                  ...th.messages,
                  {
                    id: demoId("demo-msg"),
                    senderUserId: DEMO_SELLER_USER_ID,
                    originalText: text,
                    originalLocale: locale,
                    // ⚠ Untranslated, deliberately. The demo cannot call
                    // kap64-translate and must not pretend it did —
                    // `resolveTranslatedText` renders the original alone, which
                    // is precisely what a real message looks like when the
                    // translation service is unreachable (`lib/bilingual.ts`
                    // treats that as an ordinary outcome, not an error).
                    translations: {},
                    attachmentPath: attachmentPath || null,
                    attachmentKind: attachmentPath ? "PHOTO" : null,
                    readAt: null,
                    createdAt: now,
                    order: order ? { id: order.id, orderNumber: order.orderNumber } : null,
                  },
                ],
              },
        ),
      );
      return { ok: true as const };
    };

    return {
      // ── Orders ────────────────────────────────────────────────────────────
      acceptOrder: async (orderId, _prev, formData) => {
        const order = ordersRef.current.find((o) => o.id === orderId);
        if (!order) {
          reportProblem(`acceptOrder ${orderId}`);
          return { status: "error" as const, error: "noOrder" as const };
        }
        const decision = decideOrderTransition(order, "accept", "seller");
        if (!decision.ok) return { status: "error" as const, error: "orderInvalidTransition" as const };

        // ⚠ The REAL rule, imported — not reproduced. `resolveAcceptPricing`
        // is the same pure function `lib/actions/order.ts` calls, so a blank
        // field on a QUOTE item refuses with `priceRequired` here for exactly
        // the reason it does in production, and a change to the rule cannot
        // leave this demo teaching the old one. The first version of this
        // sandbox hand-copied the loop; Apparel's own PD-S9 review found that
        // pattern silently drifted from the product it claimed to reproduce.
        const pricing = resolveAcceptPricing(
          order.items,
          (id) => {
            const raw = formData.get(`price-${id}`);
            return raw === null ? null : String(raw);
          },
          parseTtdToCents,
        );
        if (!pricing.ok) return { status: "error" as const, error: pricing.error };

        setOrders((prev) =>
          prev.map((o) =>
            o.id !== orderId
              ? o
              : {
                  ...o,
                  status: decision.status,
                  items: pricing.resolved,
                  subtotalCents: pricing.subtotalCents,
                },
          ),
        );
        return { status: "ok" as const };
      },

      declineOrder: async (orderId, reason) => transition(orderId, "decline", "seller", reason),
      completeOrder: async (orderId) => transition(orderId, "complete", "seller", null),
      cancelOrder: async (orderId, actor, reason) =>
        // ⚠ `actor` is passed straight through rather than pinned to "seller":
        // it is what `decideOrderTransition` uses to pick between
        // CANCELLED_BY_SELLER and CANCELLED_BY_CUSTOMER, the one action whose
        // OUTCOME depends on who took it.
        transition(orderId, "cancel", actor === "client" ? "client" : "seller", reason),

      // ── Conversation ──────────────────────────────────────────────────────
      sendOrderMessage: async (orderId, _actor, formData) => {
        const order = ordersRef.current.find((o) => o.id === orderId);
        if (!order) {
          reportProblem(`sendOrderMessage ${orderId}`);
          return { ok: false as const, reason: "unauthorized" as const };
        }
        const thread = threadsRef.current.find((th) => th.clientId === order.clientId);
        if (!thread) {
          reportProblem(`sendOrderMessage thread for ${order.clientId}`);
          return { ok: false as const, reason: "unauthorized" as const };
        }
        return send(order.clientId, thread.id, order.id, formData);
      },

      sendThreadMessage: async (threadId, _actor, formData) => {
        const thread = threadsRef.current.find((th) => th.id === threadId);
        if (!thread) {
          reportProblem(`sendThreadMessage ${threadId}`);
          return { ok: false as const, reason: "unauthorized" as const };
        }
        return send(thread.clientId, thread.id, null, formData);
      },

      reportMessage: async () => {
        // Accepted and acknowledged, but nothing is filed: there is no admin
        // queue behind a fixture, and inventing a report id would be the demo
        // claiming an action it did not take. The component's own success state
        // is the honest response — the seller sees that the control works.
        return { ok: true as const };
      },

      // ── Conversation settings ─────────────────────────────────────────────
      setPostOrderMessaging: async (enabled) => {
        // ⚠ The single most consequential switch in this demo: it changes what
        // `threadAccessFor` returns for every buyer with no active order, which
        // is what makes Ayanna's composer appear and disappear for real.
        setSeller((prev) => ({ ...prev, postOrderMessaging: enabled }));
        return { ok: true as const };
      },
      setMessageReadReceipts: async (enabled) => {
        setSeller((prev) => ({ ...prev, messageReadReceipts: enabled }));
        return { ok: true as const };
      },
      setChatNotificationDelivery: async (value) => {
        if (!(NOTIFICATION_DELIVERIES as readonly string[]).includes(value)) {
          return { ok: false as const, reason: "invalid" as const };
        }
        setSeller((prev) => ({ ...prev, chatDelivery: value as NotificationDelivery }));
        return { ok: true as const };
      },

      // ── Catalogue ─────────────────────────────────────────────────────────
      toggleListingActive: async (listingId) => {
        const listing = listingsRef.current.find((l) => l.id === listingId);
        if (!listing) {
          reportProblem(`toggleListingActive ${listingId}`);
          return { status: "error" as const, error: "noListing" as const };
        }
        // An admin takedown outranks the seller's own pause switch — the real
        // action's refusal, reproduced rather than glossed.
        if (listing.takenDownAt) return { status: "error" as const, error: "takenDown" as const };
        setListings((prev) =>
          prev.map((l) => (l.id === listingId ? { ...l, active: !l.active } : l)),
        );
        return { status: "ok" as const };
      },
    };
    // ⚠ Empty of state: every read goes through a ref, so this object is stable
    // for the lifetime of the demo and can never capture a stale snapshot.
  }, [
    listingsRef,
    ordersRef,
    threadsRef,
    setListings,
    setOrders,
    setSeller,
    setThreads,
    reportProblem,
    threadAccessFor,
    locale,
  ]);

  const value = useMemo<DemoSandboxValue>(
    () => ({
      seller,
      orders,
      listings,
      threads,
      problems,
      notice,
      showNotice: setNotice,
      dismissNotice: () => setNotice(null),
      threadAccessFor,
    }),
    [seller, orders, listings, threads, problems, notice, threadAccessFor],
  );

  return (
    <SandboxContext.Provider value={value}>
      <FoodActionsProvider actions={actions}>
        {children}
        {problems.length > 0 && (
          <div
            role="status"
            className="fixed bottom-4 right-4 z-50 max-w-sm rounded-card border border-error bg-card p-3 text-caption text-ink shadow-soft"
          >
            <p data-demo-sandbox-problem className="font-semibold">
              {t("sandboxProblemTitle")}
            </p>
            <p className="mt-1 text-ink-muted">{t("sandboxProblemBody")}</p>
            <ul className="mt-1 list-disc pl-4 font-mono">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </FoodActionsProvider>
    </SandboxContext.Provider>
  );
}
