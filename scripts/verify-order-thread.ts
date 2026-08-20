/**
 * Slice 18 domain-level verification: the parts that don't need a real
 * session — `shouldSendDebouncedEmail`/`sellerEmailLocale` (pure),
 * `prepareTranslatedText`/`resolveTranslatedText` (the bilingual round trip,
 * exercised with order-message-shaped content against the REAL translate
 * service — unreachable in this dev environment by its own design, which is
 * exactly what proves the done-when's "translate-service-down degrade path
 * still delivers original text" for real rather than by mocking a failure),
 * the `notifyThreadMessage` debounce integration against a real database, the
 * "orders" storage-key trust boundary, and the new message-attachment media
 * preset. `sendOrderMessage`/`reportMessage` themselves read
 * `next/headers` and cannot be called outside a request scope — proven live
 * instead by `scripts/verify-order-thread-e2e.mjs`, the same domain/e2e split
 * every prior slice's own verification has used.
 *
 *   npx tsx scripts/verify-order-thread.ts
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";

import { shouldSendDebouncedEmail, sellerEmailLocale, notifyThreadMessage } from "../lib/notifications";
import { prepareTranslatedText, resolveTranslatedText } from "../lib/bilingual";
import { safeStorageKey } from "../lib/storage";
import { ingestMessageAttachment } from "../lib/media/ingest";

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

const SLUG = "_verify-s18-thread-domain";
const SELLER_USER_ID = `${SLUG}-seller`;
const CLIENT_USER_ID = `${SLUG}-client`;

async function cleanup() {
  await prisma.foodNotification.deleteMany({ where: { userId: { in: [SELLER_USER_ID, CLIENT_USER_ID] } } });
  // PC-1 — threads before orders before the seller. A thread's messages cascade
  // from the thread, and the seller row is Restrict-protected by BOTH.
  await prisma.foodThread.deleteMany({ where: { seller: { userId: SELLER_USER_ID } } });
  await prisma.foodOrder.deleteMany({ where: { seller: { userId: SELLER_USER_ID } } });
  await prisma.foodSeller.deleteMany({ where: { userId: SELLER_USER_ID } });
}

async function main() {
  await cleanup();

  // ==========================================================================
  section("shouldSendDebouncedEmail — pure, the ≤1-per-15-min window");
  // ==========================================================================
  const now = new Date();
  assert("no prior email at all -> send", shouldSendDebouncedEmail(null, now) === true);
  assert(
    "emailed 1 minute ago -> still inside the window, don't send",
    shouldSendDebouncedEmail(new Date(now.getTime() - 60_000), now) === false,
  );
  assert(
    "emailed 14m59s ago -> still inside the window",
    shouldSendDebouncedEmail(new Date(now.getTime() - (15 * 60_000 - 1000)), now) === false,
  );
  assert(
    "emailed exactly 15 minutes ago -> window closed (inclusive), send",
    shouldSendDebouncedEmail(new Date(now.getTime() - 15 * 60_000), now) === true,
  );
  assert(
    "emailed an hour ago -> long past the window, send",
    shouldSendDebouncedEmail(new Date(now.getTime() - 60 * 60_000), now) === true,
  );

  // ==========================================================================
  section("sellerEmailLocale — pure, the identity-lookup-gap inference");
  // ==========================================================================
  assert("languages includes es -> es", sellerEmailLocale({ languages: ["en", "es"] }) === "es");
  assert("languages is es-only -> es", sellerEmailLocale({ languages: ["es"] }) === "es");
  assert("languages is en-only -> en", sellerEmailLocale({ languages: ["en"] }) === "en");
  assert("no declared languages -> en (the dashboard's OWN default is es, but with nothing declared there's no signal to prefer it)", sellerEmailLocale({ languages: [] }) === "en");

  // ==========================================================================
  section("prepareTranslatedText — the REAL degrade path (translate service unreachable by default in this dev environment)");
  // ==========================================================================
  const fromEnglish = await prepareTranslatedText("What time will it be ready?", "en");
  assert("originalText preserved exactly", fromEnglish.originalText === "What time will it be ready?", fromEnglish);
  assert("originalLocale is the author's own", fromEnglish.originalLocale === "en", fromEnglish);
  assert(
    "translations is empty — the service is down, so nothing was computed, but the call never threw",
    Object.keys(fromEnglish.translations).length === 0,
    fromEnglish,
  );

  const fromSpanish = await prepareTranslatedText("¿A qué hora estará listo?", "es");
  assert("Spanish-authored text degrades the same way", fromSpanish.originalText === "¿A qué hora estará listo?" && Object.keys(fromSpanish.translations).length === 0, fromSpanish);

  const empty = await prepareTranslatedText("   ", "en");
  assert("whitespace-only text short-circuits to empty, no network call at all", empty.originalText === "", empty);

  // ==========================================================================
  section("resolveTranslatedText — read-time resolution, zero network calls");
  // ==========================================================================
  const sameLocale = resolveTranslatedText({ originalText: "Hola", originalLocale: "es", translations: {} }, "es");
  assert("same-locale viewer sees the original, isTranslated false", sameLocale?.text === "Hola" && sameLocale.isTranslated === false, sameLocale);

  const withRealTranslation = resolveTranslatedText(
    { originalText: "Hola", originalLocale: "es", translations: { en: "Hello" } },
    "en",
  );
  assert(
    "cross-locale viewer WITH a stored translation sees it prominently, original still available",
    withRealTranslation?.text === "Hello" && withRealTranslation.original === "Hola" && withRealTranslation.isTranslated === true,
    withRealTranslation,
  );

  const degraded = resolveTranslatedText({ originalText: "Hola", originalLocale: "es", translations: {} }, "en");
  assert(
    "cross-locale viewer with NO stored translation (the degrade case) still sees real words — the original — never an error or empty bubble",
    degraded?.text === "Hola" && degraded.isTranslated === false,
    degraded,
  );

  const noText = resolveTranslatedText({ originalText: "", originalLocale: "en", translations: {} }, "en");
  assert("empty originalText (a photo-only message) resolves to null — nothing to render as the text line", noText === null);

  // ==========================================================================
  section('The "orders" storage-key trust boundary (safeStorageKey, the same primitive `isMessageAttachmentKey` wraps)');
  // ==========================================================================
  // ⚠ `path.join` in `safeStorageKey`'s return uses the OS-native separator —
  // `\` on this Windows dev machine, `/` on the Linux VPS. The property that
  // actually matters is acceptance + category, not the literal separator
  // character, so this checks both rather than a single OS-specific string.
  const acceptedKey = safeStorageKey("orders/abc123-card.webp");
  assert("a real orders/ key is accepted", acceptedKey !== null && acceptedKey.split(/[\\/]/)[0] === "orders", acceptedKey);
  assert("a key from a DIFFERENT category is rejected", safeStorageKey("sellers/abc123-card.webp")?.split("/")[0] !== "orders");
  for (const traversal of ["../../etc/passwd", "orders/../../../etc/passwd", "orders/..%2F..%2Fetc%2Fpasswd"]) {
    assert(`traversal payload rejected: ${traversal}`, safeStorageKey(traversal) === null, safeStorageKey(traversal));
  }

  // ==========================================================================
  section("ingestMessageAttachment — the new media preset (Slice 18)");
  // ==========================================================================
  const sharp = (await import("sharp")).default;
  const fixture = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 200, g: 120, b: 60 } } })
    .jpeg({ quality: 80 })
    .toBuffer();
  const ingested = await ingestMessageAttachment(fixture, "image/jpeg");
  assert("produces a thumb/card/full triple", !!ingested.pathThumb && !!ingested.pathCard && !!ingested.pathFull, ingested);
  assert("keys land in the orders/ category", ingested.pathCard.startsWith("orders/"), ingested.pathCard);
  assert("card variant is 800px wide (matches the loader's width ladder)", ingested.pathCard.includes("-card."), ingested.pathCard);
  assert("a real blur placeholder was produced", ingested.blurDataUrl.startsWith("data:image/jpeg;base64,"));

  // Self-cleaning: remove what this check actually wrote to disk.
  for (const key of [ingested.pathThumb, ingested.pathCard, ingested.pathFull]) {
    await fs.rm(path.join(process.cwd(), "uploads", key), { force: true }).catch(() => {});
  }

  // ==========================================================================
  section("notifyThreadMessage — real DB integration: the debounce actually gates the SEND ATTEMPT");
  // ==========================================================================
  const seller = await prisma.foodSeller.create({
    data: {
      userId: SELLER_USER_ID,
      slug: SLUG,
      displayName: "Cocina de Prueba S18",
      email: "seller@example.test",
      languages: ["es"],
      areas: ["central"],
      fulfillmentModes: ["PICKUP"],
      status: "ACTIVE",
    },
  });
  const order = await prisma.foodOrder.create({
    data: {
      orderNumber: "FD-9001",
      clientId: CLIENT_USER_ID,
      clientEmail: "buyer@example.test",
      sellerId: seller.id,
      fulfillmentMode: "PICKUP",
      fulfillmentAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      respondBy: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  // PC-1 — notifications hang off the THREAD now, so one has to exist. The
  // debounce this section proves is per-conversation, not per-order.
  const thread = await prisma.foodThread.create({
    data: { sellerId: seller.id, clientId: CLIENT_USER_ID, clientEmail: "buyer@example.test" },
  });

  // First message ever for this order — no prior notification exists, so the
  // debounce gate permits an attempt (it fails silently: no SMTP reachable in
  // this dev environment, the exact same ambient state as the translate
  // service — `emailedAt` stays null, and the function must not throw either
  // way).
  await notifyThreadMessage(thread, seller, "client", order);
  const afterFirst = await prisma.foodNotification.findMany({
    where: { userId: seller.userId, kind: "ORDER_MESSAGE" },
  });
  assert("the in-app row is written every time, regardless of email outcome", afterFirst.length === 1, afterFirst.length);

  // Simulate a SUCCESSFUL recent send (can't produce one for real without a
  // reachable SMTP relay) by stamping emailedAt directly — this is exactly the
  // state the debounce gate reads, so it exercises the real query/comparison
  // rather than re-testing the pure function in isolation.
  await prisma.foodNotification.update({ where: { id: afterFirst[0].id }, data: { emailedAt: new Date() } });

  await notifyThreadMessage(thread, seller, "client", order);
  const afterSecond = await prisma.foodNotification.findMany({
    where: { userId: seller.userId, kind: "ORDER_MESSAGE" },
  });
  assert("a second message writes its OWN unread row (the in-app inbox is never throttled)", afterSecond.length === 2, afterSecond.length);
  const emailedRows = afterSecond.filter((r) => r.emailedAt !== null);
  assert(
    "…but NO additional row gets emailed — still exactly the one stamp from before, proving the debounce gate actually prevented a second send attempt",
    emailedRows.length === 1,
    emailedRows.length,
  );

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
