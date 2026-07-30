# Apoyo Food — Architecture & Implementation Plan (v1.0, 2026-07-19)

Working name: **Apoyo Food** (`food.apoyolime.com`). Sibling document to Apoyo-Salon's `Salon_Apoyo_Implementation_Plan.md` — same spirit: architecture and scope decided on paper before code. Source of product truth is `Idea.md` (this repo); this document turns that vision into an ecosystem-integrated, phased architecture whose **earliest phases produce a polished, demoable MVP** and whose later phases layer in the advanced features without redesign.

**Guiding question, applied to every decision below** (from `Idea.md`):

> "Does this feature help independent food creators earn more reliable income without significantly increasing operational burden or food waste?"

**Session-locked inputs (from `FABLE_ARCHITECTURE_PROMPT.md` — do not re-litigate):** full ecosystem integration from day one · cash/offline settlement only, all phases · Next.js + Prisma + Postgres 16 on the shared VPS, own repo/DB/PM2 process · zero real users (breaking changes free) · object storage + CDN for media · area/region picker for location, geocoding later · seller verification deferred · reviews deferred · name is "Apoyo Food".

---

## Part A — Mission & Positioning

Apoyo Food is a **discovery-and-relationship marketplace** for independent food creators in Trinidad — home cooks, bakers, dessert makers, caterers, juice/smoothie makers, BBQ vendors, holiday specialists, weekend-only sellers — most of whom currently sell through Instagram/WhatsApp with no discoverable presence beyond their existing followers.

It is explicitly **not** a delivery platform (no Uber Eats/DoorDash mechanics, no logistics, no platform-managed delivery, no restaurant directory). Fulfillment — pickup, seller delivery, or meet-up — is arranged between seller and customer; the platform's job ends at connecting them and structuring the order.

**Two-sided value proposition:**
- **Customers:** "Where can I discover amazing food made by local independent creators?" — a premium, photography-forward browsing experience (Airbnb/Pinterest/Instagram energy, not a dense delivery-app grid).
- **Sellers:** "How can I consistently find more customers without relying entirely on Instagram or WhatsApp?" — discoverability, a following that belongs to them, lightweight engagement (the "Fresh Today" board — Part E2) that doesn't force inventory pressure, and eventually demand insights that tell them *what to cook* to earn more.

**Anti-waste stance is structural, not a feature:** availability is flexible windows ("weekends", "by pre-order", "holiday only") rather than live inventory, and the Fresh Today board communicates presence without promising stock. A seller never has to cook speculatively to look alive on the platform.

Part of the **apoyolime.com** ecosystem (mission: reliable income for Spanish-speaking immigrants in Trinidad through digital tools), alongside Apoyo Salon (beauticians), Apoyo Portal (cross-vertical claims/scheduling + provider launchpad), and the Apoyo-Demia app (Demia/Social — shared identity issuer, mid-migration to portal-web per the foundation program).

---

## Part B — Relationship to Existing Systems

Same discipline as Salon's plan: explicit about literal shared dependency vs. copied-and-adapted pattern vs. deliberately not reused.

### B1 — Shared infrastructure (literal dependencies)

- **Identity & auth.** One account across the ecosystem. Food never issues sessions — it validates the shared JWT cookie locally (`next-auth/jwt` `getToken` + shared `AUTH_SECRET`, `COOKIE_DOMAIN=.apoyolime.com`) and renders its own login/register forms that submit to the **central issuer's** endpoints in the background. ✅ **Resolved 2026-07-30 (was open question 3):** the foundation-program migration is done — **portal-web is the sole session issuer**, confirmed live by Apparel's Slice 3 build against a production instance. Wire directly against portal-web; no need to re-check `FOUNDATION_SLICES.md` for the current issuer. **Pin `next-auth` to `5.0.0-beta.31`** — the exact version all four existing apps (Apoyo-Demia, portal-web, Salon, Apparel) resolve to; Salon and Apparel pin it explicitly in `package.json`, but Apoyo-Demia and portal-web still declare the floating `"beta"` tag, a real latent risk (a fresh `npm install` there could resolve a newer beta and silently break cross-app JWT decode for every vertical, Food included — not Food's bug to fix, but worth knowing before debugging a decode failure that isn't Food's own code).
- **Membership registry.** `(FOOD, CLIENT)` granted lazily on first authenticated Food action; `(FOOD, PROVIDER)` created through provider registration per ecosystem decision 14 (below). Memberships/users endpoints are Apoyo-Demia-hosted (tie-up #7) — ⚠ **also present in portal-web** (both read the same identity DB, nginx path-splits which answers), so any allowlist/validator change belongs in **both** copies, not one. Food carries **two separate bearer tokens** (`ECOSYSTEM_SERVICE_TOKEN` for the Apoyo-Demia app memberships, `PORTAL_CLAIMS_SERVICE_TOKEN` if/when claims are ever used) per the confirmed same-name-different-value gotcha in `APOYO_ECOSYSTEM.md`. **Never authorize off the JWT's `memberships` claim** — it's refreshed only on token re-issue, proven stale in Apparel's own Slice 3 verification (a guard trusting it would have denied a seller the dashboard they'd just created); read the live ecosystem API instead, exactly as `requireApparelSeller` does.
- **Decision-14 registration policy applies verbatim:** clients register on every vertical (Food's own register form → central issuer); **seller (provider) registration is toggle-gated in the identity DB and lives on Portal's provider registration surface.** ⚠ Decision 15 already retired this toggle's authorization role — the `vertical_registration_config` row gates **CTA visibility only**, not authorization; real gating happens at Food's own onboarding-submit. ✅ **Partially done already, found 2026-07-30:** the `Vertical` enum's `FOOD` value and portal-web's `SelectableVertical` type / §6b config endpoint **already list FOOD** — added for free alongside Apparel's Slice 3 (one migration event, both future verticals, no second deploy-time event against the shared identity DB). **Still Food's own cross-repo work at build time** (allowed under decision 13 with same-session user permission, disclosed when it happens): (a) seed a `vertical_registration_config` row for `FOOD` — a **separate migration** from any future enum change, since Postgres refuses to use a newly added enum value inside the transaction that added it; (b) add `"food-app": ["FOOD"]` to the hardcoded `APP_VERTICAL_SCOPE` allowlist in `lib/ecosystem-auth.ts`, **in both** Apoyo-Demia and portal-web — the enum value existing doesn't mean any given caller may write it, these are two independent gates; (c) register a **new, distinct** `food-app:<secret>` entry in `ECOSYSTEM_SERVICE_TOKENS` before Food's first live ecosystem call (never reuse another vertical's token — it would make the two apps' calls indistinguishable in logs and couple their rotation).
- **Transactional email: Resend** (ruling E1) — `apoyolime.com` domain already verified; Food's `.env` gets its own Resend SMTP creds. E1's send-only caveat re-checked for Food: order lifecycle emails (received/accepted/declined) don't expect replies — conversation happens in the order thread — so send-only holds. ✅
- **Translation: `kap64-translate`** shared HTTP service (`TRANSLATE_SERVICE_URL`), called via the established `lib/translate.ts` pattern — used for order-thread messages (Part E6). This is mission-critical, not a nicety: many sellers are Spanish-first, many customers English-first.
- **VPS/deploy conventions:** `/home/user/web/food.apoyolime.com/private/apoyo-food`, non-root **`user-pm2`** daemon (ruling E2 — never root's), Hestia nginx template copied from `salon.tpl` pattern, portal-domain include drop-in for the dashboard path, `deploy.sh` per the E5 pattern (with Salon's env-var completeness check), `.gitattributes` `*.sh text eol=lf` from the first shell script (E4). Every port below is **provisional until `ss -tlnp` at deploy time** (E3).

### B2 — Copied-and-adapted patterns (own tables, own code — no shared business data)

- **URL topology (Salon's locked model):** `food.apoyolime.com` is **client-facing only**; the seller dashboard is served at **`portal.apoyolime.com/food/…`**, built/owned/deployed from this repo, reached via nginx path routing on the portal domain. Consequence inherited from Salon Phase 0: dashboard routes physically nested under `/food` from the first commit, `assetPrefix` pointed at Food's own host, middleware host-gates both surfaces.
- **SVG Trinidad region map** (`region-map.tsx`, `lib/tt-region-paths.ts`, the 8 `RegionKey` values: `north_west, east_west_corridor, central, south_central, south_west, north_east, south_east, tobago`) — ported as Food's area picker and area-browse UI. **Reusing `RegionKey` verbatim** keeps a seller's declared areas consistent if they're active across verticals, and leaves room for a lat/long column to sit alongside later (locked location decision).
- **Provider status/approval pattern** (`PENDING → ACTIVE/SUSPENDED` gate with an admin queue) — ported from Salon/Demia's `ProviderStatus` shape. Lightweight: no document verification in MVP (locked decision — formal vetting is Phase 9), but the admin gate itself is kept because it's cheap and protects marketplace quality from day one.
- **Message shape with stored translations** (Salon's locked chat message shape): `originalText`/`originalLocale` + translations stored on the message, computed once — reused for Food's order-thread messages (Part E6), *without* porting the realtime WebSocket transport in MVP (deliberate — Part C).
- **Bilingual EN/ES via `next-intl`**, cookie locale, namespaced messages — same stack as the Apoyo-Demia app and Salon.
- **Expiry sweep job pattern** (`demiadoll-expire-submissions` / Salon's sweep) — reused for Story expiry and stale-order expiry. PM2 gotchas pre-inherited: `--interpreter none` for tsx-run scripts; `ecosystem.config.cjs` naming if `"type": "module"` (E8).

### B3 — Deliberately NOT reused

- **The booking-calendar/slot engine and the `TimeClaim` claims integration.** This is the biggest architectural divergence from Salon, decided here explicitly: **Food orders are not exclusive-time appointments.** A baker fills many orders in one morning; accepting an order does not make the seller unavailable to anyone else. There is no slot to contend for, so the cross-vertical double-booking hard block (decision 9) has nothing to protect on the Food side — pushing `TimeClaim`s per order would add operational burden (the guiding question fails it) and semantic nonsense (a claim would falsely block a Food seller's Salon appointments). **Food pushes no claims in any phase of this plan.** Documented escape hatch: if a future feature involves genuinely exclusive seller time (on-site catering service, cooking classes), *that feature* claims time through the portal — the order model below keeps a clean seam for it (`FoodOrder.fulfillmentAt` is already a timestamp).
- Demia's safety machinery (one-time-view images, blur, censor regions, GPS check-ins) — no equivalent need.
- Salon's guided-hybrid `DIRECT/OPTIONS/QUOTE_REQUIRED` instant-booking triad — Food's ordering is uniformly request→accept (Part E5); simpler, and correct for made-to-order food.
- Payment gateway (WAM or otherwise) — locked out for all phases here.

---

## Part C — Architecture Decisions

- **Stack:** Next.js 15 (App Router) + TypeScript + Tailwind, PostgreSQL 16 + Prisma, `next-intl`. Matches ecosystem convention (locked). Reads via React Server Components hitting Prisma directly; mutations via REST-ish route handlers under `/api/*` (Salon's convention — keeps the API surface documentable and testable with curl).
- **Own database** (`apoyo_food`) + own role, on the shared Postgres 16 — with the `GRANT ALL ON SCHEMA public` step and percent-encoded password (documented gotchas). No cross-database FKs: identity `userId`s are opaque strings, exactly as Salon models them.
- **PWA from the MVP** (manifest, icons, installability, offline shell for the browse surface) — `Idea.md` names PWA in the design direction and the target audience is mobile-first. Push notifications are Phase 9 (needs service-worker push plumbing + permission UX; email + in-app cover MVP).
- **Media: storage abstraction first, R2 as the documented migration path — not a Phase-0 dependency.** ✅ **Corrected 2026-07-30 (was open question 2):** Apparel hit this exact question building alongside Food and found the R2 account **still doesn't exist**; a demo must not block on provisioning one. Food adopts the same call Apparel made: `lib/storage.ts` behind a small interface, **local disk by default** (the same proven pattern as Salon/Portal/Apparel — `UPLOADS_BASE_PATH` + an app-served route, zero setup), swapped for Cloudflare R2 + a CDN custom domain (e.g. `media.apoyolime.com`) once the account exists. R2 remains the right long-term answer (zero egress fees, image-heavy app) and the interface makes that swap a one-module change, not a rewrite. Server-mediated uploads regardless of backing store (browser → Food API → validate → `sharp` variants → storage), not presigned direct-to-bucket — simpler auth, and it guarantees the variant pipeline and EXIF stripping (Part G) always run. Variants per image: `thumb` 400w, `card` 800w, `full` 1600w, plus a stored blur placeholder (base64 LQIP) — the premium-feel loading experience depends on this. `next/image` with a custom loader pointed at whichever backing store is active.
- **Location: `RegionKey` area picker** (locked). Sellers declare 1–3 service areas (multi-area, mirroring Salon's Round-3 lesson that mobile providers span regions); listings inherit the seller's areas; customers filter by area. Schema carries nullable `lat`/`lng` columns on `FoodSeller` from day one so Phase-10 geocoding is additive, never a migration of meaning.
- **Ordering transport: async order-thread messages, not realtime WebSocket chat, in MVP.** Rationale against ecosystem decision 10 (chat = standalone ws process per vertical): that decision governs *how* a vertical does realtime chat, not *whether* MVP needs it. Food's order conversation ("can you do Saturday instead?", "less pepper please") is low-frequency and asynchronous by nature — polling/refresh on the order page + email/in-app notification per message serves it fully, with stored translations (B2) crossing the language barrier from day one. The ws process (ports reserved: **:4006 ws / :4007 sidecar — provisional per E3**) arrives in Phase 9 as a transport upgrade to the *same* message table; no schema change.
- **Demand-signal logging starts the moment browse ships (Phase 1), not when the insights UI ships (Phase 6).** The signature seller-insights feature is only as good as its history; events are cheap to log and expensive to backfill (impossible, actually). One append-only `FoodDemandEvent` table from the start.
- **Timezone:** store UTC `timestamptz`; all display/date math fixed `America/Port_of_Spain`, no DST logic (ecosystem convention).
- **Ports (provisional, E3 discipline — `ss -tlnp` is the only authority at deploy time):** food-web **:3012** (3000 the Apoyo-Demia app, 3003 salon-web, 3010 apoyo-portal, 3011 portal-web, 3013 apparel-web known taken); ws :4006/:4007 reserved for Phase 9. Local dev Postgres on host port **5434** (5432 = Beauty-Salon container, 5433 = Salon's, 5435 = Apparel's).
- **Repo layout:** this repo (`Apoyo-Food`) is the app repo; docs stay at root alongside the scaffold (Salon's pattern).

---

## Part D — Data Model (Food-owned, `Food*` prefix)

Draft shapes — fields/enums decided, names polishable. All `userId`/`clientId` fields are opaque identity-store strings, no cross-DB relation.

### Enums

- `SellerStatus`: `PENDING | ACTIVE | SUSPENDED`
- `ListingKind`: `SINGLE_ITEM | MENU | PACKAGE | TRAY | CUSTOM` — covers Idea.md's selling models without privileging one: individual meals (`SINGLE_ITEM`), daily/weekly menus (`MENU` + availability windows), meal/family packages (`PACKAGE` + `feedsCount`), party trays (`TRAY`), custom orders (`CUSTOM` + `QUOTE` pricing). Holiday specials / limited-time offers are **orthogonal** — any kind + a `DATE_RANGE` availability window + optional `occasionTag`.
- `PriceMode`: `FIXED | STARTING_AT | QUOTE`
- `AvailabilityType`: `PREORDER` (with `leadTimeDays`) | `RECURRING_WEEKLY` (with `daysOfWeek` bitmask) | `DATE_RANGE` (with `startsOn`/`endsOn`)
- `FulfillmentMode`: `PICKUP | SELLER_DELIVERY | MEETUP`
- `OrderStatus`: `PENDING → ACCEPTED → COMPLETED`, terminal alternatives `DECLINED | CANCELLED_BY_CUSTOMER | CANCELLED_BY_SELLER | EXPIRED`
- `DemandEventKind`: `SEARCH | LISTING_VIEW | PROFILE_VIEW | SAVE | FOLLOW | ORDER_PLACED | STORY_VIEW`
- `NotificationKind`: `ORDER_PLACED | ORDER_ACCEPTED | ORDER_DECLINED | ORDER_MESSAGE | ORDER_REMINDER | NEW_FOLLOWER | STORY_FROM_FOLLOWED | …` (extensible)

### Core entities

- **`FoodSeller`** — `userId` (unique), `slug`, `displayName`, `bio`, `profileImage*`, `coverImage*`, `areas RegionKey[]` (1–3), `lat?`/`lng?` (Phase 9), `languages string[]`, `specialties string[]`, `status SellerStatus`, `fulfillmentModes FulfillmentMode[]` (which of the three they offer at all), `followerCount` (denormalized counter), `createdAt`. Relations: listings, stories, highlights, galleryPhotos, orders, followers.
- **`FoodSellerPhoto`** — gallery images: `sellerId`, image paths (all variants), `sortOrder`, `caption?`.
- **`FoodCategory`** — seeded taxonomy, admin-extendable: `slug`, `nameEn`, `nameEs`, `heroImage?`, `sortOrder`, `seasonal boolean`, `occasionTag?` (`christmas | mothers_day | easter | divali | eid | carnival | …`). Seed list: Desserts, Breakfast, Lunch, Dinner, Drinks, Snacks, Baked Goods, BBQ & Grill, Catering, Juices & Smoothies, Holiday Specials, Vegetarian/Vegan.
- **`FoodListing`** — `sellerId`, `slug`, `title`, `description`, `kind ListingKind`, `priceMode`, `priceCents?` (TTD), `feedsCount?`, `dietaryTags string[]` (`vegetarian, vegan, gluten_free, halal, no_pork, nut_free, …`), `ingredientTags string[]` (search fuel), `occasionTag?`, `active boolean`, `createdAt`. Relations: photos (ordered, first = hero), categories (m2m via `FoodListingCategory`), availabilityWindows, orderItems, saves.
- **`FoodListingPhoto`** — `listingId`, variant paths + `blurDataUrl`, `sortOrder`.
- **`FoodAvailabilityWindow`** — `listingId`, `type AvailabilityType`, `daysOfWeek?`, `startsOn?`, `endsOn?`, `leadTimeDays?`, `note?` ("orders close 4pm Friday"). Multiple windows per listing. "Available today/tomorrow/this weekend" badges and filters are **computed** from windows — never a live-inventory flag (anti-waste stance).

### Engagement entities

⚠ **Naming note (2026-07-30):** the models below keep their `FoodStory*` names — renaming them would be pure churn with no functional benefit, "story" is an accurate generic technical description of ephemeral timestamped content regardless of the UI metaphor. Everything **user-facing** is reframed as the **"Fresh Today" board** per the Sobremesa design system (Part F3) — see Part E2 for the full rationale and component naming.

- **`FoodStory`** — `sellerId`, image variants + blur, `caption?`, `linkedListingId?` (optional tap-through to a listing — the "fresh cookies just finished" → order path), `createdAt`, `expiresAt` (createdAt + 24h), `highlightId?` (null = ephemeral; set = kept on profile). Photos + short text in MVP; video is out of scope this plan.
- **`FoodStoryHighlight`** — `sellerId`, `title`, `coverImage?`, `sortOrder` — named groups on the profile, presented as the **"Menu shelf"** ("Especialidades", "Festivos", "Christmas 2026").
- **`FoodStoryView`** — `storyId`, `userId`, `viewedAt` (`@@unique([storyId, userId])`) — powers seen/unseen rings and gives sellers a simple reach number.
- **`FoodFollow`** — `userId`, `sellerId`, `createdAt` (`@@unique`), with counter maintenance on `FoodSeller.followerCount`.
- **`FoodSave`** — `userId`, `listingId`, `createdAt` (`@@unique`) — the one-tap heart; ships in Phase 1.
- **`FoodCollection` / `FoodCollectionItem`** — named groupings of saves ("Birthday ideas", "Christmas") — Phase 4.

### Ordering entities

- **`FoodOrder`** — `orderNumber` (short human code, e.g. `FD-4821`), `clientId`, `sellerId`, `status OrderStatus`, `fulfillmentMode`, `fulfillmentAt timestamptz` (requested date/time — *the claims seam*, B3), `fulfillmentAreaOrNote` (meet-up point / delivery area as free text — exact addresses live in the thread after acceptance, Part G), `subtotalCents?` (null for QUOTE items until seller confirms price), `customerNote?`, `respondBy timestamptz` (auto-expiry deadline for PENDING, default 24h, sweep-enforced), `createdAt`, status timestamps (`acceptedAt` etc.). ⚠ **Price at acceptance is the agreed price** — seller can adjust line prices (quote items, substitutions) before accepting; customer sees the final figure in the acceptance notification. Cash/offline settlement; the platform records the agreed amount for both parties' history and (later) seller analytics, and never touches money.
- **`FoodOrderItem`** — `orderId`, `listingId`, `titleSnapshot`, `priceCentsSnapshot?`, `quantity`, `note?` ("no peppers"). Snapshots make history immune to listing edits.
- **`FoodOrderMessage`** — `orderId`, `senderUserId`, `originalText`, `originalLocale`, `translations Json` (locale → text, computed once via kap64-translate), `attachmentPath?` + `attachmentKind?` (`PHOTO`), `createdAt`, `readAt?`. One thread per order, no separate thread entity needed in MVP.

### Platform entities

- **`FoodNotification`** — `userId`, `kind`, `payload Json` (ids/titles for rendering), `readAt?`, `emailedAt?`, `createdAt`. In-app inbox + the email fan-out marker.
- **`FoodDemandEvent`** — append-only: `kind DemandEventKind`, `userIdHash?` (salted hash — dedup/repeat analysis without raw identity in the analytics table), `area RegionKey?`, `query?` (raw), `queryNormalized?` (lowercased, unaccented, trimmed), `resultCount?`, `listingId?`, `sellerId?`, `categorySlug?`, `createdAt`. Indexed on `(kind, createdAt)`, `(queryNormalized, createdAt)`, `(area, kind, createdAt)`. Feeds trending (Phase 6) and seller insights (Phase 7). Retention: raw events pruned after ~13 months (year-over-year seasonality preserved), aggregates kept forever.
- **`FoodListingStats`** — materialized rollups per listing (`views7d`, `saves7d`, `orders30d`, `trendScore`), refreshed by the sweep job — Phase 5; until then trending is computed live from indexed `FoodDemandEvent` queries.

### Later-phase entities (designed now, built later)

- **`FoodCustomerRequest`** (Phase 8) — `clientId`, `title`, `description`, `area RegionKey`, `neededBy?`, `categorySlug?`, `status (OPEN | FULFILLED | EXPIRED | CLOSED)`, `expiresAt`. **`FoodRequestResponse`** — `requestId`, `sellerId`, `message`, `linkedListingId?`, `createdAt`. Client picks a response → converts into a normal `FoodOrder` (reuses the whole order machinery — that's why requests come after ordering matures).
- **`FoodReview`** (Phase 7) — `orderId` (unique — one review per completed order, purchase-verified by construction), `clientId`, `sellerId`, `rating 1–5`, `comment?`, `createdAt`. Public immediately, reactive moderation (Salon's Round-3 precedent). Publishes a **rating event to portal-core** per the E7 reputation direction — check the portal's event contract at build time.
- **`FoodSellerVerification`** (Phase 9) — ports Salon's document-verification shape and its locked private-bucket storage policy wholesale.

### Entity-relationship summary

Identity store (external) →1:1→ `FoodSeller` →1:N→ `FoodListing` →1:N→ photos / availability windows / order items · `FoodListing` ↔M:N↔ `FoodCategory` · `FoodSeller` →1:N→ `FoodStory` (→N:1 optional→ highlight) · users →N:M→ sellers via `FoodFollow`, →N:M→ listings via `FoodSave` · `FoodOrder` →N:1→ seller + client, →1:N→ items + messages · `FoodDemandEvent` is append-only with soft (unenforced) references — analytics must survive entity deletion.

---

## Part E — Subsystem Designs

### E1 — Discovery architecture

Discovery = **composed sections over indexed queries** — no ML, no feed engine; each home/browse section is a named, cacheable query. This is the deliberately boring architecture that still demos spectacularly with good photography.

Home page sections (each a horizontal card rail or grid block, order tunable):
1. **Fresh Today rail** — followed sellers first (unseen first), then recently-active sellers.
2. **Available this weekend / today** — computed from availability windows.
3. **Browse by category** — category cards with hero imagery.
4. **New this week** — newest active listings.
5. **Trending** — Phase 1: recent-views proxy; Phase 5: real `trendScore`.
6. **Sellers near you** — area match on the customer's chosen region (persisted in cookie/profile).
7. **From sellers you follow** — signed-in, following ≥1.
8. **Seasonal** — occasion-tagged rail, auto-shown inside a configurable window around each occasion.

Browse perspectives (Idea.md's list, each a route): meals grid with filters (category, area, price band, dietary, availability, sort by newest/popular) · sellers directory (region-map picker + cards) · category landing pages · nearby (area filter shortcut) · recently added · trending · following. All server-rendered, filter state in URL params (shareable links — organic marketing surface).

### E2 — "Fresh Today" board (reframed 2026-07-30, was generically "Stories")

Per the Sobremesa design-lead conversation (`Emergent Conversation Snippets.md`): functionally, ephemeral 24h content with tap-to-advance is a widely-used UI convention, not Instagram-owned IP — no legal issue in copying its mechanics. The real risk was **looking derivative** and importing a social-media metaphor that doesn't fit a food marketplace. So the mechanics stay (Part D's `FoodStory*` models, unchanged — see the naming note above), but the presentation is reframed end to end as a **daily specials board**, not a stories rail:

- **Create** (dashboard, ≤3 taps): photo → optional caption → optional linked listing → post. No scheduling, no editing after post (delete + repost) — keep the surface tiny.
- **Card anatomy — the signature difference from a generic Stories rail:** rounded-**rectangular** cards, not circular avatar rings — food thumbnail, seller name, a small teal freshness dot + steam-wisp icon, and the availability window rendered directly on the card ("9:00–15:00", "Pre-order"). The card conveys *what's fresh right now*, not just *that someone posted*.
- **Expiry:** 24h via `expiresAt`; `food-sweep` (PM2 cron pattern — see Part I) marks/clears expired entries every few minutes. Highlighted entries persist on the profile grouped under `FoodStoryHighlight`, presented as the **"Menu shelf"** — labeled rectangular cards ("Especialidades", "Festivos", "Postres", "Reseñas") on a subtle shelf, not IG highlight circles.
- **View:** full-screen viewer, tap-advance/swipe (seller → seller), progress bars, view-tracking per entry, linked-listing CTA ("View this dish →"). Seen/unseen state from `FoodStoryView`, shown as a **card border treatment**, not a ring.
- **Distribution:** the **Fresh Today rail** ("En la cocina hoy") on home (followed-first), the same freshness-dot treatment on seller cards/profiles. Posting bumps the seller's recent-activity signal (a `FoodDemandEvent` is *not* used for this — a simple `lastStoryAt` on the seller is enough).
- **Explicitly not live inventory** (Idea.md): no stock counts, no "sold out" mechanics — an entry is presence and appetite, orders still flow through listings. Notifications for new posts from followed sellers: in-app from the phase that ships follows (Part I); push in a later phase; **never email** (too chatty — guiding question: seller visibility must not become customer annoyance).
- **Component naming:** `<FreshTodayRail>`, `<FreshTodayCard>`, `<FreshTodayViewer>`, `<MenuShelf>` — not `StoryBar`/`StoryRing`/etc. Keeps the codebase's naming honest to what's actually shown, even though the underlying Prisma models stay `FoodStory*`.

### E3 — Search architecture

Postgres-native, no external engine (avoid overengineering — right-sized for a single-island marketplace):
- **Matching:** `unaccent` + `pg_trgm` similarity over listing `title` + `ingredientTags` + seller `displayName`/`specialties`, combined with a `simple`-config `tsvector` (bilingual content makes language-specific stemming configs unreliable; trigram fuzziness compensates, and handles Trinidad spelling variance — "pelau/pilau", "geera/jeera").
- **Filters compose with text:** category, area, price range, dietary tags, availability window, sort (relevance | newest | popular | price).
- **Instrumentation:** every search logs a `FoodDemandEvent(SEARCH)` with normalized query + result count + area — **zero-result searches are the single most valuable signal in the system** (they are literally "unmet demand near you", the Phase-7 insights headline).
- Phase 1 ships title/tag search + filters; Phase 5 adds the trigram indexes, typo tolerance, search-as-you-type suggestions, and "no results → here's what's close / post a request (Phase 8)".

### E4 — Recommendation engine (phased, honest)

- **Phase 1 (rule-based, demo-ready):** "More from this seller" · "Similar in {category}" · "Popular in your area" (view/save counts). Deterministic, explainable, no cold-start problem.
- **Phase 4 (behavioral):** "Order again" / "Recently ordered" / "Your favourite sellers" (own history — highest-converting recs in any food product, and trivially cheap). "Customers who saved this also saved…" (co-save counts, precomputed by sweep).
- **Deliberately never (this plan):** collaborative-filtering ML — the island-scale data volume won't support it and the rule-based stack already answers Idea.md's repeat-customer goals.

### E5 — Ordering / booking workflow

Request→accept, uniformly (no instant-book — made-to-order food always needs seller confirmation):

1. **Customer:** listing → "Request order" → items+quantities+notes → fulfillment mode (of the seller's offered modes) → requested date/time (validated against the listing's availability windows + lead time) → note → sign-in gate here if anonymous (Salon precedent: browse anonymous, commit authenticated) → submit. Order lands `PENDING` with a visible `respondBy` (default 24h).
2. **Seller:** notified (email + in-app) → views order → may message (auto-translated thread), adjust quote-item prices → **Accept** (locks agreed price, notifies customer, exchanges fulfillment details in thread) or **Decline** (reason optional). No response by `respondBy` → sweep marks `EXPIRED`, customer notified and nudged toward similar sellers — a request must never die silently (trust).
3. **Completion:** seller marks `COMPLETED` on/after `fulfillmentAt` (sweep nudges if forgotten). Cash/offline settlement invisible to the platform beyond the recorded agreed price. `COMPLETED` is the hook for reviews (Phase 7) and repeat-customer recs (Phase 4).
4. **Cancellation:** either party before fulfillment, always with a notification; free-form reason. No penalties in this plan — reputation features (Phase 7+) are the eventual pressure.

Multi-seller carts: **out of scope permanently** — one order = one seller = one conversation = one fulfillment arrangement. A "cart" is just the item list within a single seller's order request.

### E6 — Order messaging & notification architecture

- **Thread:** `FoodOrderMessage` per order; translations stored on the message at send time (kap64-translate, `lib/translate.ts` pattern); photo attachments (e.g. cake-design references). Transport: fetch-on-load + light polling on the open order page (MVP) → ws upgrade Phase 9, same table.
- **Notification pipeline:** domain event → `FoodNotification` row (in-app inbox, unread badge) → email fan-out via Resend for the kinds that warrant it (order lifecycle: yes; each thread message: batched/debounced — at most one "new messages waiting" email per order per ~15 min; new Fresh Today post: never). `emailedAt` on the row makes fan-out idempotent and crash-safe. Phase 9 adds web-push as a third channel on the same rows; SMS/WhatsApp remain future exactly as Idea.md scopes them.

### E7 — Seller analytics & insights (the signature feature, Phase 6)

Two layers on the same `FoodDemandEvent` stream (logged since Phase 1 — Part C):
- **Dashboard (descriptive):** orders (count/value/status funnel), followers over time, profile/listing views, saves, top listings, repeat-customer rate (distinct returning `clientId`s), Fresh Today reach.
- **Insights (actionable — the income engine):**
  - *Unmet demand:* frequent normalized searches in the seller's areas with zero/low results, cross-referenced against what the seller doesn't offer — "People near you searched for cheesecake 23× this month; nobody nearby sells it."
  - *Demand timing:* search/order volume heatmap by day×hour — "Most orders near you are requested Friday evening for Saturday."
  - *Seasonal runway:* occasion-tag demand curves from last year — "Christmas searches started climbing Nov 10 last year; open your holiday menu."
- **Anonymity is architectural:** insights read only aggregates over `userIdHash`, never identities; every published aggregate enforces a k-anonymity floor (suppress any cell with <5 distinct hashes) so "searched near you" can never be reverse-engineered into "your neighbor searched". Recommendations phrased as actions ("add a cheesecake listing"), not charts — Idea.md: income, not analytics.

### E8 — Customer requests workflow (Phase 8)

Customer posts a request (title, description, area, needed-by, category) → visible on a requests board filtered to sellers' areas + in a dashboard tab → sellers respond (message + optional linked listing) → customer converts a chosen response into a normal `FoodOrder` (full machinery reuse: thread, notifications, lifecycle). Auto-expiry via sweep; responses capped per request (~5, first-come) so it never becomes a race-to-the-bottom bidding war — the customer picks, Salon's request-cap philosophy transplanted. Placed in Phase 9 deliberately: a request board before seller density is a ghost town that damages trust (guiding question fails it early; it shines once supply exists).

---

## Part F — Information Architecture, Sitemap, UX Flows

### F1 — Sitemap

**Client surface — `food.apoyolime.com`:**
```
/                      Home: hero, Fresh Today rail, discovery sections
/browse                Meals grid + filter sheet (category/area/price/dietary/availability/sort)
/browse/sellers        Seller directory: region map + seller cards
/categories/[slug]     Category landing (hero + filtered grid)
/meals/[slug]          Listing detail: gallery, price, availability, seller card, similar, [Request order]
/sellers/[slug]        Seller profile: cover, bio, areas, languages, specialties, highlights,
                       active listings, gallery, follower count, [Follow]
/stories/[sellerSlug]  Full-screen Fresh Today viewer
/search                Results (meals + sellers tabs)
/saved                 Saves (Phase 4: collections)
/orders  /orders/[id]  My orders · order detail + thread
/requests              Requests board (Phase 8)
/login /register /account /notifications
```

**Seller/admin surface — `portal.apoyolime.com/food/…`** (host-gated, path-nested from first commit):
```
/food                  Dashboard home (Phase 6 turns this into real analytics; MVP: order inbox + quick actions)
/food/orders[/[id]]    Order inbox (PENDING first) · detail: accept/decline/price-adjust/thread
/food/listings[/new|/[id]]   Listing CRUD: photos, kind, pricing, categories, dietary, availability
/food/stories          Post Fresh Today entry · active entries · Menu shelf manager
/food/profile          Profile editor: photos, bio, areas (region map), languages, specialties, fulfillment modes
/food/insights         Phase 6
/food/requests         Phase 8
/food/admin            Admin: seller approval queue, categories, (later) moderation
```

### F2 — Key UX flows (mobile-first)

- **Seller onboarding:** ecosystem sign-in → provider registration (Portal surface, decision 14, FOOD toggle) → guided profile setup (photo → cover → bio → areas on the Trinidad map → languages → specialties → fulfillment modes) → first listing wizard → `PENDING` → admin approves → live + prompted to post a first Fresh Today entry. Every step skippable-and-resumable — never force completeness before value.
- **Customer discover→order:** home/browse (anonymous) → listing → request order (sign-in gate at commit) → confirmation with `respondBy` expectation → notified on acceptance → thread for details → pickup/delivery/meet-up happens in the real world → completed.
- **Fresh Today loop:** seller posts in ≤3 taps → followers see the unseen card treatment → viewer → linked-listing CTA → order flow. The whole loop is the platform's engagement engine and must stay friction-free on both ends.

### F3 — Design system: "Sobremesa"

Adopted from the Emergent design-lead conversation (`Emergent Sobremesa spec.md`, `Emergent Conversation Snippets.md`) as Food's design authority — the sibling to Apparel's "Soft Studio," same family, different room. **Amended 2026-07-30**, same authority pattern as Apparel's own accent amendment: the Emergent spec's accent hexes could not clear WCAG AA as text (audit below) — the tokens here are corrected values, verified by direct contrast computation, not asserted.

⚠ **Mockup artifacts — do not reproduce** (found in `Emergent References/food (*).jpeg`, the same class of error Apparel's own mockups had): prices render in **€** — must be **`$X,XXX TTD`** everywhere; one mockup shows the browser chrome at `apoyofood.com` — the real domain is **`food.apoyolime.com`**. Render errors from the mockup tool, not design intent.

#### The accent audit — do not revert to the Emergent hexes

Measured directly (WCAG 2.1 relative luminance, computed — not estimated — for every pairing the spec's own components actually use: accent-as-text on each of the three surfaces, accent-as-text on its own soft-tint chip background, and cream-label-on-accent-fill for buttons): **all five accents failed, several badly.** `gold` was the worst — **1.94–2.12:1** as text or as a button fill with a cream label, against a 4.5 bar, short of even the 3.0 large-text floor (worse than Apparel's original clay at 2.78:1). `teal` (3.04–3.66:1) and `terracotta` (3.16–3.81:1) only ever cleared the large-text/bold floor, never normal text. Even `green` — the spec's own non-negotiable anchor color for navigation and every primary button — fell short at 4.11–4.48:1, missing 4.5 by a hair on the two lightest surfaces. The spec's own mitigation ("text only ≥18px or bold, or on soft-tint backgrounds") is the *identical* escape hatch that failed for Apparel's clay under measurement, so it wasn't trusted here without checking — and it didn't hold up.

**The fix, same method as Apparel's amendment: lightness only**, hue and saturation unchanged, deepened until each accent clears 4.5:1 against `--sunken` (the darkest of the three surfaces, and the binding case — clearing it means the other two surfaces and the accent's own soft-tint chip pairing clear too):

| Token | Emergent spec value | Corrected value | vs sunken | vs cream-bg | vs card | vs own `-soft` |
|---|---|---|---|---|---|---|
| `--green` (anchor) | `#5E7B4F` | **`#536D46`** | 4.52 | 4.98 | 5.44 | 4.69 |
| `--teal` | `#4E8C86` | **`#3D6D68`** | 4.59 | 5.07 | 5.53 | 4.66 |
| `--gold` | `#DDA24A` | **`#895C1A`** | 4.56 | 5.03 | 5.49 | 4.72 |
| `--terracotta` | `#C0654A` | **`#9A4C36`** | 4.76 | 5.25 | 5.72 | 4.52 |
| `--error` | `#B2503F` | **`#A54A3A`** | 4.52 | 4.99 | 5.44 | — |

Use the corrected values everywhere the accent is **text** (nav labels, primary-button labels, prices, status-chip text, links) or a **fill behind a cream/white label** (a button) — both are the same numeric check, since WCAG contrast is symmetric in its two inputs.

**`gold` moved the most** (`#DDA24A` → `#895C1A`, a deep amber rather than a bright honey) because its original was furthest from compliant. That's a real, visible change from the mockups' bright marigold — worth a deliberate look before Slice 1 locks it, the same way Apparel's own amendment was surfaced rather than silently applied.

**Every original hex is retained, not discarded**, as a `-vivid` fill-only token (ink text on top, never used as the text color itself — the same "keep the original as a fill token" move Apparel made with `clay-muted`):

| Token | Value | ink-on-fill |
|---|---|---|
| `--green-vivid` | `#5E7B4F` | 3.10 (large/bold labels & icons only) |
| `--teal-vivid` | `#4E8C86` | 3.80 (large/bold labels & icons only) |
| `--gold-vivid` | `#DDA24A` | **6.55** — the best of the four; the right choice for a status-chip *fill* with dark ink lettering ("Pendiente", "Por encargo") |
| `--terracotta-vivid` | `#C0654A` | 3.64 (large/bold labels & icons only) |

This resolves the availability-stamp and status-chip components exactly as the mockups intend (a vivid, saturated pill) while staying accessible: **stamps/chips render as ink text on a `-vivid` fill**, not as vivid text on a pale surface. The pre-existing `-soft` tint tokens (`green-soft` #E4EADC, `teal-soft` #DCE8E5, `gold-soft` #F5E6C9, `terracotta-soft` #F0DAD1) are unaffected — ink on any of them measured 10.97–11.98:1, no correction needed.

`ink-muted` (#6F675A) clears 4.5+ on `cream-bg`/`card` but drops to **4.37 on `sunken`** — avoid `ink-muted` body text on sunken surfaces (inputs, sunken cards); use full `ink` there instead.

#### Color tokens (final)

**Surfaces:** `--cream-bg` #F4EEE1 · `--card` #FCF8EF · `--sunken` #EBE3D3 · `--hairline` #E2D8C4
**Text:** `--ink` #2B2820 · `--ink-muted` #6F675A (cream-bg/card only, see above)
**Accents — text-safe, corrected:** `--green` #536D46 (anchor) · `--teal` #3D6D68 · `--gold` #895C1A · `--terracotta` #9A4C36 · `--error` #A54A3A
**Accents — fill-only, ink-on-top:** `--green-vivid` #5E7B4F · `--teal-vivid` #4E8C86 · `--gold-vivid` #DDA24A · `--terracotta-vivid` #C0654A
**Soft tints — backgrounds, ink text:** `--green-soft` #E4EADC · `--teal-soft` #DCE8E5 · `--gold-soft` #F5E6C9 · `--terracotta-soft` #F0DAD1

#### Category → accent theming (unchanged from the spec — only the colors were amended, not the rule)

**Anchor rule (non-negotiable):** navigation, active tab, primary buttons, and default CTAs are always `--green`, on every screen.

| Category | Accent |
|---|---|
| Savory / meals | `--green` |
| Desserts / baked | `--gold` |
| Drinks / juices / fresh | `--teal` |
| Holiday / seasonal specials | `--terracotta` |

Fixed roles regardless of category: `--teal` → Fresh Today freshness dot, follow actions, verification checks, region-map selection; `--gold-vivid` fill + ink text → status chips (Pending/New), trending badges; `--terracotta` → price text everywhere (the family tie back to Apparel's clay). A global accent may rotate for holidays (e.g. terracotta for Navidad) — affects headers/badges only, never navigation.

#### Typography

Headings: warm display serif (shared family logic with Apparel's Fraunces). UI/body: Inter / Instrument Sans (via `next/font` — this repo's path is `#`-free, no Apoyo-Demia-style font issue). Handwritten accent (e.g. Caveat) **only** for section labels like *"En la cocina hoy"* — never body, buttons, prices, or data; max 1–2 per screen. Scale (mobile): Display 28/34 · H1 22/28 · H2 18/24 · Body 16/24 · Label 14/20 · Caption 12/16. Weights 400 body · 500 labels/buttons · 600 headings.

#### Shape, elevation, motion

Rounder than Apparel, deliberately: cards 20px · images 16px · buttons & chips full-pill · inputs 14px. One soft shadow `0 3px 14px rgba(43,40,32,0.07)`. Motion 200–300ms ease-out; blur-up image reveal (blurDataUrl); the Fresh Today viewer opens full-screen with a soft fade. Never spinners on the browse surface — skeletons + blur-up only.

#### Imagery

Meal photos **4:3** · seller cover **16:9** · avatars & Fresh Today thumbnails **1:1**. Server-generated variants (thumb/card/full) + blur placeholder, EXIF/GPS stripped at ingest (Part G). 1–6 photos per listing; consistent cream framing unifies mismatched amateur phone photos — same principle as Apparel's cream-card 4:5 lock, different ratio because food wants abundance/table energy rather than a single hero-garment shot. **Photography is the design system** — hard image standards at upload (min resolution, aspect handling) and the blur-up pipeline are as load-bearing as any component.

#### Core components

`<MealCard>` (4:3 photo → dish name in serif → price in `--terracotta` → availability stamp → seller mini-row) · `<FreshTodayRail>` / `<FreshTodayCard>` / `<FreshTodayViewer>` (Part E2) · `<MenuShelf>` (Part E2) · availability **stamp** (market-stamp pill, ink text on a `-vivid` fill: *Fin de semana* green, *Por encargo · 2 días* gold, *Solo festivos* terracotta) · category pills (full-pill, tinted by category accent) · seller profile header (16:9 cover, overlapping round avatar, teal verification check, area/specialty chips, green *Seguir* button, follower count) · order-thread bubbles (original text prominent, smaller/lighter translation beneath, sender-aligned, cream/green tints) · status chip (Pending = gold-vivid fill + ink, Accepted = green, Declined = error, Completed = muted) · order-summary card (items, requested date/time in America/Port_of_Spain, fulfillment mode, subtotal) · sticky CTA bar (green primary: *Solicitar pedido* / *Aceptar*) · bottom tab bar (Home · Browse · Orders · Saved · Account, active = green) · region-map picker (warm illustrated Trinidad, selected area in teal — not a cold GIS map) · filter bottom sheets with pill toggles.

- **Bottom tab bar** (client, mobile): Home · Browse · Orders · Saved · Account. Sticky "Request order" CTA on listing pages (routes to a `<ComingSoon>` sheet until ordering ships — Part I). Filter UIs as bottom sheets, not sidebars.
- Anonymous browsing everywhere; auth gates only at commitment (order, follow, save) — Salon precedent, doubly right for a discovery product.
- Bilingual: design for **+30% Spanish text expansion**, no fixed-width labels; ES/EN toggle pill, top-right, always visible — bilingual as brand, not a hidden setting.
- **Accessibility:** WCAG AA (now genuinely achieved by the amended palette — see the audit above); tap targets ≥44px; visible focus; `font-display: swap`; lazy-loaded responsive images; Fresh Today content reachable without gesture-only navigation.
- PWA: manifest + icons + installability from the buyer-demo phase (Part I); offline = cached shell + last-viewed browse data (read-only); push is a later-phase item.

---

## Part G — Security & Privacy Considerations

- **Auth guards:** `getFoodSession()` (local JWT validation, `secureCookie` flag mirroring the issuer — Salon finding), `requireFoodSeller` (membership + `FoodSeller.status = ACTIVE`), `requireAdmin` (legacy `role === "ADMIN"` until the foundation program replaces it — re-check at build time). **Never write the legacy `role` field** (tie-up #1): sellers are `CLIENT` there + `(FOOD, PROVIDER)` membership.
- **Seller home-address privacy (food-specific, high-stakes):** profiles and listings expose **area only** — never an address field on any public surface. Pickup/delivery exact location is exchanged in the order thread **after acceptance** (Salon's address-in-chat decision, more critical here because pickup means customers visiting a home kitchen). **Strip all EXIF (including GPS) from every uploaded image at ingest** — home cooks photograph food *in their homes*; a geotagged photo is a doxxed kitchen. This is a hard requirement in the media pipeline, not a nice-to-have.
- **Media pipeline:** MIME sniff + size caps, `sharp` re-encode (defuses malformed-image payloads and strips metadata in one step), public bucket for listing/Fresh Today/profile media only; Phase-9 verification documents go to a **separate private bucket** under Salon's locked policy (signed URLs, admin-only, audit log, ~30-day retention).
- **Abuse controls:** rate limits on order creation, messages, Fresh Today posts, follows, and demand-event ingestion (per user + per IP); `respondBy` expiry keeps order spam self-cleaning; content reporting + admin hide (reactive moderation, Salon precedent) from Phase 3, alongside admin-shell composition.
- **Analytics privacy:** salted `userIdHash` only in `FoodDemandEvent`; k-anonymity floor on every published insight (E7); raw-event retention ~13 months.
- **Input/infra hygiene:** Zod on every route handler; Prisma (parameterized) throughout; secrets only in `.env` (never git, `.env.example` placeholders); two distinct ecosystem bearer tokens by distinct env names; app binds `127.0.0.1` (`next start -H 127.0.0.1` — E8 gotcha #3, env var does NOT work); nginx is the only public edge.
- **No payment data exists** — cash/offline settlement means no PCI surface at all in this plan.

---

## Part H — Future Extensibility (designed-for, not built)

- **Online payments:** `FoodOrder` already records agreed price + lifecycle; a payment record would attach to the order at acceptance. WAM integration exists in-ecosystem when wanted — needs its own compliance review first (Salon's flag applies verbatim).
- **Precise geocoding:** `lat`/`lng` columns already on `FoodSeller`; "nearby" swaps area-match for distance sort without schema change.
- **Realtime chat:** ws process (decision-10 pattern) replaces polling over the same `FoodOrderMessage` table; ports pre-reserved (provisionally).
- **Claims/scheduled services:** `fulfillmentAt` is the seam — an exclusive-time offering type would push `TimeClaim`s at acceptance (B3).
- **Subscriptions/meal plans:** a recurrence wrapper generating `FoodOrder` rows — the order stays the atomic unit.
- **Gift cards, loyalty, referrals, marketplace promotions:** all attach to existing entities (order, seller, user); none constrain today's schema.
- **Reputation:** `FoodReview` (Phase 7) publishes rating events to portal-core per E7 — Food consumes cross-vertical reputation when the portal serves it.

---

## Part I — Phased Build Order

**⚠ Restructured 2026-07-30 (user decision, following a pre-build readiness assessment): Food adopts Apparel's stub-shell build pattern.** This Part originally specified an all-real-functionality MVP (full seller onboarding, full ordering, full bilingual messaging+email, all real by Phase 4/Slice 15) with no stubbing concept — it predates the 2026-07-28 ecosystem ruling that both Food and Apparel ship as "visual demo" shells where unbuilt actions open a modal explaining the feature. Apparel proved the pattern live: a `<ComingSoon>` registry (one component + a localized feature-key registry — adding a stub is a one-line change, replacing a stub with the real feature is deleting one line) let it ship a fully real, polished **buyer** experience against **seeded fixture data** and reach a live public demo in 6 post-foundation slices, deferring real seller-side functionality (onboarding, listing creation, dashboard) to a second phase built for usefulness rather than visual polish. Food follows the same shape, adapted for its own feature set — most notably, ordering/messaging is a whole subsystem Apparel's MVP doesn't have at all, so it gets its own phase rather than folding into "seller story."

**Phases 0–3 are the demoable MVP.** Sliced for session-sized execution in `BUILD_SLICES.md`. Phases 4+ are architected above and sliced when reached.

- **Phase 0 — Foundation.** Scaffold with `/food` dashboard prefix + host gating from first commit; full Prisma schema + migrations; auth/ecosystem wiring against portal-web (confirmed sole issuer — Part B1); storage abstraction (local disk by default, R2 swap path documented, not built — Part C); i18n + translation-service wiring; deploy skeleton (Hestia domain, nginx, `user-pm2`, `deploy.sh`). *Cross-repo:* seed FOOD's `vertical_registration_config` row, add `"food-app"` to `APP_VERTICAL_SCOPE` in both Apoyo-Demia and portal-web, register a new `food-app` service token (Part B1) — the `Vertical` enum itself already has `FOOD` (landed with Apparel's Slice 3, no second migration needed).
- **Phase 1 — The buyer demo (the polished surface).** `<ComingSoon>` registry + Sobremesa component library (Part F3 — tokens audited before this phase starts, not after); **curated demo seed** (8–12 sellers, 40+ listings, availability windows, a spread of Fresh Today posts — authored directly through the real media pipeline, standing in for real seller content until Phase 2); home with the Fresh Today rail + discovery sections (Part E1); browse/filters/search + **demand-event logging starts here**; category landings; seller directory + region map; listing detail + public seller profiles (Menu-shelf highlights) + saves + rule-based recs; follows (real — a buyer action against seeded sellers); Fresh Today full-screen viewer; PWA manifest. The "Request order" CTA and any seller-facing action route to a `<ComingSoon>` sheet, styled not broken. **← VPS deploy: `food.apoyolime.com` is a publicly demoable discovery experience, seed-populated, on a phone.**
- **Phase 2 — The seller story (functionality-first, not polish-first).** Real seller onboarding + profile editor (region-map areas, languages, specialties, fulfillment modes) — replaces the seed-authoring path for any seller after launch; real listing CRUD + availability-window builder (`lib/availability.ts`); Fresh Today posting tools (create/expire, `food-sweep`) + Menu-shelf manager; basic seller dashboard (views/saves/follows counts — not the full Phase-6 insights feature); admin approval queue. Judged on working correctly, not on visual finish — mirrors Apparel's own Phase-2 framing.
- **Phase 3 — Real transactions & trust, admin composition, demo exit.** Full request→accept→complete order lifecycle (replaces the Phase-1 stub); order thread with stored translations + photo attachments; Resend email fan-out; in-app notifications inbox; `/food/admin` renders the **shared Apoyo admin shell** (mirror Salon/Apparel's approach: a copy of `lib/admin-nav.ts`, a client shell component, namespaced CSS — ⚠ call the RSC-payload guard before every admin page's first query, the leak class already found once in Portal and flagged in Apparel's own admin-composition plan); bilingual sweep, accessibility/perf pass, full production smoke test. **← MVP/demo exit: browse → follow → Fresh Today → order → thread → accept → complete, end to end, polished, live.**
- **Phase 4 — Saved & repeat.** (was Phase 5) Collections; order-again/recently-ordered/favourite-sellers recs; co-save recommendations.
- **Phase 5 — Search & trending, advanced.** (was Phase 6) Trigram indexes, suggestions, typo tolerance; `FoodListingStats` + `trendScore` materialization; seasonal automation windows.
- **Phase 6 — Seller dashboard & insights.** (was Phase 7) Full analytics dashboard; unmet-demand/timing/seasonal insights with k-anonymity enforcement — the signature feature.
- **Phase 7 — Reviews & reputation.** (was Phase 8) Post-completion reviews; portal-core rating events (E7 contract).
- **Phase 8 — Customer requests.** (was Phase 9) Board, seller responses, request→order conversion.
- **Phase 9 — Trust & reach.** (was Phase 10) Seller verification (Salon's document flow + private bucket policy); precise geocoding; web-push; ws chat upgrade.

### Open questions (tracked, non-blocking for Phase 0)

1. **Demo seed photography sourcing** — curated CC0/owned food photos uploaded through the real media pipeline (recommended: exercises the pipeline and looks right), or placeholder services? Needs a user decision before Phase 1's seed slice.
2. ✅ **Resolved 2026-07-30** (was: R2 account/custom domain) — storage ships as a swappable abstraction, local disk by default; R2 is deferred until the account exists, not a Phase-0 blocker (Part C).
3. ✅ **Resolved 2026-07-30** (was: foundation-program state at build time) — portal-web is confirmed the sole issuer and decision-14's registration surface already lists FOOD (Part B1); wire directly, no ambiguity to check at build time.
4. **Category taxonomy final pass** — seed list in Part D is a starting set (Trini-specific additions likely: Doubles & Street Food? Wild Meat? — user/community input welcome); admin-extendable so not blocking.
5. **`respondBy` default (24h) and Fresh Today lifetime (24h)** — provisional; revisit with real usage.
6. **`--gold`'s visible shift** (Part F3 — `#DDA24A` → `#895C1A` for text/nav use) is the biggest amendment the WCAG audit produced; worth a deliberate look at Slice 1, the way Apparel's own accent amendment was surfaced rather than silently applied.
