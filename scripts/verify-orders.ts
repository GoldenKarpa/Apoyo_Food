/**
 * Slice 17 domain-level verification: the parts that don't need a real
 * session — `decideOrderTransition` (pure), `validateRequestedFulfillment`
 * (pure), `checkRateLimit` (pure), the `FoodPlatformSetting` launch gate, and
 * the two sweep jobs, all against a real database. The full place -> accept
 * -> complete and place -> expire paths through the actual UI are proven by
 * `scripts/verify-order-lifecycle.mjs` instead, the same domain/e2e split
 * every prior slice's own verification has used (`requireOwnOrderAsSeller`/
 * `requireOwnOrderAsClient` read `next/headers`, which resolves to signed-out
 * outside a request scope — proven directly rather than assumed, same as
 * Slice 16's own note about `requireAdmin()`).
 *
 *   npx tsx scripts/verify-orders.ts
 */
import { PrismaClient } from "@prisma/client";

import { decideOrderTransition } from "../lib/order-status";
import { validateRequestedFulfillment, localInstant, localDay, addDays } from "../lib/availability";
import { checkRateLimit } from "../lib/rate-limit";
import { getOrderingEnabled, setOrderingEnabled } from "../lib/platform-settings";
import { createOrderWithRetry } from "../lib/order";
import { sweepExpiredOrders, sweepOrderCompletionNudges } from "../lib/sweep";
import { notifyUser, unreadOrderNotificationCount, markOrderNotificationsRead } from "../lib/notifications";

const prisma = new PrismaClient();

let pass = 0;
let fail = 0;
function assert(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}
function section(title: string) {
  console.log(`\n${title}`);
}

const SLUG = "_verify-s17-order-domain";
const SELLER_USER_ID = "_verify-s17-order-domain-seller";
const CLIENT_USER_ID = "_verify-s17-order-domain-client";

async function cleanup() {
  await prisma.foodNotification.deleteMany({ where: { userId: { in: [SELLER_USER_ID, CLIENT_USER_ID] } } });
  await prisma.foodOrder.deleteMany({ where: { seller: { userId: SELLER_USER_ID } } });
  await prisma.foodListing.deleteMany({ where: { seller: { userId: SELLER_USER_ID } } });
  await prisma.foodSeller.deleteMany({ where: { userId: SELLER_USER_ID } });
}

async function main() {
  await cleanup();

  // ==========================================================================
  section("decideOrderTransition — the status machine, pure, every (action, status, actor)");
  // ==========================================================================
  const accept = decideOrderTransition({ status: "PENDING" }, "accept", "seller");
  assert("accept: PENDING + seller -> ACCEPTED", accept.ok && accept.status === "ACCEPTED", accept);

  const acceptByClient = decideOrderTransition({ status: "PENDING" }, "accept", "client");
  assert("accept: unreachable by the CLIENT actor", !acceptByClient.ok && acceptByClient.reason === "invalidActor", acceptByClient);

  const acceptFromAccepted = decideOrderTransition({ status: "ACCEPTED" }, "accept", "seller");
  assert("accept: unreachable from ACCEPTED (no re-accepting)", !acceptFromAccepted.ok && acceptFromAccepted.reason === "invalidTransition", acceptFromAccepted);

  const decline = decideOrderTransition({ status: "PENDING" }, "decline", "seller");
  assert("decline: PENDING + seller -> DECLINED", decline.ok && decline.status === "DECLINED", decline);

  const declineByClient = decideOrderTransition({ status: "PENDING" }, "decline", "client");
  assert("decline: unreachable by the CLIENT actor", !declineByClient.ok && declineByClient.reason === "invalidActor", declineByClient);

  const complete = decideOrderTransition({ status: "ACCEPTED" }, "complete", "seller");
  assert("complete: ACCEPTED + seller -> COMPLETED", complete.ok && complete.status === "COMPLETED", complete);

  const completeFromPending = decideOrderTransition({ status: "PENDING" }, "complete", "seller");
  assert("complete: unreachable from PENDING (cannot skip acceptance)", !completeFromPending.ok && completeFromPending.reason === "invalidTransition", completeFromPending);

  const cancelBySellerFromPending = decideOrderTransition({ status: "PENDING" }, "cancel", "seller");
  assert(
    "cancel: PENDING + seller -> CANCELLED_BY_SELLER",
    cancelBySellerFromPending.ok && cancelBySellerFromPending.status === "CANCELLED_BY_SELLER",
    cancelBySellerFromPending,
  );
  const cancelByClientFromPending = decideOrderTransition({ status: "PENDING" }, "cancel", "client");
  assert(
    "cancel: PENDING + client -> CANCELLED_BY_CUSTOMER (the actor decides the terminal value, not just whether it's allowed)",
    cancelByClientFromPending.ok && cancelByClientFromPending.status === "CANCELLED_BY_CUSTOMER",
    cancelByClientFromPending,
  );
  const cancelFromAccepted = decideOrderTransition({ status: "ACCEPTED" }, "cancel", "client");
  assert("cancel: also reachable from ACCEPTED (before fulfilment, Part E5)", cancelFromAccepted.ok && cancelFromAccepted.status === "CANCELLED_BY_CUSTOMER", cancelFromAccepted);
  const cancelFromCompleted = decideOrderTransition({ status: "COMPLETED" }, "cancel", "seller");
  assert("cancel: unreachable from COMPLETED", !cancelFromCompleted.ok && cancelFromCompleted.reason === "invalidTransition", cancelFromCompleted);
  const cancelBySystem = decideOrderTransition({ status: "PENDING" }, "cancel", "system");
  assert("cancel: unreachable by the SYSTEM actor (that's `expire`'s job, not cancel's)", !cancelBySystem.ok && cancelBySystem.reason === "invalidActor", cancelBySystem);

  const expire = decideOrderTransition({ status: "PENDING" }, "expire", "system");
  assert("expire: PENDING + system -> EXPIRED", expire.ok && expire.status === "EXPIRED", expire);
  const expireByUser = decideOrderTransition({ status: "PENDING" }, "expire", "seller");
  assert("expire: unreachable by a USER actor — sweep-only", !expireByUser.ok && expireByUser.reason === "invalidActor", expireByUser);
  const expireFromAccepted = decideOrderTransition({ status: "ACCEPTED" }, "expire", "system");
  assert("expire: unreachable from ACCEPTED", !expireFromAccepted.ok && expireFromAccepted.reason === "invalidTransition", expireFromAccepted);

  // ==========================================================================
  section("validateRequestedFulfillment — pure, against constructed windows");
  // ==========================================================================
  const now = new Date();
  const today = localDay(now);

  const pastResult = validateRequestedFulfillment([], new Date(now.getTime() - 60_000), now);
  assert("a past instant is rejected regardless of windows", !pastResult.ok && pastResult.reason === "past", pastResult);

  const noWindowsResult = validateRequestedFulfillment([], localInstant(today.iso, "23:59"), now);
  assert("a listing with NO windows imposes no computed constraint (ok:true)", noWindowsResult.ok, noWindowsResult);

  // A RECURRING_WEEKLY window covering ONLY today's weekday.
  const todayOnlyWindow = {
    type: "RECURRING_WEEKLY" as const,
    daysOfWeek: 1 << today.weekday,
    startsOn: null,
    endsOn: null,
    leadTimeDays: null,
  };
  // +3 days always lands on a DIFFERENT weekday than today's (3 is never a
  // multiple of 7), which `todayOnlyWindow` below does not cover.
  const otherDay = addDays(today, 3);
  const requestedOtherDay = localInstant(otherDay.iso, "12:00");
  const outOfWindowResult = validateRequestedFulfillment([todayOnlyWindow], requestedOtherDay, now);
  assert("a day the listing's only window does NOT cover is rejected (outOfWindow)", !outOfWindowResult.ok && outOfWindowResult.reason === "outOfWindow", outOfWindowResult);

  const inWindowResult = validateRequestedFulfillment([todayOnlyWindow], localInstant(today.iso, "23:59"), now);
  assert("a day the window DOES cover, later today, is accepted", inWindowResult.ok, inWindowResult);

  // A PREORDER window (permanently "on offer" per windowCoversDay) with a lead time.
  const preorderWindow = { type: "PREORDER" as const, daysOfWeek: null, startsOn: null, endsOn: null, leadTimeDays: 3 };
  const tooSoon = validateRequestedFulfillment([preorderWindow], localInstant(today.iso, "23:59"), now);
  assert("PREORDER, requested for TODAY, fails the 3-day lead time", !tooSoon.ok && tooSoon.reason === "leadTime" && tooSoon.minLeadDays === 3, tooSoon);

  const farEnough = addDays(today, 4);
  const leadOk = validateRequestedFulfillment([preorderWindow], localInstant(farEnough.iso, "12:00"), now);
  assert("PREORDER, requested 4 calendar days out, clears the 3-day lead time", leadOk.ok, leadOk);

  // Two windows on the same listing, one with a lead time and one without —
  // Slice 2's own named case: a lead time on ANY window type must not block a
  // request the OTHER window already covers with no lead time of its own.
  const mixed = validateRequestedFulfillment([todayOnlyWindow, preorderWindow], localInstant(today.iso, "23:59"), now);
  assert(
    "a lead-timed PREORDER window does not block a same-day request the recurring window ALSO covers",
    mixed.ok,
    mixed,
  );

  // ==========================================================================
  section("checkRateLimit — order-creation rules, pure");
  // ==========================================================================
  const rlKey = "_verify-s17-rl-user";
  const rule = { limit: 3, windowMs: 60_000 };
  let rlOk = 0;
  let rlBlocked = 0;
  for (let i = 0; i < 5; i += 1) {
    const r = checkRateLimit(rlKey, rule);
    if (r.ok) rlOk += 1;
    else rlBlocked += 1;
  }
  assert("exactly `limit` requests pass, the rest are blocked", rlOk === 3 && rlBlocked === 2, { rlOk, rlBlocked });

  // ==========================================================================
  section("FoodPlatformSetting — the ordering launch gate defaults OFF with no row");
  // ==========================================================================
  await prisma.foodPlatformSetting.deleteMany({});
  const defaultState = await getOrderingEnabled();
  assert("no row at all reads as DISABLED (the Custom Edit's own instruction)", defaultState === false, defaultState);

  await setOrderingEnabled(true);
  assert("after enabling, reads back true", (await getOrderingEnabled()) === true);
  await setOrderingEnabled(false);
  assert("after pausing again, reads back false", (await getOrderingEnabled()) === false);

  // ==========================================================================
  section("Real DB lifecycle — order creation, notifications, and the two sweep jobs");
  // ==========================================================================
  const seller = await prisma.foodSeller.create({
    data: {
      userId: SELLER_USER_ID,
      slug: SLUG,
      displayName: "Cocina de Prueba S17",
      bio: "A".repeat(30),
      areas: ["central"],
      fulfillmentModes: ["PICKUP"],
      status: "ACTIVE",
    },
  });
  const listing = await prisma.foodListing.create({
    data: {
      sellerId: seller.id,
      slug: `${SLUG}-listing`,
      title: "Test Dish",
      description: "x",
      kind: "SINGLE_ITEM",
      priceMode: "FIXED",
      priceCents: 1000,
    },
  });

  const created = await createOrderWithRetry((orderNumber) =>
    prisma.foodOrder.create({
      data: {
        orderNumber,
        clientId: CLIENT_USER_ID,
        sellerId: seller.id,
        fulfillmentMode: "PICKUP",
        fulfillmentAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        subtotalCents: 1000,
        respondBy: new Date(Date.now() - 1000), // already past, for the expiry test below
        items: { create: { listingId: listing.id, titleSnapshot: listing.title, priceCentsSnapshot: 1000, quantity: 1 } },
      },
    }),
  );
  assert("order created with a real FD-#### order number", /^FD-\d{4}$/.test(created?.orderNumber ?? ""), created?.orderNumber);

  await notifyUser(seller.userId, "ORDER_PLACED", { orderId: created!.id, orderNumber: created!.orderNumber });
  const unreadBefore = await unreadOrderNotificationCount(seller.userId);
  assert("notifyUser wrote a real, unread notification", unreadBefore === 1, unreadBefore);
  await markOrderNotificationsRead(seller.userId, created!.id);
  const unreadAfter = await unreadOrderNotificationCount(seller.userId);
  assert("markOrderNotificationsRead clears it (scoped to THIS order's payload.orderId)", unreadAfter === 0, unreadAfter);

  const expiredCount = await sweepExpiredOrders();
  assert("sweepExpiredOrders expires the backdated PENDING order", expiredCount === 1, expiredCount);
  const afterExpiry = await prisma.foodOrder.findUniqueOrThrow({ where: { id: created!.id } });
  assert("…status is EXPIRED with expiredAt set", afterExpiry.status === "EXPIRED" && afterExpiry.expiredAt !== null, afterExpiry);
  const clientUnread = await unreadOrderNotificationCount(CLIENT_USER_ID);
  assert("…and the CUSTOMER got a real ORDER_EXPIRED notification (a request must never die silently)", clientUnread === 1, clientUnread);

  const secondSweepPass = await sweepExpiredOrders();
  assert("a second sweep pass finds nothing left to expire (idempotent)", secondSweepPass === 0, secondSweepPass);

  // Completion nudge: a second order, ACCEPTED, fulfillmentAt already past.
  const acceptedOrder = await createOrderWithRetry((orderNumber) =>
    prisma.foodOrder.create({
      data: {
        orderNumber,
        clientId: CLIENT_USER_ID,
        sellerId: seller.id,
        status: "ACCEPTED",
        fulfillmentMode: "PICKUP",
        fulfillmentAt: new Date(Date.now() - 60 * 60 * 1000),
        subtotalCents: 1000,
        respondBy: new Date(Date.now() + 24 * 60 * 60 * 1000),
        acceptedAt: new Date(),
        items: { create: { listingId: listing.id, titleSnapshot: listing.title, priceCentsSnapshot: 1000, quantity: 1 } },
      },
    }),
  );
  const nudged = await sweepOrderCompletionNudges();
  assert("sweepOrderCompletionNudges reminds the seller once", nudged === 1, nudged);
  const nudgedAgain = await sweepOrderCompletionNudges();
  assert(
    "…and never again for the SAME order (FoodNotification has no unique constraint for this — the dedup is this function's own job)",
    nudgedAgain === 0,
    nudgedAgain,
  );
  const stillAccepted = await prisma.foodOrder.findUniqueOrThrow({ where: { id: acceptedOrder!.id } });
  assert("the nudge is a NOTIFICATION only — the order's own status is untouched", stillAccepted.status === "ACCEPTED", stillAccepted.status);

  // ==========================================================================
  section("Ownership scoping — the query shape `requireOwnOrder{AsSeller,AsClient}` use");
  // ==========================================================================
  const wrongSellerLookup = await prisma.foodOrder.findFirst({ where: { id: acceptedOrder!.id, sellerId: "not-this-seller" } });
  assert("an order id + the WRONG sellerId resolves to nothing", wrongSellerLookup === null);
  const rightSellerLookup = await prisma.foodOrder.findFirst({ where: { id: acceptedOrder!.id, sellerId: seller.id } });
  assert("…the RIGHT sellerId resolves it", rightSellerLookup !== null);
  const wrongClientLookup = await prisma.foodOrder.findFirst({ where: { id: acceptedOrder!.id, clientId: "not-this-client" } });
  assert("an order id + the WRONG clientId resolves to nothing", wrongClientLookup === null);
  const rightClientLookup = await prisma.foodOrder.findFirst({ where: { id: acceptedOrder!.id, clientId: CLIENT_USER_ID } });
  assert("…the RIGHT clientId resolves it", rightClientLookup !== null);

  await cleanup();
  const leftover = await prisma.foodSeller.count({ where: { userId: SELLER_USER_ID } });
  assert("self-cleaning: no verification rows survive the run", leftover === 0);

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
