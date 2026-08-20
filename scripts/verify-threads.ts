/**
 * PC-1 verification — the persistent buyer↔seller thread, its anti-spam gate,
 * and the seller opt-out.
 *
 * The brief's own done-when is the minimum bar here: **"assert at minimum that
 * the gate holds — no thread without a prior order — and that the seller
 * opt-out actually blocks a post-order message."** Both are asserted below, in
 * both halves: as a pure decision (every branch, no database) and against a
 * real database with real rows.
 *
 * Split the same way every prior slice's verification splits (`verify-order-
 * thread.ts` / `verify-order-thread-e2e.mjs`): everything reachable without a
 * request scope lives here, and the parts that read `next/headers`
 * (`sendThreadMessage`, `startThreadWithSeller`) cannot be called outside one,
 * so this proves the gate they both delegate to instead of mocking a session.
 *
 * ⚠ Needs a real database (`DATABASE_URL`) — it writes and deletes real rows
 * under a `_verify-pc1-` prefix and cleans up after itself, pass or fail.
 *
 *   npx tsx scripts/verify-threads.ts        (npm run verify:threads)
 */
import { PrismaClient } from "@prisma/client";

import {
  decideThreadAccess,
  resolveThreadAccess,
  resolveThread,
  markThreadRead,
  sellerThreadSummaries,
  clientThreadSummaries,
  findThreadForPair,
  ENGAGED_ORDER_STATUSES,
  OPEN_ORDER_STATUSES,
  orderIsActive,
  ACCEPTED_ORDER_ACTIVE_GRACE_DAYS,
  THREAD_IDLE_RETENTION_DAYS,
} from "../lib/thread";
import { deliveryFor, withDelivery, wantsEmail, wantsInApp, DEFAULT_DELIVERY } from "../lib/notification-prefs";
import { sweepIdleThreads } from "../lib/sweep";

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

const P = "_verify-pc1-";
const SELLER_USER_ID = `${P}seller-user`;
const BUYER = `${P}buyer`;
const STRANGER = `${P}stranger`;

async function cleanup() {
  // Threads before orders before the seller: messages cascade from the thread,
  // and the seller row is Restrict-protected by both.
  await prisma.foodNotification.deleteMany({ where: { userId: { in: [SELLER_USER_ID, BUYER, STRANGER] } } });
  await prisma.foodThread.deleteMany({ where: { seller: { userId: SELLER_USER_ID } } });
  await prisma.foodOrder.deleteMany({ where: { seller: { userId: SELLER_USER_ID } } });
  await prisma.foodSeller.deleteMany({ where: { userId: SELLER_USER_ID } });
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  await cleanup();

  // ==========================================================================
  section("The gate as a pure decision — every branch, no database");
  // ==========================================================================

  // ⚠ These four cases ARE the ruling. If any of them flips, the feature is
  // wrong regardless of what the UI does.
  assert(
    "no order at all → BLOCKED, reason `orderRequired` (the anti-spam gate)",
    (() => {
      const a = decideThreadAccess({ hasOpenOrder: false, hasEngagedOrder: false, sellerAllowsPostOrder: true });
      return !a.canWrite && a.reason === "orderRequired";
    })(),
  );
  assert(
    "engaged order + seller allows → WRITABLE (the feature itself)",
    decideThreadAccess({ hasOpenOrder: false, hasEngagedOrder: true, sellerAllowsPostOrder: true }).canWrite,
  );
  assert(
    "engaged order + seller OPTED OUT → BLOCKED, reason `activeOrdersOnly` (the escape hatch)",
    (() => {
      const a = decideThreadAccess({ hasOpenOrder: false, hasEngagedOrder: true, sellerAllowsPostOrder: false });
      return !a.canWrite && a.reason === "activeOrdersOnly";
    })(),
  );
  assert(
    "OPEN order + seller opted out → still WRITABLE (opt-out narrows chat TO open orders, never removes it FROM them)",
    decideThreadAccess({ hasOpenOrder: true, hasEngagedOrder: true, sellerAllowsPostOrder: false }).canWrite,
  );

  // ⚠ The privacy ordering: a stranger must never learn a seller's setting.
  assert(
    "no order AND seller opted out → reason is `orderRequired`, NOT `activeOrdersOnly` — a stranger never learns the seller's preference",
    decideThreadAccess({ hasOpenOrder: false, hasEngagedOrder: false, sellerAllowsPostOrder: false }).reason ===
      "orderRequired",
  );
  assert(
    "an open order alone is enough even with no engaged history (today's in-order chat, unchanged)",
    decideThreadAccess({ hasOpenOrder: true, hasEngagedOrder: false, sellerAllowsPostOrder: true }).canWrite,
  );

  // ==========================================================================
  section("What counts as an order — the status lists the gate is made of");
  // ==========================================================================
  assert(
    "PENDING is NOT engaged — a stranger can create one unilaterally, so it must not buy a permanent channel",
    !ENGAGED_ORDER_STATUSES.includes("PENDING"),
  );
  assert(
    "EXPIRED is NOT engaged — the seller never responded",
    !ENGAGED_ORDER_STATUSES.includes("EXPIRED"),
  );
  assert(
    "DECLINED IS engaged — 'not this Saturday, but could you do the next one?' is exactly what this feature is for, and it required a real response",
    ENGAGED_ORDER_STATUSES.includes("DECLINED"),
  );
  assert(
    "COMPLETED and ACCEPTED are engaged",
    ENGAGED_ORDER_STATUSES.includes("COMPLETED") && ENGAGED_ORDER_STATUSES.includes("ACCEPTED"),
  );
  assert(
    "both cancellations are engaged (the seller had already accepted)",
    ENGAGED_ORDER_STATUSES.includes("CANCELLED_BY_CUSTOMER") &&
      ENGAGED_ORDER_STATUSES.includes("CANCELLED_BY_SELLER"),
  );
  assert("open means PENDING or ACCEPTED, nothing else", OPEN_ORDER_STATUSES.join() === "PENDING,ACCEPTED");

  // ==========================================================================
  section('"Open" must not mean "immortal" — orderIsActive');
  // ==========================================================================
  const NOW = new Date("2026-08-19T12:00:00Z");
  const future = (days: number) => new Date(NOW.getTime() + days * DAY_MS);
  const past = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

  assert(
    "PENDING inside its respondBy window is active",
    orderIsActive({ status: "PENDING", respondBy: future(1), fulfillmentAt: future(3) }, NOW),
  );
  assert(
    "⚠ PENDING past respondBy is NOT active — it must not depend on sweepExpiredOrders having run",
    !orderIsActive({ status: "PENDING", respondBy: past(1), fulfillmentAt: future(3) }, NOW),
  );
  assert(
    "ACCEPTED for a date 18 months out IS active (the wedding-cake case the interlock exists for)",
    orderIsActive({ status: "ACCEPTED", respondBy: past(200), fulfillmentAt: future(540) }, NOW),
  );
  assert(
    "ACCEPTED just after its date is still active (inside the grace window)",
    orderIsActive({ status: "ACCEPTED", respondBy: past(40), fulfillmentAt: past(5) }, NOW),
  );
  assert(
    "⚠ THE IMMORTALITY FIX: ACCEPTED whose date passed 2 years ago is NOT active — nothing auto-closes an ACCEPTED order, so a status-only test would shield its thread forever",
    !orderIsActive({ status: "ACCEPTED", respondBy: past(760), fulfillmentAt: past(730) }, NOW),
  );
  assert(
    `…the grace boundary is ${ACCEPTED_ORDER_ACTIVE_GRACE_DAYS} days: still active just inside it, dead just outside`,
    orderIsActive(
      { status: "ACCEPTED", respondBy: past(60), fulfillmentAt: past(ACCEPTED_ORDER_ACTIVE_GRACE_DAYS - 1) },
      NOW,
    ) &&
      !orderIsActive(
        { status: "ACCEPTED", respondBy: past(60), fulfillmentAt: past(ACCEPTED_ORDER_ACTIVE_GRACE_DAYS + 1) },
        NOW,
      ),
  );
  for (const terminal of ["COMPLETED", "DECLINED", "CANCELLED_BY_CUSTOMER", "CANCELLED_BY_SELLER", "EXPIRED"] as const) {
    assert(
      `${terminal} is never active, whatever its dates`,
      !orderIsActive({ status: terminal, respondBy: future(10), fulfillmentAt: future(10) }, NOW),
    );
  }

  // ==========================================================================
  section("The gate against a real database");
  // ==========================================================================
  const seller = await prisma.foodSeller.create({
    data: {
      userId: SELLER_USER_ID,
      slug: `${P}kitchen`,
      displayName: "Cocina PC-1",
      email: "seller@example.test",
      languages: ["es"],
      areas: ["central"],
      fulfillmentModes: ["PICKUP"],
      status: "ACTIVE",
    },
  });

  assert("a new seller defaults to ALLOWING post-order conversation (the ruling's default)", seller.postOrderMessaging);
  assert("…and to showing read receipts", seller.messageReadReceipts);
  assert(
    "…and to the default notification delivery, expressed in code not in a column default",
    JSON.stringify(seller.notificationPrefs) === "{}" &&
      deliveryFor(seller.notificationPrefs, "chat") === DEFAULT_DELIVERY,
  );

  // ── A stranger: no order of any kind ──────────────────────────────────────
  const strangerAccess = await resolveThreadAccess(seller.id, STRANGER);
  assert(
    "STRANGER (no order) is refused by the live gate, reason `orderRequired`",
    !strangerAccess.canWrite && strangerAccess.reason === "orderRequired",
    strangerAccess,
  );

  // ── A buyer whose only order EXPIRED unanswered ───────────────────────────
  const expiredOrder = await prisma.foodOrder.create({
    data: {
      orderNumber: `${P}FD-1`,
      clientId: BUYER,
      clientEmail: "buyer@example.test",
      sellerId: seller.id,
      fulfillmentMode: "PICKUP",
      fulfillmentAt: new Date(Date.now() + DAY_MS),
      respondBy: new Date(Date.now() - DAY_MS),
      status: "EXPIRED",
    },
  });
  const expiredAccess = await resolveThreadAccess(seller.id, BUYER);
  assert(
    "an EXPIRED-only history is still refused — placing a request the seller ignored buys no permanent channel",
    !expiredAccess.canWrite && expiredAccess.reason === "orderRequired",
    expiredAccess,
  );

  // ── The same buyer, now with a completed order ────────────────────────────
  await prisma.foodOrder.update({ where: { id: expiredOrder.id }, data: { status: "COMPLETED" } });
  const engagedAccess = await resolveThreadAccess(seller.id, BUYER);
  assert(
    "one COMPLETED order opens the conversation — the gate's whole positive case",
    engagedAccess.canWrite && engagedAccess.hasEngagedOrder,
    engagedAccess,
  );

  // ── The seller opts out ───────────────────────────────────────────────────
  await prisma.foodSeller.update({ where: { id: seller.id }, data: { postOrderMessaging: false } });
  const optedOutAccess = await resolveThreadAccess(seller.id, BUYER);
  assert(
    "⚠ THE OPT-OUT: the same buyer, same completed order, is now BLOCKED with reason `activeOrdersOnly`",
    !optedOutAccess.canWrite && optedOutAccess.reason === "activeOrdersOnly",
    optedOutAccess,
  );

  // ── …but a live order still carries its own conversation ──────────────────
  const openOrder = await prisma.foodOrder.create({
    data: {
      orderNumber: `${P}FD-2`,
      clientId: BUYER,
      clientEmail: "buyer@example.test",
      sellerId: seller.id,
      fulfillmentMode: "PICKUP",
      fulfillmentAt: new Date(Date.now() + DAY_MS),
      respondBy: new Date(Date.now() + DAY_MS),
      status: "ACCEPTED",
    },
  });
  const openAccess = await resolveThreadAccess(seller.id, BUYER);
  assert(
    "…while an ACCEPTED order is live, the opted-out seller's thread is writable again — coordinating a live order is never what the opt-out silences",
    openAccess.canWrite && openAccess.hasOpenOrder,
    openAccess,
  );

  // Close it again and restore the permissive default for the rest of the run.
  await prisma.foodOrder.update({ where: { id: openOrder.id }, data: { status: "COMPLETED" } });
  await prisma.foodSeller.update({ where: { id: seller.id }, data: { postOrderMessaging: true } });

  // ==========================================================================
  section("Thread resolution: one conversation per relationship, forever");
  // ==========================================================================
  const thread = await resolveThread(seller.id, BUYER, "buyer@example.test");
  const again = await resolveThread(seller.id, BUYER, "buyer@example.test");
  assert("resolving twice returns the SAME thread — the pair is the identity", thread.id === again.id);

  // Concurrent first sends are the real failure mode a find-then-create would
  // hit: both see "no thread", both create, one takes a P2002 mid-send.
  const raced = await Promise.all(
    Array.from({ length: 5 }, () => resolveThread(seller.id, `${P}raced`, "raced@example.test")),
  );
  assert(
    "5 concurrent resolutions of a brand-new pair all land on ONE thread (upsert, not find-then-create)",
    new Set(raced.map((t) => t.id)).size === 1,
    raced.map((t) => t.id),
  );

  const found = await findThreadForPair(seller.id, BUYER);
  assert("findThreadForPair locates it", found?.id === thread.id);

  // A send with no email claim must not erase a good snapshot.
  await resolveThread(seller.id, BUYER, null);
  const preserved = await prisma.foodThread.findUnique({ where: { id: thread.id }, select: { clientEmail: true } });
  assert(
    "resolving with a null email does NOT wipe an existing snapshot (the sweep and the email fan-out depend on it)",
    preserved?.clientEmail === "buyer@example.test",
    preserved,
  );

  // ==========================================================================
  section("Messages: order-scoped and post-order on one thread");
  // ==========================================================================
  await prisma.foodMessage.create({
    data: {
      threadId: thread.id,
      orderId: expiredOrder.id,
      senderUserId: BUYER,
      originalText: "¿Puede ser sin caramelo?",
      originalLocale: "es",
      translations: { en: "Can it be without caramel?" },
    },
  });
  await prisma.foodMessage.create({
    data: {
      threadId: thread.id,
      senderUserId: BUYER,
      originalText: "What are you making next weekend?",
      originalLocale: "en",
      translations: {},
    },
  });
  await prisma.foodThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });

  const stored = await prisma.foodMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } });
  assert("both messages live on the one thread", stored.length === 2);
  assert("…the post-order one has no order at all", stored[1].orderId === null);

  // ⚠ The inversion PC-1 exists for: conversation outlives the order.
  await prisma.foodOrder.delete({ where: { id: expiredOrder.id } });
  const survived = await prisma.foodMessage.findMany({ where: { threadId: thread.id } });
  assert(
    "⚠ deleting the order does NOT delete the conversation — it only clears the order link (SET NULL, was CASCADE)",
    survived.length === 2 && survived.every((m) => m.orderId === null),
    survived.map((m) => m.orderId),
  );

  // ==========================================================================
  section("Unread state and read receipts");
  // ==========================================================================
  const sellerRow = await prisma.foodSeller.findUniqueOrThrow({ where: { id: seller.id } });
  const beforeRead = await sellerThreadSummaries(seller.id, sellerRow.userId);
  const mine = beforeRead.find((t) => t.id === thread.id);
  assert("the seller sees 2 unread from the buyer", mine?.unreadCount === 2, mine?.unreadCount);

  await markThreadRead(thread.id, sellerRow.userId);
  const afterRead = await sellerThreadSummaries(seller.id, sellerRow.userId);
  assert(
    "opening the conversation clears the seller's unread count",
    afterRead.find((t) => t.id === thread.id)?.unreadCount === 0,
  );

  // ⚠ The receipts setting is disclosure-only.
  await prisma.foodSeller.update({ where: { id: seller.id }, data: { messageReadReceipts: false } });
  const stillStamped = await prisma.foodMessage.findMany({ where: { threadId: thread.id }, select: { readAt: true } });
  assert(
    "⚠ turning read receipts OFF does not un-stamp `readAt` — it hides the value from the buyer, it does not stop its capture (the seller's own unread counts read the same column)",
    stillStamped.every((m) => m.readAt !== null),
  );
  await prisma.foodSeller.update({ where: { id: seller.id }, data: { messageReadReceipts: true } });

  const buyerThreads = await clientThreadSummaries(BUYER);
  assert("the buyer's own list finds the same thread", buyerThreads.some((t) => t.id === thread.id));
  assert(
    "…and the buyer has nothing unread (they wrote both messages)",
    buyerThreads.find((t) => t.id === thread.id)?.unreadCount === 0,
  );

  // ==========================================================================
  section("Notification delivery preferences");
  // ==========================================================================
  assert("an empty blob resolves to the permissive default", deliveryFor({}, "chat") === "IN_APP_AND_EMAIL");
  assert("a malformed blob degrades to the default, never throws", deliveryFor("nonsense", "chat") === DEFAULT_DELIVERY);
  assert("null degrades to the default", deliveryFor(null, "chat") === DEFAULT_DELIVERY);
  assert("an unknown stored value degrades to the default", deliveryFor({ chat: "SMOKE_SIGNAL" }, "chat") === DEFAULT_DELIVERY);
  assert("a real stored value is honoured", deliveryFor({ chat: "OFF" }, "chat") === "OFF");
  assert(
    "withDelivery merges rather than replaces — a future category isn't wiped by this form",
    JSON.stringify(withDelivery({ orders: "IN_APP" }, "chat", "OFF")) === JSON.stringify({ orders: "IN_APP", chat: "OFF" }),
  );
  assert("IN_APP wants in-app but not email", wantsInApp("IN_APP") && !wantsEmail("IN_APP"));
  assert("OFF wants neither", !wantsInApp("OFF") && !wantsEmail("OFF"));

  // ==========================================================================
  section("Retention: the idle sweep, and what it refuses to touch");
  // ==========================================================================
  assert("retention is the user's 12 months", THREAD_IDLE_RETENTION_DAYS === 365);

  // Age the thread past the cutoff.
  const longAgo = new Date(Date.now() - (THREAD_IDLE_RETENTION_DAYS + 30) * DAY_MS);
  await prisma.foodThread.update({ where: { id: thread.id }, data: { lastMessageAt: longAgo, createdAt: longAgo } });

  // ⚠ The interlock: a live order must shield an idle conversation. A wedding
  // cake booked a year out is exactly this shape.
  const futureOrder = await prisma.foodOrder.create({
    data: {
      orderNumber: `${P}FD-3`,
      clientId: BUYER,
      clientEmail: "buyer@example.test",
      sellerId: seller.id,
      fulfillmentMode: "PICKUP",
      fulfillmentAt: new Date(Date.now() + 200 * DAY_MS),
      respondBy: new Date(Date.now() + DAY_MS),
      status: "ACCEPTED",
    },
  });
  await sweepIdleThreads();
  assert(
    "⚠ an idle thread with a still-OPEN order is NOT purged — idleness is not evidence a relationship is over, and the order it discusses hasn't happened yet",
    (await prisma.foodThread.count({ where: { id: thread.id } })) === 1,
  );

  // Close the order; now nothing shields it.
  await prisma.foodOrder.update({ where: { id: futureOrder.id }, data: { status: "COMPLETED" } });
  const purged = await sweepIdleThreads();
  assert("an idle thread with no open order IS purged", purged >= 1, purged);
  assert("…the thread is gone", (await prisma.foodThread.count({ where: { id: thread.id } })) === 0);
  assert(
    "…and its messages went with it (cascade — the replacement for the old order cascade)",
    (await prisma.foodMessage.count({ where: { threadId: thread.id } })) === 0,
  );

  // ⚠ The immortality case, end to end against real rows: an idle thread whose
  // only "open" order is an ACCEPTED one abandoned two years ago must NOT be
  // shielded. Before `orderIsActive` this thread would have survived forever.
  const staleBuyer = `${P}stale`;
  const staleThread = await resolveThread(seller.id, staleBuyer, null);
  await prisma.foodThread.update({
    where: { id: staleThread.id },
    data: { lastMessageAt: longAgo, createdAt: longAgo },
  });
  await prisma.foodOrder.create({
    data: {
      orderNumber: `${P}FD-4`,
      clientId: staleBuyer,
      sellerId: seller.id,
      fulfillmentMode: "PICKUP",
      // Still ACCEPTED — the seller simply never marked it complete, which
      // nothing in this app does for them.
      status: "ACCEPTED",
      fulfillmentAt: new Date(Date.now() - 730 * DAY_MS),
      respondBy: new Date(Date.now() - 760 * DAY_MS),
    },
  });
  await sweepIdleThreads();
  assert(
    "⚠ an idle thread shielded only by an ACCEPTED order abandoned 2 years ago IS purged — 'open' does not mean 'immortal'",
    (await prisma.foodThread.count({ where: { id: staleThread.id } })) === 0,
  );
  assert(
    "…and the stale order itself is left untouched — closing it is an order-lifecycle decision, not a cleanup job's business",
    (await prisma.foodOrder.count({ where: { orderNumber: `${P}FD-4`, status: "ACCEPTED" } })) === 1,
  );

  // A fresh thread is untouched by the same pass.
  const fresh = await resolveThread(seller.id, `${P}fresh`, null);
  await prisma.foodThread.update({ where: { id: fresh.id }, data: { lastMessageAt: new Date() } });
  await sweepIdleThreads();
  assert("a recently-active thread survives the sweep", (await prisma.foodThread.count({ where: { id: fresh.id } })) === 1);

  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
}

main()
  .catch((err) => {
    console.error(err);
    fail += 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
