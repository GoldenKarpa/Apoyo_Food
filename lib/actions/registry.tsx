"use client";

import { createContext, useContext, type ReactNode } from "react";

import { acceptOrder, cancelOrder, completeOrder, declineOrder } from "@/lib/actions/order";
import { reportMessage, sendOrderMessage, sendThreadMessage } from "@/lib/actions/order-message";
import {
  setChatNotificationDelivery,
  setMessageReadReceipts,
  setPostOrderMessaging,
} from "@/lib/actions/message-settings";
import { toggleListingActive } from "@/lib/actions/upsert-listing";
import { uploadMessageAttachment } from "@/lib/message-attachment";

/**
 * PD-S10 — the ONE seam that makes Food's seller demo interactive without a
 * database (`Apoyo-Portal/Provider_Demo_Plan.md` §2.3a).
 *
 * ## Why this exists, and why it is not Salon's mechanism
 *
 * Salon's demo patches `window.fetch` and answers `/api/salon/provider/*` from
 * in-memory state, because every Salon provider component mutates by calling
 * `fetch`. **Food has no network layer to intercept.** Every mutating component
 * on the seller surface imports a `"use server"` Server Action and calls it as
 * a plain async function; the one `fetch` in `<OrderMessageComposer>` is the
 * photo-attachment upload, which is a separate concern from the send.
 *
 * Apparel proved the alternative dead on evidence for PD-S9 and the same two
 * disqualifiers apply here unchanged (recorded in full on
 * `Apoyo-Apparel/lib/actions/registry.tsx`, and in the plan's §2.3a):
 *
 *   1. The `Next-Action` header carries an opaque BUILD-derived hash, not a
 *      path — the opposite of the stable, human-chosen string plan R1 assumes
 *      `verify-demo` can assert against.
 *   2. Fatal on its own: a Server Action's RESPONSE is an RSC flight stream
 *      React's runtime parses. There is no supported way to fabricate one, so
 *      even a perfect request match would have nothing to answer with.
 *
 * So the seam moved from the network layer (which Food does not have) to the
 * import layer (which it does). Same "one seam, confined to the demo"
 * philosophy as Salon; different join.
 *
 * ## ⚠ Why this is `FoodActions`, not Apparel's `SellerActions`
 *
 * Four of the seven components behind this seam — `<OrderReasonAction>`,
 * `<OrderCompleteButton>`, `<OrderMessageComposer>`, `<ReportMessageSheet>` —
 * render on the BUYER surface too, by design (`actor` picks which ownership
 * guard the action runs). Calling the record `SellerActions` would name it
 * after the only surface that ever overrides it and mislead the next reader of
 * `app/(client)/orders/[id]/page.tsx`. Nothing about the buyer surface changes:
 * with no provider mounted the context value IS the real actions, so those
 * pages behave exactly as they did before this file existed.
 *
 * ## ⚠ The type is the drift protection — do not weaken it
 *
 * `FoodActions` is a TOTAL record of `typeof <the real action>`. Two
 * consequences, both deliberate:
 *
 *   - A demo registry that forgets a key **does not compile**. Salon's
 *     equivalent failure is a silent 501 at runtime that only `verify-demo`
 *     catches; here it is a build error, which is the plan's R2 "good failure".
 *   - An action whose signature changes breaks the demo at build time too,
 *     rather than at the moment a visitor clicks the control.
 *
 * Never make these keys optional, never widen one to `any`, and never let a new
 * demo-rendered mutation call its action directly — the direct import is
 * exactly the hole this closes.
 *
 * ## ⚠ The default is the REAL actions
 *
 * With no provider mounted, `useFoodActions()` returns the genuine Server
 * Actions. The demo is the only thing that ever supplies an override, and it
 * supplies a COMPLETE one. A component that somehow rendered inside the demo
 * without the provider would hit the real database and fail its own ownership
 * guard — loudly, and never silently succeeding against real data.
 *
 * ⚠ Story actions are deliberately absent. The Stories section is
 * informational (plan §3, Food row) and renders inside an `inert` wrapper, so
 * `createStory`/`deleteStory`/the highlight actions can never fire from the
 * demo and keep their direct imports. Adding them here would imply an
 * interactivity the coverage contract does not grant.
 */
export interface FoodActions {
  // ── Orders (Slice 17, architecture E5) ────────────────────────────────────
  acceptOrder: typeof acceptOrder;
  declineOrder: typeof declineOrder;
  completeOrder: typeof completeOrder;
  cancelOrder: typeof cancelOrder;
  // ── Conversation (Slice 18 + PC-1) ────────────────────────────────────────
  sendOrderMessage: typeof sendOrderMessage;
  sendThreadMessage: typeof sendThreadMessage;
  reportMessage: typeof reportMessage;
  // ── Conversation settings (PC-1) ──────────────────────────────────────────
  setPostOrderMessaging: typeof setPostOrderMessaging;
  setMessageReadReceipts: typeof setMessageReadReceipts;
  setChatNotificationDelivery: typeof setChatNotificationDelivery;
  // ── Catalogue (Slice 14) ──────────────────────────────────────────────────
  toggleListingActive: typeof toggleListingActive;
  /**
   * ⚠ The one key here that is NOT a Server Action — it is a plain `fetch` to
   * the media-upload route. It belongs in this record anyway, and leaving it
   * out was a real hole found at PD-S10's review: it is a MUTATION on a
   * demo-rendered component, so a demo that could not intercept it performed a
   * genuine authenticated upload, wrote real files, and spent a real
   * rate-limit budget while promising the visitor that nothing is saved.
   *
   * The rule this record encodes is "every mutation the demo can reach goes
   * through the seam", not "every Server Action goes through the seam". A
   * future mutation that happens to be a fetch belongs here too.
   */
  uploadMessageAttachment: typeof uploadMessageAttachment;
}

export const REAL_FOOD_ACTIONS: FoodActions = {
  acceptOrder,
  declineOrder,
  completeOrder,
  cancelOrder,
  sendOrderMessage,
  sendThreadMessage,
  reportMessage,
  setPostOrderMessaging,
  setMessageReadReceipts,
  setChatNotificationDelivery,
  toggleListingActive,
  uploadMessageAttachment,
};

const FoodActionsContext = createContext<FoodActions>(REAL_FOOD_ACTIONS);

/**
 * The actions the surrounding surface wants this component to call. In the real
 * product that is always `REAL_FOOD_ACTIONS`; inside `/food/demo` it is the
 * sandbox's in-memory implementations.
 */
export function useFoodActions(): FoodActions {
  return useContext(FoodActionsContext);
}

/**
 * Supplied by the demo shell only. Deliberately takes a COMPLETE `FoodActions`
 * rather than an overrides map — see the type note above; a partial override
 * would let a forgotten action fall through to the real database, which is the
 * one failure mode this whole file exists to make impossible.
 */
export function FoodActionsProvider({
  actions,
  children,
}: {
  actions: FoodActions;
  children: ReactNode;
}) {
  return <FoodActionsContext.Provider value={actions}>{children}</FoodActionsContext.Provider>;
}
