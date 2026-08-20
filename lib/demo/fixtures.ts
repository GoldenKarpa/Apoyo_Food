import type { FulfillmentMode, OrderStatus, PriceMode } from "@prisma/client";

import demoAssets from "@/demo-assets/manifest.json";
import type { ActiveStoryRow } from "@/components/seller/active-stories-list";
import type { SellerListingRowData } from "@/components/seller/listing-summary-row";
import type { OrderThreadMessage } from "@/components/order-thread";
import type { NotificationDelivery } from "@/lib/notification-prefs";
import type { Locale } from "@/i18n/request";

/**
 * PD-S10 — every byte of data the Food seller demo shows.
 *
 * Plan: `Apoyo-Portal/Provider_Demo_Plan.md` §3, Food row.
 *
 * ## ⚠ In-memory only. There is no database behind any of this
 *
 * D4/D5: no rows, no migration, no seeded records, no `SHOWCASE` visibility
 * class. A refresh resets everything here, and that is a guarantee rather than
 * a side effect — it is what lets the demo be opened by anyone with a verified
 * email with no possibility of touching a real seller's data. Nothing in this
 * file may ever import Prisma, and `scripts/verify-demo-browser.mjs` runs with
 * Postgres DOWN so that stops being a promise and becomes a test.
 *
 * ⚠ It is also unrelated to `prisma/seed-demo.ts`. That seeds a real marketplace
 * into a real database for local development; this is a fiction rendered in one
 * browser tab. They share a word and nothing else.
 *
 * ## ⚠ Bilingual from the first commit (plan R3), in the product's real shape
 *
 * Messages carry `originalText` + `originalLocale` + `translations` — what
 * `FoodMessage` actually stores (Part E6: computed once at send time, never
 * recomputed on read) — rather than one string per locale. That makes
 * `resolveTranslatedText`'s original-plus-translation rendering genuinely
 * function inside the demo instead of being a dead control, which is the
 * subtlety Apparel's own R3 pass found and this copies deliberately.
 *
 * ## ⚠ The orders obey `decideOrderTransition`, not a simplified subset
 *
 * The plan's Food row says so explicitly. The fixtures therefore contain a
 * PENDING order (accept/decline reachable), an ACCEPTED one (complete/cancel
 * reachable), and terminal ones that refuse every transition — so a visitor
 * meets the real state machine, including its refusals.
 *
 * ## ⚠ The two conversations exist to demonstrate PC-1's GATE, not just chat
 *
 * `resolveThreadAccess` is a live function of order state and one seller
 * setting, so a demo that always renders a composer would misrepresent the
 * feature it exists to show. The fixtures give the seller two buyers:
 *
 *   - **Ayanna** — one COMPLETED order and nothing open. Engaged, so the gate
 *     is open *because of the seller's own `postOrderMessaging` setting*. Turn
 *     that switch off in the Settings section and her composer is replaced by
 *     the real "only about active orders" notice. That is the demo.
 *   - **Rafael** — an ACCEPTED order still in front of its fulfilment date.
 *     His composer stays regardless of the setting, because coordinating a live
 *     order is exactly what the opt-out is not allowed to silence.
 *
 * The sandbox computes both answers by calling the REAL
 * `decideThreadAccess`/`orderIsActive` (`lib/thread-access.ts`) over these
 * fixtures — never by hardcoding an outcome.
 */

// ── Identity ────────────────────────────────────────────────────────────────

/** The fictional seller the visitor is operating as. */
export const DEMO_SELLER_ID = "demo-seller";
export const DEMO_SELLER_USER_ID = "demo-seller-user";
export const DEMO_SELLER_SLUG = "cocina-de-marisol";

/** The two fictional buyers. Ids are what the gate and the thread rows key on. */
export const DEMO_BUYER_AYANNA = "demo-buyer-ayanna";
export const DEMO_BUYER_RAFAEL = "demo-buyer-rafael";

// ── Photos ──────────────────────────────────────────────────────────────────

type Slot = "doubles" | "pelau" | "roti" | "blackcake" | "avatar" | "cover" | "story1" | "story2";

export interface DemoPhoto {
  /**
   * ⚠ A URL, not a storage key. `<FoodImage>` hands it to
   * `lib/media/image-loader.ts`, which passes any root-relative path through
   * untouched, and `sellerMediaUrl` leaves it alone for the same reason (see
   * that function's own note). It has no `-thumb`/`-card`/`-full` suffix
   * precisely so no variant rewriting is attempted on it.
   */
  src: string;
  blurDataUrl: string;
}

function photo(slot: Slot): DemoPhoto {
  const entry = demoAssets.photos.find((p) => p.slot === slot);
  if (!entry) {
    throw new Error(`[demo] no photo for slot "${slot}" — re-run scripts/build-demo-assets.mjs`);
  }
  return { src: `/api/food/demo-media/${entry.file}`, blurDataUrl: entry.blurDataUrl };
}

/**
 * The credit line the demo renders. CC BY and CC BY-SA both REQUIRE
 * attribution, so this is a licence obligation, not a nicety — do not drop it,
 * and do not let a redesign hide it behind a toggle.
 */
export function photoCredits(): string {
  return demoAssets.photos
    .map((p) => `${p.source.title.replace(/^File:/, "")} — ${p.artist} (${p.licence})`)
    .join(" · ");
}

// ── The seller ──────────────────────────────────────────────────────────────

export interface DemoSeller {
  displayName: string;
  slug: string;
  avatar: DemoPhoto;
  cover: DemoPhoto;
  /** Already-localized region names — never an address (Part G). */
  areas: string[];
  specialties: string[];
  /** PC-1's three conversation settings, live and flippable in the demo. */
  postOrderMessaging: boolean;
  messageReadReceipts: boolean;
  chatDelivery: NotificationDelivery;
}

export function initialSeller(locale: Locale): DemoSeller {
  const es = locale === "es";
  return {
    displayName: "La Cocina de Marisol",
    slug: DEMO_SELLER_SLUG,
    avatar: photo("avatar"),
    cover: photo("cover"),
    areas: es ? ["San Fernando", "Debe"] : ["San Fernando", "Debe"],
    specialties: es
      ? ["Comida venezolana", "Doubles", "Repostería"]
      : ["Venezuelan food", "Doubles", "Baking"],
    // All three start at the schema's own permissive defaults, so the visitor
    // is looking at the state a real new seller actually starts in.
    postOrderMessaging: true,
    messageReadReceipts: true,
    chatDelivery: "IN_APP_AND_EMAIL",
  };
}

// ── Listings ────────────────────────────────────────────────────────────────

/**
 * `<SellerListingRow>`'s own prop type, plus the handful of extra fields the
 * BUYER's `<MealCard>` needs for the phone frame — one fixture, both sides,
 * which is the only way the two can be guaranteed to agree (plan D6).
 */
export interface DemoListing extends SellerListingRowData {
  slug: string;
  /** Localized, because a dish is authored in ONE language (Part D — no bilingual columns). */
  photoAlt: string;
  availabilityLabel: string;
}

export function initialListings(locale: Locale): DemoListing[] {
  const es = locale === "es";
  return [
    {
      id: "demo-listing-doubles",
      slug: "doubles-de-marisol",
      title: es ? "Doubles (bandeja de 6)" : "Doubles (tray of 6)",
      priceMode: "FIXED",
      priceCents: 4200,
      active: true,
      takenDownAt: null,
      photos: [{ pathThumb: photo("doubles").src, blurDataUrl: photo("doubles").blurDataUrl }],
      _count: { availabilityWindows: 2 },
      photoAlt: es ? "Doubles recién hechos" : "Freshly made doubles",
      availabilityLabel: es ? "Sábado por la mañana" : "Saturday morning",
    },
    {
      id: "demo-listing-pelau",
      slug: "pelau-de-domingo",
      title: es ? "Pelau de pollo (para 4)" : "Chicken pelau (feeds 4)",
      priceMode: "STARTING_AT",
      priceCents: 18000,
      active: true,
      takenDownAt: null,
      photos: [{ pathThumb: photo("pelau").src, blurDataUrl: photo("pelau").blurDataUrl }],
      _count: { availabilityWindows: 1 },
      photoAlt: es ? "Plato de pelau con ensalada" : "A plate of pelau with coleslaw",
      availabilityLabel: es ? "Domingos" : "Sundays",
    },
    {
      id: "demo-listing-roti",
      slug: "dhalpuri-y-curry",
      title: es ? "Dhalpuri con curry de cabra" : "Dhalpuri with curry goat",
      priceMode: "FIXED",
      priceCents: 9500,
      // Paused on arrival, so the visitor's first pause-toggle click has an
      // obvious counterpart to compare against rather than being the only
      // state on screen.
      active: false,
      takenDownAt: null,
      photos: [{ pathThumb: photo("roti").src, blurDataUrl: photo("roti").blurDataUrl }],
      _count: { availabilityWindows: 3 },
      photoAlt: es ? "Dhalpuri con curry" : "Dhalpuri roti with curry",
      availabilityLabel: es ? "Pausado" : "Paused",
    },
    {
      id: "demo-listing-blackcake",
      slug: "black-cake-por-encargo",
      // ⚠ QUOTE, and it is load-bearing: a QUOTE item has no
      // `priceCentsSnapshot`, which is what forces `<AcceptOrderForm>`'s
      // price field to be REQUIRED. The demo's whole "accept with a quote
      // price" story depends on this listing existing.
      title: es ? "Black cake por encargo" : "Black cake, made to order",
      priceMode: "QUOTE",
      priceCents: null,
      active: true,
      takenDownAt: null,
      photos: [{ pathThumb: photo("blackcake").src, blurDataUrl: photo("blackcake").blurDataUrl }],
      _count: { availabilityWindows: 1 },
      photoAlt: es ? "Black cake caribeño" : "Caribbean black cake",
      availabilityLabel: es ? "Con 5 días de aviso" : "5 days' notice",
    },
  ];
}

// ── Orders ──────────────────────────────────────────────────────────────────

export interface DemoOrderItem {
  id: string;
  listingId: string;
  titleSnapshot: string;
  /** `null` for a QUOTE item — the seller names the price when they accept. */
  priceCentsSnapshot: number | null;
  quantity: number;
  note: string | null;
}

/**
 * One fixture order, carrying every field `<SellerOrderRow>` and the demo's own
 * detail view read, plus the two dates `orderIsActive` needs. Deliberately ONE
 * shape rather than the real code's summary/detail split: there is no query
 * here to shape a select around.
 */
export interface DemoOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  clientId: string;
  clientLabel: string;
  fulfillmentMode: FulfillmentMode;
  fulfillmentAt: Date;
  fulfillmentAreaOrNote: string | null;
  subtotalCents: number | null;
  customerNote: string | null;
  respondBy: Date;
  createdAt: Date;
  declineReason: string | null;
  cancellationReason: string | null;
  items: DemoOrderItem[];
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function initialOrders(locale: Locale, now: Date = new Date()): DemoOrder[] {
  const es = locale === "es";
  const t = now.getTime();
  return [
    {
      // The headline interaction: a QUOTE order, so accepting REQUIRES naming a
      // price. `respondBy` is deliberately inside its window — past it the
      // order is inactive by `orderIsActive` and the demo would be showing a
      // dead request.
      id: "demo-order-quote",
      orderNumber: "FD-2041",
      status: "PENDING",
      clientId: DEMO_BUYER_RAFAEL,
      clientLabel: "rafael@example.com",
      fulfillmentMode: "PICKUP",
      fulfillmentAt: new Date(t + 6 * DAY),
      fulfillmentAreaOrNote: es ? "Recoger en San Fernando" : "Pickup in San Fernando",
      subtotalCents: null,
      customerNote: es
        ? "Para el cumpleaños de mi mamá — ¿puede ser sin nueces?"
        : "For my mother's birthday — could it be nut-free?",
      respondBy: new Date(t + 18 * HOUR),
      createdAt: new Date(t - 6 * HOUR),
      declineReason: null,
      cancellationReason: null,
      items: [
        {
          id: "demo-item-blackcake",
          listingId: "demo-listing-blackcake",
          titleSnapshot: es ? "Black cake por encargo" : "Black cake, made to order",
          priceCentsSnapshot: null,
          quantity: 1,
          note: es ? "Tamaño mediano" : "Medium size",
        },
      ],
    },
    {
      // A priced request, so accept-without-adjusting is reachable too — the
      // ordinary case, which a demo showing only the quote path would hide.
      id: "demo-order-priced",
      orderNumber: "FD-2040",
      status: "PENDING",
      clientId: DEMO_BUYER_AYANNA,
      clientLabel: "ayanna@example.com",
      fulfillmentMode: "SELLER_DELIVERY",
      fulfillmentAt: new Date(t + 2 * DAY),
      fulfillmentAreaOrNote: es ? "Entrega en Debe" : "Delivery to Debe",
      subtotalCents: 8400,
      customerNote: null,
      respondBy: new Date(t + 10 * HOUR),
      createdAt: new Date(t - 2 * HOUR),
      declineReason: null,
      cancellationReason: null,
      items: [
        {
          id: "demo-item-doubles",
          listingId: "demo-listing-doubles",
          titleSnapshot: es ? "Doubles (bandeja de 6)" : "Doubles (tray of 6)",
          priceCentsSnapshot: 4200,
          quantity: 2,
          note: es ? "Con bastante pimienta" : "Plenty of pepper",
        },
      ],
    },
    {
      // ⚠ Rafael's ACTIVE order — the reason his conversation stays writable
      // however the opt-out is set. `fulfillmentAt` is in the future, so
      // `orderIsActive` says true without relying on the 30-day grace window.
      id: "demo-order-accepted",
      orderNumber: "FD-2038",
      status: "ACCEPTED",
      clientId: DEMO_BUYER_RAFAEL,
      clientLabel: "rafael@example.com",
      fulfillmentMode: "MEETUP",
      fulfillmentAt: new Date(t + 3 * DAY),
      fulfillmentAreaOrNote: es ? "Frente a la biblioteca, 5pm" : "Outside the library, 5pm",
      subtotalCents: 18000,
      customerNote: null,
      respondBy: new Date(t - 2 * DAY),
      createdAt: new Date(t - 3 * DAY),
      declineReason: null,
      cancellationReason: null,
      items: [
        {
          id: "demo-item-pelau",
          listingId: "demo-listing-pelau",
          titleSnapshot: es ? "Pelau de pollo (para 4)" : "Chicken pelau (feeds 4)",
          priceCentsSnapshot: 18000,
          quantity: 1,
          note: null,
        },
      ],
    },
    {
      // ⚠ Ayanna's ENGAGED-but-closed order. This single row is what puts her
      // past PC-1's anti-spam gate at all (`ENGAGED_ORDER_STATUSES`), while
      // leaving her subject to the seller's post-order setting — the exact
      // pair of conditions the Settings switch demonstrates.
      id: "demo-order-completed",
      orderNumber: "FD-1994",
      status: "COMPLETED",
      clientId: DEMO_BUYER_AYANNA,
      clientLabel: "ayanna@example.com",
      fulfillmentMode: "PICKUP",
      fulfillmentAt: new Date(t - 21 * DAY),
      fulfillmentAreaOrNote: null,
      subtotalCents: 12600,
      customerNote: null,
      respondBy: new Date(t - 23 * DAY),
      createdAt: new Date(t - 24 * DAY),
      declineReason: null,
      cancellationReason: null,
      items: [
        {
          id: "demo-item-doubles-past",
          listingId: "demo-listing-doubles",
          titleSnapshot: es ? "Doubles (bandeja de 6)" : "Doubles (tray of 6)",
          priceCentsSnapshot: 4200,
          quantity: 3,
          note: null,
        },
      ],
    },
  ];
}

// ── Conversations ───────────────────────────────────────────────────────────

export interface DemoThread {
  id: string;
  clientId: string;
  clientLabel: string;
  createdAt: Date;
  lastMessageAt: Date | null;
  messages: OrderThreadMessage[];
}

export function initialThreads(locale: Locale, now: Date = new Date()): DemoThread[] {
  const t = now.getTime();
  return [
    {
      id: "demo-thread-ayanna",
      clientId: DEMO_BUYER_AYANNA,
      clientLabel: "ayanna@example.com",
      createdAt: new Date(t - 24 * DAY),
      lastMessageAt: new Date(t - 40 * 60 * 1000),
      messages: [
        {
          id: "demo-msg-a1",
          senderUserId: DEMO_BUYER_AYANNA,
          // ⚠ The product's REAL bilingual shape: one authored original plus
          // stored translations. `resolveTranslatedText` renders the viewer's
          // language with the original beneath, so the translation line in this
          // demo is the live feature, not a mock-up of it.
          originalText: "Morning! Do you have doubles this Saturday?",
          originalLocale: "en",
          translations: { es: "¡Buenos días! ¿Tiene doubles este sábado?" },
          attachmentPath: null,
          attachmentKind: null,
          readAt: new Date(t - 20 * DAY),
          createdAt: new Date(t - 20 * DAY),
          order: { id: "demo-order-completed", orderNumber: "FD-1994" },
        },
        {
          id: "demo-msg-a2",
          senderUserId: DEMO_SELLER_USER_ID,
          originalText: "Sí, desde las 7 de la mañana. ¿Cuántas bandejas quiere?",
          originalLocale: "es",
          translations: { en: "Yes, from 7am. How many trays would you like?" },
          attachmentPath: null,
          attachmentKind: null,
          readAt: new Date(t - 20 * DAY),
          createdAt: new Date(t - 20 * DAY + HOUR),
          order: { id: "demo-order-completed", orderNumber: "FD-1994" },
        },
        {
          id: "demo-msg-a3",
          senderUserId: DEMO_BUYER_AYANNA,
          originalText: "That black cake was unreal. Could you do one for Christmas?",
          originalLocale: "en",
          translations: { es: "El black cake estaba increíble. ¿Podría hacer uno para Navidad?" },
          // The one attachment in the fixtures: proof that a photo in a message
          // renders, without needing an upload path the demo cannot provide.
          attachmentPath: photo("blackcake").src,
          attachmentKind: "PHOTO",
          readAt: null,
          createdAt: new Date(t - 40 * 60 * 1000),
          // ⚠ No order — this is a message that belongs to the THREAD alone,
          // which is the entire point of PC-1 and impossible before it.
          order: null,
        },
      ],
    },
    {
      id: "demo-thread-rafael",
      clientId: DEMO_BUYER_RAFAEL,
      clientLabel: "rafael@example.com",
      createdAt: new Date(t - 3 * DAY),
      lastMessageAt: new Date(t - 90 * 60 * 1000),
      messages: [
        {
          id: "demo-msg-r1",
          senderUserId: DEMO_BUYER_RAFAEL,
          originalText: "¿Puede ser a las 6 en vez de las 5?",
          originalLocale: "es",
          translations: { en: "Could we make it 6 instead of 5?" },
          attachmentPath: null,
          attachmentKind: null,
          readAt: null,
          createdAt: new Date(t - 90 * 60 * 1000),
          order: { id: "demo-order-accepted", orderNumber: "FD-2038" },
        },
      ],
    },
  ];
}

// ── Fresh Today (informational) ─────────────────────────────────────────────

export function initialStories(locale: Locale, now: Date = new Date()): ActiveStoryRow[] {
  const es = locale === "es";
  const t = now.getTime();
  return [
    {
      id: "demo-story-1",
      pathThumb: photo("story1").src,
      blurDataUrl: photo("story1").blurDataUrl,
      caption: es ? "Arepas listas — quedan 8" : "Arepas ready — 8 left",
      expiresAt: new Date(t + 9 * HOUR).toISOString(),
      highlightId: "demo-highlight-desayuno",
      linkedListing: null,
      viewCount: 74,
    },
    {
      id: "demo-story-2",
      pathThumb: photo("story2").src,
      blurDataUrl: photo("story2").blurDataUrl,
      caption: es ? "Queso llanero de hoy" : "Today's queso llanero",
      expiresAt: new Date(t + 5 * HOUR).toISOString(),
      highlightId: null,
      linkedListing: null,
      viewCount: 31,
    },
  ];
}

export interface DemoHighlight {
  id: string;
  title: string;
  stories: { id: string; pathThumb: string; blurDataUrl: string }[];
}

export function initialHighlights(locale: Locale): DemoHighlight[] {
  const es = locale === "es";
  return [
    {
      id: "demo-highlight-desayuno",
      title: es ? "Desayuno" : "Breakfast",
      stories: [
        {
          id: "demo-story-1",
          pathThumb: photo("story1").src,
          blurDataUrl: photo("story1").blurDataUrl,
        },
      ],
    },
  ];
}

/** Price modes the fixtures use, re-exported so the sandbox needn't widen a cast. */
export type DemoPriceMode = PriceMode;
