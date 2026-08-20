import nodemailer from "nodemailer";
import { formatFulfillmentInstant } from "@/lib/time";

/**
 * Transactional email (Slice 18, architecture Part E6) — a direct port of
 * Salon's `lib/email.ts` SMTP-transporter pattern (itself ported from the
 * Apoyo-Demia app), which is this ecosystem's actual, already-proven Resend
 * integration: Resend's SMTP relay, not its REST SDK. Confirmed against
 * Salon's own `.env.example` comment ("Prod uses Resend's SMTP relay ...
 * SMTP_USER is literally the string 'resend'; SMTP_PASS is the Resend API
 * key") — using `nodemailer` + generic `SMTP_*` vars keeps this module
 * provider-agnostic in CODE, with "Resend" being an env-var choice, not an
 * SDK dependency.
 *
 * ⚠ Deliberate exception to this repo's "next-intl for every string"
 * convention, same reasoning as Salon's own STRINGS dict: the request in
 * flight when a lifecycle email fires is often not the recipient's own — an
 * order acceptance email to the BUYER fires from the SELLER's accept
 * request, and the completion-nudge / expiry emails fire from a sweep with
 * no request at all. `getTranslations()` reads the CURRENT request's locale
 * context (`i18n/request.ts`), which would silently render the wrong
 * person's email in the wrong language. A locale-keyed dict, resolved
 * explicitly by the caller, sidesteps the mismatch entirely.
 */

const STRINGS = {
  en: {
    orderPlacedSubject: "New order request",
    orderPlacedHeading: "You have a new order request",
    orderPlacedBody: (orderNumber: string, listingTitle: string) =>
      `Order ${orderNumber} — ${listingTitle}. Respond before it expires.`,
    orderAcceptedSubject: "Your order was accepted",
    orderAcceptedHeading: "Order accepted",
    orderAcceptedBody: (orderNumber: string, sellerName: string) =>
      `${sellerName} accepted your order ${orderNumber}.`,
    whenLabel: "When",
    orderDeclinedSubject: "Your order was declined",
    orderDeclinedHeading: "Order declined",
    orderDeclinedBody: (orderNumber: string, sellerName: string) => `${sellerName} declined order ${orderNumber}.`,
    orderExpiredSubject: "Your order request expired",
    orderExpiredHeading: "Request expired",
    orderExpiredBody: (orderNumber: string, sellerName: string) =>
      `${sellerName} didn't respond to order ${orderNumber} in time. Try another seller nearby.`,
    declineReasonPrefix: "Note",
    newMessagesSubject: "New messages waiting",
    newMessagesHeading: "You have new messages",
    newMessagesBody: (orderNumber: string, counterpartLabel: string) =>
      `${counterpartLabel} sent new messages about order ${orderNumber}.`,
    genericCustomer: "A customer",
    viewOrder: "View order",
    // PC-1 — the same "you have messages" mail, for a conversation that is not
    // about any one order. Deliberately a separate string rather than the
    // order one with an empty number: "sent new messages about order " reads
    // as a bug, and the CTA goes to the thread, not to an order page.
    newThreadMessagesBody: (counterpartLabel: string) => `${counterpartLabel} sent you new messages.`,
    viewConversation: "View conversation",
  },
  es: {
    orderPlacedSubject: "Nueva solicitud de pedido",
    orderPlacedHeading: "Tienes una nueva solicitud de pedido",
    orderPlacedBody: (orderNumber: string, listingTitle: string) =>
      `Pedido ${orderNumber} — ${listingTitle}. Responde antes de que expire.`,
    orderAcceptedSubject: "Tu pedido fue aceptado",
    orderAcceptedHeading: "Pedido aceptado",
    orderAcceptedBody: (orderNumber: string, sellerName: string) => `${sellerName} aceptó tu pedido ${orderNumber}.`,
    whenLabel: "Cuándo",
    orderDeclinedSubject: "Tu pedido fue rechazado",
    orderDeclinedHeading: "Pedido rechazado",
    orderDeclinedBody: (orderNumber: string, sellerName: string) => `${sellerName} rechazó el pedido ${orderNumber}.`,
    orderExpiredSubject: "Tu solicitud de pedido expiró",
    orderExpiredHeading: "Solicitud expirada",
    orderExpiredBody: (orderNumber: string, sellerName: string) =>
      `${sellerName} no respondió al pedido ${orderNumber} a tiempo. Prueba con otra cocina cercana.`,
    declineReasonPrefix: "Nota",
    newMessagesSubject: "Tienes mensajes nuevos",
    newMessagesHeading: "Tienes mensajes nuevos",
    newMessagesBody: (orderNumber: string, counterpartLabel: string) =>
      `${counterpartLabel} envió mensajes nuevos sobre el pedido ${orderNumber}.`,
    genericCustomer: "Un cliente",
    viewOrder: "Ver pedido",
    newThreadMessagesBody: (counterpartLabel: string) => `${counterpartLabel} te envió mensajes nuevos.`,
    viewConversation: "Ver conversación",
  },
} as const;

export type EmailLocale = keyof typeof STRINGS;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "localhost",
    port: parseInt(process.env.SMTP_PORT ?? "587", 10) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

/**
 * Always ABSOLUTE, unlike `lib/links.ts`'s `sellerSurfaceUrl` — that helper's
 * relative-path dev fallback is correct for an in-app `<Link>` (both surfaces
 * share `localhost:3012` there) but useless in an email, which has no page
 * context to resolve a relative URL against.
 */
function buyerOrderUrl(orderId: string): string {
  const base = (process.env.NEXT_PUBLIC_ASSET_HOST ?? "http://localhost:3012").replace(/\/+$/, "");
  return `${base}/orders/${orderId}`;
}

function sellerOrderUrl(orderId: string): string {
  const base = (process.env.NEXT_PUBLIC_SELLER_SURFACE_URL ?? "http://localhost:3012").replace(/\/+$/, "");
  return `${base}/food/orders/${orderId}`;
}

/** PC-1 — the same two bases, pointed at the persistent conversation instead. */
function buyerThreadUrl(threadId: string): string {
  const base = (process.env.NEXT_PUBLIC_ASSET_HOST ?? "http://localhost:3012").replace(/\/+$/, "");
  return `${base}/messages/${threadId}`;
}

function sellerThreadUrl(threadId: string): string {
  const base = (process.env.NEXT_PUBLIC_SELLER_SURFACE_URL ?? "http://localhost:3012").replace(/\/+$/, "");
  return `${base}/food/messages/${threadId}`;
}

function layout(heading: string, bodyHtml: string, ctaLabel: string, ctaHref: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>${heading}</h2>
      ${bodyHtml}
      <a href="${ctaHref}" style="display:inline-block;padding:12px 24px;background:#536d46;color:#fff;text-decoration:none;border-radius:999px">
        ${ctaLabel}
      </a>
    </div>
  `;
}

async function sendSimple(
  to: string,
  subject: string,
  heading: string,
  bodyHtml: string,
  ctaLabel: string,
  text: string,
  ctaHref: string,
): Promise<void> {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? "Apoyo Food <noreply@apoyolime.com>",
    to,
    subject,
    html: layout(heading, bodyHtml, ctaLabel, ctaHref),
    text: `${text} ${ctaHref}`,
  });
}

// ── Order lifecycle (Slice 17/18): placed/accepted/declined/expired, immediate ──
// ⚠ Deliberately only these four — Part D's OrderStatus also has CANCELLED_BY_*
// and COMPLETED, and NotificationKind has ORDER_REMINDER, but this slice's own
// brief names exactly "placed/accepted/declined/expired" for email. Not an
// oversight: cancellation and completion are lower-urgency than a live request
// needing a response, and adding email for them is real, separable scope.

export async function sendOrderPlacedEmail(
  to: string,
  locale: EmailLocale,
  details: { orderId: string; orderNumber: string; listingTitle: string },
): Promise<void> {
  const s = STRINGS[locale];
  const body = `<p>${escapeHtml(s.orderPlacedBody(details.orderNumber, details.listingTitle))}</p>`;
  await sendSimple(
    to,
    s.orderPlacedSubject,
    s.orderPlacedHeading,
    body,
    s.viewOrder,
    s.orderPlacedBody(details.orderNumber, details.listingTitle),
    sellerOrderUrl(details.orderId),
  );
}

export async function sendOrderAcceptedEmail(
  to: string,
  locale: EmailLocale,
  details: { orderId: string; orderNumber: string; sellerName: string; fulfillmentAt: Date },
): Promise<void> {
  const s = STRINGS[locale];
  const when = formatFulfillmentInstant(details.fulfillmentAt, locale);
  const body = `<p>${escapeHtml(s.orderAcceptedBody(details.orderNumber, details.sellerName))}</p><p><strong>${s.whenLabel}:</strong> ${escapeHtml(when)}</p>`;
  await sendSimple(
    to,
    s.orderAcceptedSubject,
    s.orderAcceptedHeading,
    body,
    s.viewOrder,
    `${s.orderAcceptedBody(details.orderNumber, details.sellerName)} ${s.whenLabel}: ${when}.`,
    buyerOrderUrl(details.orderId),
  );
}

export async function sendOrderDeclinedEmail(
  to: string,
  locale: EmailLocale,
  details: { orderId: string; orderNumber: string; sellerName: string; reason?: string | null },
): Promise<void> {
  const s = STRINGS[locale];
  const reasonHtml = details.reason ? `<p><strong>${s.declineReasonPrefix}:</strong> ${escapeHtml(details.reason)}</p>` : "";
  const body = `<p>${escapeHtml(s.orderDeclinedBody(details.orderNumber, details.sellerName))}</p>${reasonHtml}`;
  await sendSimple(
    to,
    s.orderDeclinedSubject,
    s.orderDeclinedHeading,
    body,
    s.viewOrder,
    `${s.orderDeclinedBody(details.orderNumber, details.sellerName)}${details.reason ? ` ${s.declineReasonPrefix}: ${details.reason}` : ""}`,
    buyerOrderUrl(details.orderId),
  );
}

export async function sendOrderExpiredEmail(
  to: string,
  locale: EmailLocale,
  details: { orderId: string; orderNumber: string; sellerName: string },
): Promise<void> {
  const s = STRINGS[locale];
  const body = `<p>${escapeHtml(s.orderExpiredBody(details.orderNumber, details.sellerName))}</p>`;
  await sendSimple(
    to,
    s.orderExpiredSubject,
    s.orderExpiredHeading,
    body,
    s.viewOrder,
    s.orderExpiredBody(details.orderNumber, details.sellerName),
    buyerOrderUrl(details.orderId),
  );
}

// ── Thread messages: batched/debounced, never one email per message ──────────

export async function sendNewMessagesEmail(
  to: string,
  locale: EmailLocale,
  details: { orderId: string; orderNumber: string; counterpartLabel: string | null; audience: "CLIENT" | "SELLER" },
): Promise<void> {
  const s = STRINGS[locale];
  // The buyer has no local display name (no cross-DB relation) — an email
  // address reads the same regardless of locale, so it's used as-is when
  // present; only the NO-EMAIL fallback needs its own translation.
  const label = details.counterpartLabel ?? s.genericCustomer;
  const body = `<p>${escapeHtml(s.newMessagesBody(details.orderNumber, label))}</p>`;
  const href = details.audience === "SELLER" ? sellerOrderUrl(details.orderId) : buyerOrderUrl(details.orderId);
  await sendSimple(
    to,
    s.newMessagesSubject,
    s.newMessagesHeading,
    body,
    s.viewOrder,
    s.newMessagesBody(details.orderNumber, label),
    href,
  );
}

/**
 * PC-1 — "new messages waiting" for a conversation with no order attached.
 *
 * ⚠ Same 15-minute debounce as the order variant, applied by the caller
 * (`notifyThreadMessage` → `shouldSendDebouncedEmail`), and for a reason the
 * user stated directly on 2026-08-19: **no per-message email, ever.** A
 * persistent thread invites long back-and-forths, so one mail per message
 * would be both a mailbox and a storage problem. The debounce is what keeps a
 * fifty-message evening to a handful of mails.
 */
export async function sendNewThreadMessagesEmail(
  to: string,
  locale: EmailLocale,
  details: { threadId: string; counterpartLabel: string | null; audience: "CLIENT" | "SELLER" },
): Promise<void> {
  const s = STRINGS[locale];
  const label = details.counterpartLabel ?? s.genericCustomer;
  const text = s.newThreadMessagesBody(label);
  const href = details.audience === "SELLER" ? sellerThreadUrl(details.threadId) : buyerThreadUrl(details.threadId);
  await sendSimple(to, s.newMessagesSubject, s.newMessagesHeading, `<p>${escapeHtml(text)}</p>`, s.viewConversation, text, href);
}

