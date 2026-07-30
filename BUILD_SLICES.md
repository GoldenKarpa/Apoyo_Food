# Apoyo Food — Build Slices (Phases 0–3, the demoable MVP)

**Purpose:** `Apoyo_Food_Architecture.md` Part I Phases 0–3, sliced into prompt-sized work units. The user prompts one slice per session ("do slice N"); each slice ends runnable and verifiable. This file is the session-to-session tracker (Salon `BUILD_SLICES.md` / Apparel `BUILD_SLICES.md` style): when a slice completes, append its **Implementation notes** — decisions made, deviations, gotchas hit — so later slices inherit them.

**⚠ Restructured 2026-07-30**, replacing an earlier 15-slice all-real-functionality draft. That draft predated the 2026-07-28 ecosystem ruling that Food (like Apparel) ships as a "visual demo" shell — unbuilt actions open a modal explaining the feature — and predated Apparel's own build, which proved the pattern live (`food.apoyolime.com`-equivalent reached a deployed buyer demo in 6 post-foundation slices). This file now mirrors Apparel's phase shape: **Phase 1 ships a fully real, polished buyer experience against seeded fixture data; Phase 2 builds real seller-side functionality (judged on working, not on polish); Phase 3 makes ordering/messaging real and composes the shared admin shell.** Food has three extra slices beyond Apparel's equivalent phases because real request→accept ordering and bilingual order-thread messaging are core to Food's product and Apparel's own MVP doesn't attempt an equivalent subsystem.

**How to work a slice:** read this file top to bottom (conventions + your slice + all implementation notes of completed slices), then the architecture-doc sections the slice names, then build. Don't start the next slice unprompted.

**Deploy cadence (proposed, confirm with user):** VPS deploys at slice **6** (Phase 0 exit, skeleton), slice **12** (Phase 1 exit, buyer demo goes live), and slice **19** (Phase 3 exit, MVP/demo goes live). Phases 4+ get sliced when reached.

## Conventions (every slice)

- **Bilingual from day one** — every user-visible string in en + es (`next-intl`); no retrofit pass. Client surface defaults `en`, seller dashboard defaults `es` (Salon's surface-header mechanism, Slice 1 there).
- **Never write the identity store's legacy `role` field** (tie-up #1). Identity writes go only through the ecosystem memberships endpoint. Sellers are `CLIENT` in the legacy field + `(FOOD, PROVIDER)` membership. **Never authorize off the JWT's `memberships` claim** — it's refreshed only on token re-issue and is proven stale in production use (Apparel Slice 3); read the live ecosystem API instead.
- **portal-web is the confirmed sole session issuer** (resolved 2026-07-30 — no need to check `FOUNDATION_SLICES.md` for the current issuer). Pin `next-auth` to **`5.0.0-beta.31`**, the exact version all four existing apps resolve — not the floating `"beta"` tag Apoyo-Demia/portal-web still carry.
- **The `Vertical` enum already has `FOOD`** (landed 2026-07-30 with Apparel's Slice 3 — one migration, both future verticals, no second event). Food's own Slice 3 does NOT touch the enum. It still needs its own `vertical_registration_config` seed row (separate migration — Postgres won't let the same transaction that adds an enum value also use it) and its own `"food-app"` entry in `APP_VERTICAL_SCOPE` (two independent gates: the enum says a value exists, the scope says a caller may write it).
- **Migrations:** local dev Postgres + `npx prisma migrate dev --name <name>`; always commit the generated files (deploy only runs `migrate deploy`).
- **Secrets never enter git.** `.env.example` carries placeholders only. Two distinct ecosystem tokens by distinct names: `ECOSYSTEM_SERVICE_TOKEN` (a **new, distinct** `food-app:<secret>` value — never reuse another vertical's token), `PORTAL_CLAIMS_SERVICE_TOKEN` (unused until a claims feature exists — don't add it until then).
- **The user manages all git operations.** Each slice ends with: a commit message to copy, the list of files created/modified, and implementation notes appended here.
- **No SSH from sessions to the VPS** (`VPS_DIRECTORY_MAP.md`): deploy slices hand the user exact commands and wait for pasted output before the next mutating step.
- **Ports (provisional — E3 discipline, `ss -tlnp` at deploy time is the only authority):** food-web **:3012** (3000 the Apoyo-Demia app, 3003 salon-web, 3010 apoyo-portal, 3011 portal-web, 3013 apparel-web known taken); ws **:4006/:4007** reserved for a later phase, not used in this file. Local docker Postgres host port **5434** (5432 Beauty-Salon, 5433 Salon, 5435 Apparel).
- **Timezone:** store UTC `timestamptz`; all display/date math fixed `America/Port_of_Spain`, no DST logic.
- **Media:** every image ingested through the pipeline (variants + EXIF strip + blur placeholder), regardless of which storage driver is active — no raw uploads anywhere, including seeds. Local disk is the default driver (Slice 4); R2 is a later swap, not a Phase-0 requirement.
- **`<ComingSoon feature="…">` stub pattern (Slice 7):** any action not yet built opens a localized explain-the-feature modal — never a dead link, disabled control, or missing nav item. Adding a stub is a one-line registry entry; replacing a stub with the real feature is deleting that line.
- **Design bar:** Phase 1 is the buyer demo and must be aesthetically complete — "works but looks scaffolded" fails a slice's done-when on any buyer-facing surface; the Sobremesa visual language (arch doc Part F3, **tokens already WCAG-audited and corrected** — use the corrected hex values, not the raw Emergent spec) is a requirement, not polish deferred to a later pass. Phase 2's seller surface is judged on working correctly, not on visual finish.

---

## Phase 0 — Foundation

### Slice 1 — Scaffold, host-gating, design tokens

Read: arch doc Parts C, F3; Salon `BUILD_SLICES.md` Slice 1 notes (host-gating + surface-header mechanism — port it, it's proven); Apparel `BUILD_SLICES.md` Slice 1 notes (Soft Studio token verification method — grep tokens out of the emitted CSS bundle, since Tailwind silently drops unresolvable classes and a green build proves nothing).

- Next.js 15 App Router + TS + Tailwind at repo root. Stack mirrors Salon/Apparel/the Apoyo-Demia app: next-intl v4, react-hook-form + zod, lucide, shadcn-style primitives.
- Route groups: `(client)/` (home, browse, meals, sellers, categories, search, orders, saved, login, register, account placeholders), `food/` ((dashboard), admin, login), `api/`.
- `middleware.ts` host gating: host starts `food.` → block `/food/*` (404); `portal.` → only `/food/*` + `/api/*`; unknown host (dev) → everything. `x-food-surface` header → locale defaults (Salon's mechanism).
- `assetPrefix: process.env.NEXT_PUBLIC_ASSET_HOST` (prod `https://food.apoyolime.com`).
- **Sobremesa design tokens now, not later — use the CORRECTED hex values from arch doc Part F3, not the raw Emergent spec values.** Tailwind theme encoding: surfaces (`cream-bg`/`card`/`sunken`/`hairline`), text (`ink`/`ink-muted`), accents in all three forms (text-safe corrected: `green`/`teal`/`gold`/`terracotta`/`error`; fill-only `-vivid`: `green-vivid`/`teal-vivid`/`gold-vivid`/`terracotta-vivid`; `-soft` tints, unchanged from the spec), type scale (display serif + Inter via `next/font`), spacing scale, radius scale (20px cards / full-pill chips), motion durations. Placeholder pages already use them.
- `docker-compose.yml` (postgres:16-alpine, host 5434), npm scripts (`db:migrate`, `db:migrate:deploy`, `db:studio`, `db:seed`), `.env.example`, `.gitignore`, `lib/time.ts` (fixed-TZ rule), PWA manifest stub + icons.

**Done when:** `npm run dev` serves a token-styled client landing; simulated hosts gate correctly (lvh.me); `npm run build` + lint pass; the corrected accent hexes (not the raw Emergent ones) are verified present in the emitted CSS bundle, not just in the Tailwind config source.

### Slice 2 — Prisma schema & migrations

Read: arch doc Part D verbatim (fields/enums decided; names polishable — note the Fresh Today naming call: models stay `FoodStory*`, only UI/component naming changes); Apparel Slice 2 notes (schema-casing convention — **follow Apoyo-Demia's `@map`/`@@map` snake_case convention, not Salon's**, which has zero `@map` in its whole schema and is the wrong template here; also the two-shapes-of-Prisma-constraint-violation lesson, relevant to Slice 10's saves and Slice 14's validation).

- Full Part D schema: core + engagement + ordering + platform entities, including later-phase tables' *enums* only where cheap (don't create Phase 6–9 tables yet — zero-users means migrations are free later; keep the schema honest to what's built).
- Actually create: `FoodSeller`, `FoodSellerPhoto`, `FoodCategory`, `FoodListing`, `FoodListingPhoto`, `FoodListingCategory`, `FoodAvailabilityWindow`, `FoodStory`, `FoodStoryHighlight`, `FoodStoryView`, `FoodFollow`, `FoodSave`, `FoodOrder`, `FoodOrderItem`, `FoodOrderMessage`, `FoodNotification`, `FoodDemandEvent` — with Part D's indexes.
- Raw SQL appended: `CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm;` (superuser note for prod recorded in the migration comment).
- `prisma/seed.ts`: category taxonomy seed (Part D list) — real demo seed data is Slice 8.

**Done when:** clean `migrate dev` on fresh DB; `prisma generate` clean; category seed runs.

### Slice 3 — Auth & ecosystem client, `FOOD` vertical activation (⚠ cross-repo)

Read: arch doc B1, Part G; Apparel `BUILD_SLICES.md` Slice 3 notes **in full** — Food's cross-repo footprint here is smaller than Apparel's (the enum + zod-schema work is already done), but every live-topology finding still applies verbatim: memberships endpoints exist in BOTH Apoyo-Demia and portal-web (nginx path-splits which answers — change allowlists in both); the JWT `memberships` claim is stale (never authorize off it); cookie-name mismatch fails silently in prod (`secureCookie` naming must match exactly, `next start` forces `NODE_ENV=production`); decision 15 already retired the registration-toggle's authorization role (CTA-visibility only).

- Port session validation (`getToken`, matching `secureCookie` naming), the ecosystem client (memberships read/create), and the guard helpers — same pattern as Salon/Apparel's `lib/session.ts` / `lib/ecosystem.ts` / `lib/auth-guards.ts`.
- Buyers: `(FOOD, CLIENT)` minted lazily on first commitment. Sellers: `(FOOD, PROVIDER)`.
- **⚠ Cross-repo (needs in-session user permission, decision 13) — smaller than Apparel's equivalent step:**
  1. Seed a `vertical_registration_config` row for `FOOD` (hand-written migration in Apoyo-Demia, the schema owner — the enum value already exists and is already committed, so this can be a single migration, unlike the enum-add-then-seed split Apparel needed).
  2. Add `"food-app": ["FOOD"]` to the hardcoded `APP_VERTICAL_SCOPE` allowlist in `lib/ecosystem-auth.ts`, **in both** Apoyo-Demia and portal-web.
  3. Register a **new** `food-app:<secret>` entry in `ECOSYSTEM_SERVICE_TOKENS` — never reuse `salon-app`'s or `apparel-app`'s.
  4. Confirm portal-web's `SelectableVertical` / §6b config endpoint already reports `FOOD` (it should — added for free alongside Apparel's Slice 3) rather than re-adding it.
- Pin `next-auth` to `5.0.0-beta.31` in `package.json` (not the floating `"beta"` tag).

**Done when:** a real shared-cookie session decodes here; membership read/create round-trips against the live ecosystem API (verify scope containment — a `food-app` token writing SALON/APPAREL should 401); the config-row migration applies clean on a throwaway DB.

### Slice 4 — Storage & media pipeline

Read: arch doc Part C (storage abstraction), Part G (EXIF/privacy — hard requirements); Apparel Slice 4 notes (the `lib/storage.ts` abstraction pattern, and the `sharp` version-pin lesson — **pin `sharp` ≥0.35.0**, Next's bundled version is under an active advisory).

- `lib/storage.ts`: a small interface (`put`, `getUrl`, `delete`) with **local disk as the default implementation** (`UPLOADS_BASE_PATH` + an app-served route, same proven pattern as Salon/Portal/Apparel) — no R2 dependency to stand up before this slice is done. R2 is a documented future swap behind the same interface, built only once the account exists (arch doc Part C).
- Upload route handler → auth guard → MIME sniff + size cap → `sharp` re-encode (strips ALL metadata including EXIF GPS) → variants (thumb 400w / card 800w / full 1600w) + blur LQIP → storage driver `put()` → return stored paths + blurDataUrl.
- `next/image` custom loader pointed at whichever driver is active; `<FoodImage>` wrapper component (blur-up, aspect handling — 4:3 meals / 16:9 cover / 1:1 avatars per Part F3).
- Throwaway script proving: EXIF GPS present in input → absent in every stored variant.

**Done when:** an upload through the route lands variants + blur via the local-disk driver; EXIF-strip proof passes; `<FoodImage>` renders blur-up in a test page.

### Slice 5 — i18n & translation wiring

Read: arch doc B1 (translate service), E6 intro; Apparel Slice 5 notes — **`kap64-translate` is confirmed NOT reachable from local dev** (VPS-only by its own design, no local GCP/LibreTranslate creds). This is not a bug to chase; build the degrade path (original text always delivered if the service is down) and verify both paths with a real HTTP stub standing in for the success case.

- `next-intl` skeleton: en/es message catalogues, locale cookie, the surface-default mechanism (client `en`, seller dashboard `es`).
- `lib/translate.ts`: calls `TRANSLATE_SERVICE_URL`, stores `originalText`/`originalLocale`/`translations Json` (computed once, never recomputed) — the shape Salon and Apparel both already use for their message/listing text.
- Verify: a real HTTP stub server standing in for `kap64-translate`'s success path, and the genuine down-service case for the degrade path (original text delivered, no user-facing error).

**Done when:** both the translate-success and translate-down paths are verified against something real (a stub server), not assumed; locale switching works end to end on a placeholder page.

### Slice 6 — Deploy skeleton (Phase 0 exit) — VPS deploy #1

Read: `VPS_DIRECTORY_MAP.md` (full — recipe section, non-root PM2 war story, no-SSH ruling), `VPS_INVENTORY.md`, `APOYO_ECOSYSTEM.md` E2–E6/E8, Apparel Slice 6 notes **in full** — two ecosystem-wide gotchas found during Apparel's own deploy apply here too: (1) creating a domain's folder by hand before the Hestia domain exists breaks `v-add-web-domain` — create the Hestia domain FIRST, then clone into the folder Hestia scaffolds, not the reverse; (2) a vertical's bare dashboard root (`/food`) needs its own **exact-match** nginx location in addition to the trailing-slash-prefixed one, or a bare request falls through to the portal host's catch-all instead of reaching Food.

- User-driven (commands handed one step at a time): Hestia domain `food.apoyolime.com` + SSL; clone to `/home/user/web/food.apoyolime.com/private/apoyo-food` (account key exists — don't regenerate); `apoyo_food` DB + role (**+ `GRANT ALL ON SCHEMA public`**, extensions as superuser, percent-encoded password); prod `.env`; `migrate deploy`; build.
- PM2 `food-web` under **`user-pm2`** on :3012 (**`ss -tlnp` first** — E3), `next start -H 127.0.0.1` via args (E8 #3), `ecosystem.config.cjs` if ESM (E8 #2).
- nginx: `food.tpl`/`.stpl` copied from `salon.tpl`/`apparel.tpl` pattern (port 3012), applied via `v-change-web-domain-proxy-tpl`; portal domain gets `nginx.ssl.conf_food` drop-in (`/food/` → :3012 **plus** a paired `location = /food` exact-match, per the Apparel finding above); `nginx -t` then `systemctl reload nginx` (not `v-restart-proxy` — Salon finding).
- `deploy.sh` (E5 pattern + Salon's env-var check) + `.gitattributes` (`*.sh text eol=lf`, E4); `DEPLOYMENT.md` with actuals.

**Done when:** `https://food.apoyolime.com` serves the styled placeholder over SSL, both with and without a trailing slash on the bare root; production sign-in against the live issuer (portal-web) works; `portal.apoyolime.com/food` reachable and host-gated.

---

## Phase 1 — The buyer demo (the polished surface)

### Slice 7 — `<ComingSoon>` registry & component library

Read: arch doc F3 (design system — this slice sets the visual bar for everything after), Part E1 (discovery sections), Part E2 (Fresh Today card anatomy); Apparel Slice 7 notes (the registry pattern).

- One `<ComingSoon feature="…">` component + a single localized registry mapping feature keys → title/description (en+es). Register the keys this phase will need stubbed: `request-order`, `contact-seller-follow-through` (if any), any seller-facing action reachable from a buyer-visible surface.
- Core components on Slice 1's corrected tokens: `<MealCard>` (4:3 photo, blur-up, dish name, price in `--terracotta`, availability stamp, seller mini-row), `<SellerCard>`, `<CategoryCard>`, `<FreshTodayCard>` (rounded-rectangular, freshness dot, NOT a circular ring), availability **stamp** (ink text on a `-vivid` fill), horizontal rail with snap scrolling, section headers, skeletons, bottom tab bar, filter bottom sheet shell.
- Motion pass: card fades, sheet springs, image blur-up everywhere; no spinners on browse surfaces.

**Done when:** a component-gallery test page renders every component above against seed-free dummy data, visually matching the Sobremesa spec's corrected palette; `<ComingSoon>` opens and closes correctly with localized copy.

### Slice 8 — Demo seed

Read: arch doc Phase 1 (seed purpose) — **ask the user for the photography-sourcing decision before building** (open question 1: curated CC0/owned photos through the real pipeline, vs. a placeholder service).

- Curated seed: 8–12 sellers (varied areas/languages/specialties, realistic Trinidad names/bios — es and en mix), 40+ listings across categories/kinds/price modes, availability windows that make "today/weekend" sections non-empty on any demo day, a spread of Fresh Today posts (seed the rows now with far-future expiry flagged `seed=true` — Slice 11 needs them), follower counts, a few `FoodStoryHighlight` "Menu shelf" groups per seller.
- All images through the real media pipeline (Slice 4's local-disk driver in dev; same driver in prod until R2 exists).
- Idempotent (`db:seed` re-runnable); seed data clearly flagged for one-command removal before real launch.
- **All prices in `$X,XXX TTD`** — do not copy the €-denominated mockup values (arch doc Part F3's "do not reproduce" note).

**Done when:** fresh DB + seed → a temp index page (or Slice 9's real one) shows a full, varied, good-looking marketplace, prices correctly in TTD.

### Slice 9 — Discovery: home, browse, search, demand logging

Read: arch doc E1 (sections), E3 (search v1), Part D (`FoodDemandEvent`).

- Home: hero, **Fresh Today rail** ("En la cocina hoy" — Part E2, rings from seed data, viewer is Slice 11), then E1's remaining sections (weekend/today, categories, new, trending-proxy, near-you with area-picker cookie flow, seasonal rail if an occasion window is active).
- `/browse`: filterable grid (category/area/price/dietary/availability/sort), filter state in URL, bottom-sheet UI. `/browse/sellers`: region-map picker + seller cards with area counts. `/categories/[slug]` landings.
- `/search`: title/tag/seller matching (unaccent + ILIKE/trigram-lite for now), meals + sellers tabs, empty-state design.
- **`lib/demand.ts` + ingestion — demand-event logging starts here:** SEARCH (query, normalized, area, resultCount), LISTING_VIEW, PROFILE_VIEW; fire-and-forget writes (never block a page on analytics); rate-limited.

**Done when:** home + all browse perspectives work with seed data on a phone viewport, using the corrected Sobremesa tokens; demand events land with correct normalization; zero-result searches logged with `resultCount=0`; Lighthouse mobile perf sane on hero/card images.

### Slice 10 — Listing detail, saves, rule-based recs

Read: arch doc F1 (page content), E4 Phase-2-equivalent recs (rule-based tier).

- `/meals/[slug]`: gallery (swipe), price/availability summary, dietary/occasion badges, seller card, "More from this seller" + "Similar in category" rails, sticky "Request order" CTA → **`<ComingSoon feature="request-order">`** (styled, not broken — real wiring is Slice 17).
- Saves: heart on cards/detail (auth-gated), `/saved` grid; SAVE demand events.
- Rule-based recs: "More from this seller", "Similar in {category}", "Popular in your area" (view/save counts) — deterministic, no cold-start problem.

**Done when:** listing detail renders fully with seed data; save/unseed round-trips; the CTA opens `<ComingSoon>` correctly.

### Slice 11 — Seller profile, follows, Fresh Today viewer

Read: arch doc F1 (seller profile), E2 in full (Fresh Today viewer + Menu shelf), Part D (`FoodFollow`, `FoodStoryView`).

- `/sellers/[slug]`: cover/profile imagery, bio, areas (mini-map), languages, specialties, **Menu shelf** (labeled highlight cards from seed data), active listings grid, gallery, follower count, Follow button (real — a buyer action against seeded sellers, not stubbed).
- Client viewer at `/stories/[sellerSlug]` (route name can stay generic; the UI is the Fresh Today viewer): full-screen, progress bars, tap/swipe advance, seller→seller continuation, linked-listing CTA, view tracking (`FoodStoryView`), seen/unseen shown as a card border, not a ring.
- Follow/unfollow wiring, follower counter maintenance, FOLLOW demand events. "From sellers you follow" home section goes live (Slice 9's home gets this section wired for real).

**Done when:** two local users — one follows a seeded seller, the seller's Fresh Today posts show correctly in the follower's rail/section; the viewer works with gestures on mobile; Menu shelf renders seed highlights.

### Slice 12 — Buyer polish & PWA — VPS deploy #2 (buyer demo live)

Read: arch doc F3 (accessibility + PWA), Part I (Phase 1 exit bar).

- Full bilingual pass across every Phase-1 surface (no retrofit debt); accessibility check against the corrected token contrast ratios in real components, not just the token table; motion/perf pass (skeleton + blur-up everywhere, no spinners).
- PWA: manifest finalized, installability verified, offline cached shell + last-viewed browse data.
- **Deploy pass:** slices 7–11 to prod (`deploy.sh`); seed run in prod (flagged, removable); smoke test with the shared browser-testing tool across the full buyer loop (home → browse → search → listing → seller profile → follow → Fresh Today viewer → save).

**Done when:** `https://food.apoyolime.com` is a publicly demoable, aesthetically complete discovery experience — browse, search, listing, profile, follow, Fresh Today — on a phone, seed-populated, live.

---

## Phase 2 — The seller story (functionality-first, not polish-first)

### Slice 13 — Seller onboarding & profile editor

Read: arch doc F2 (onboarding flow), B2 (region map port, status pattern), Part G (address privacy), B1 (decision-14/15 — the registration toggle only gates CTA visibility now; Food's own onboarding-submit is the real authorization point).

- Port `region-map.tsx` + `tt-region-paths.ts` from the Apoyo-Demia app or Salon as the area picker (1–3 areas) — same `RegionKey` values Apparel also reuses.
- Seller registration entry creates `FoodSeller` (PENDING) + `(FOOD, PROVIDER)` membership (needs Slice 3's `food-app` scope + token already in place).
- Guided profile setup (skippable-resumable): profile photo → cover → bio → areas → languages → specialties → fulfillment modes. Media through Slice 4's pipeline. Gallery manager (`FoodSellerPhoto`).
- Dashboard shell at `/food` (nav, empty states pointing at next actions). **No admin approval queue yet** — that's Slice 16, mirroring Apparel's own sequencing; a session can flip a test seller's status directly for local testing in the meantime.

**Done when:** a fresh user completes onboarding locally end to end and lands on the dashboard as PENDING; the dashboard shell correctly renders the PENDING state (not an unauthorized error).

### Slice 14 — Listing CRUD & availability windows

Read: arch doc Part D (`FoodListing` + windows), E5 intro (what listings must support), F1 dashboard routes.

- `/food/listings` list + `/food/listings/new` + edit: title/description, kind, price mode + price, feeds-count, categories (m2m), dietary tags, ingredient tags, occasion tag, photos (ordered, hero-first, pipeline-ingested), active toggle.
- Availability-window builder: PREORDER (lead days) / RECURRING_WEEKLY (day picker) / DATE_RANGE, multiple windows, per-window note. Human-readable summary rendered back ("Weekends · order by Friday 4pm").
- `lib/availability.ts`: window → "available today/tomorrow/this weekend" computation (fixed TZ) with unit tests — this feeds every discovery badge/filter; get it right once.
- Slug generation (title-based, collision-suffixed) for listings + sellers.

**Done when:** a PENDING seller creates a listing with photos + 2 window types; availability computation passes tests; listing renders on the Phase-1 detail page once the seller is (manually, for now) flipped to ACTIVE.

### Slice 15 — Fresh Today posting tools & seller dashboard

Read: arch doc E2 in full (posting flow, expiry), Part D (story entities), E7 intro (what a basic dashboard needs vs. the full Phase-6 insights feature).

- `/food/stories` (route name generic; UI is Fresh Today): post flow (photo → caption → optional linked listing, ≤3 taps), active-posts list with view counts, delete; Menu shelf manager (create/name/assign highlights).
- `food-sweep` process (PM2, `--interpreter none` if tsx): Fresh Today expiry pass; runs locally via npm script for now, PM2 wiring at Slice 19's deploy.
- Convert Slice 8's seed Fresh Today posts to realistic recent timestamps (they were seeded far-future to survive until this slice).
- Basic seller dashboard: views/saves/follows counts — **not** the full analytics/insights dashboard (that's Phase 6, later).

**Done when:** post → appears with the freshness-dot treatment → viewer works with gestures → expiry sweep clears an aged post → highlight persists on the Menu shelf; dashboard shows correct counts for a real seller's real listings.

---

## Slice 16 — Admin composition & trust basics

Read: `UNIFIED_ADMIN_SHELL_SLICES.md` (UAS-S2/S3 + the Salon mirror as the worked example); Apparel `BUILD_SLICES.md` Slice 16 plan (its own equivalent, not yet built as of this writing — Food may end up being the first vertical to actually execute this pattern; if so, extending `portal-web/lib/admin-nav.ts`'s `AdminOwnerApp` type to include `"food"` is real, needed work, not a formality).

- `/food/admin` renders the **shared Apoyo admin shell chrome** — mirror Salon's approach exactly: a copy of `lib/admin-nav.ts`, a client shell component, and namespaced CSS (e.g. `--fd-*`) scoped so it cannot collide with this app's Tailwind tokens.
- ⚠ **Every data-loading admin page must call the payload guard before its first query** — the layout gate controls what is *displayed*, not what *executes*; a page under a denying layout still serializes its query results into the RSC payload. This was a real live leak found in Portal (`PRE_LAUNCH_CHECKLIST.md` §0, Apoyo-Demia repo). Do not repeat it here.
- Seller approval queue (`PENDING` → `ACTIVE`/`SUSPENDED` — the queue Slice 13's onboarding has been waiting on), listing takedown, report/flag intake, category manager (add/edit, en+es names).

**Done when:** the admin surface is ADMIN-only, an **unauthenticated** production-build GET of every admin route has been grepped for seeded/real data and is clean, the chrome is visually identical to Portal's, and a real PENDING seller from Slice 13 can be approved to ACTIVE through this UI (not a manual DB flip).

---

## Phase 3 — Real transactions & trust, demo/MVP exit

### Slice 17 — Order lifecycle

Read: arch doc E5 in full, Part D (order entities), Part G (address privacy, rate limits).

- Request flow from listing CTA: replaces Slice 10's `<ComingSoon>` stub. Items/quantities/notes → fulfillment mode (seller's offered modes) → date/time validated against windows + lead time (`lib/availability.ts`) → note → sign-in gate → PENDING with `respondBy`.
- Seller order inbox `/food/orders` (PENDING first) + detail: accept (with quote-price adjustment for QUOTE/STARTING_AT items — agreed price locks), decline (optional reason).
- Client `/orders` + `/orders/[id]`: status timeline, agreed price, cancel action.
- Status machine with guarded transitions + timestamps; sweep additions: EXPIRED past `respondBy`, completion nudge past `fulfillmentAt`; ORDER_PLACED demand events; rate limits.
- In-app notifications for the full lifecycle (both sides).

**Done when:** two real (ACTIVE, Slice 16-approved) users run place→accept→complete and place→expire paths; invalid transitions rejected; availability validation blocks out-of-window requests; the Phase-1 `<ComingSoon>` stub is gone from the listing page.

### Slice 18 — Order thread, email, notifications

Read: arch doc E6 in full; Slice 5's `lib/translate.ts` pattern; Salon's message-shape precedent.

- Order thread: `FoodOrderMessage` UI on both order detail pages; stored translations at send (Slice 5's translate pipeline; graceful degradation if the service is down — original text always delivered); photo attachments via the Slice 4 media pipeline; polling refresh on the open order page.
- Email fan-out via Resend: order lifecycle (placed/accepted/declined/expired) immediate; thread messages debounced (≤1 per order per 15 min); `emailedAt` idempotency; bilingual templates on recipient locale.
- ORDER_MESSAGE notifications; reporting hook (report content → the Slice 16 admin flag list).

**Done when:** a full bilingual order-thread conversation round-trips with correct translations shown gently (original prominent, translation smaller/lighter beneath); email fan-out fires idempotently; the translate-service-down degrade path still delivers original text.

### Slice 19 — Bilingual sweep, a11y/perf, demo/MVP smoke — VPS deploy #3 (demo/MVP exit)

Read: arch doc F3 (accessibility bar), Part I (Phase 3 exit bar).

- Final bilingual sweep across Phases 2–3 surfaces (no retrofit debt); accessibility + perf pass; `food-sweep` under `user-pm2` in prod (expiry + nudges); Resend creds + translate-service env confirmed in prod.
- **Deploy pass:** slices 13–18 to prod; full production smoke test: register → onboard as seller → get approved (Slice 16 admin) → post a listing → browse (as a different user) → follow → view Fresh Today → request order → accept → thread (both locales) → complete — the whole loop, bilingually, on a phone.
- Update `VPS_DIRECTORY_MAP.md` / `VPS_INVENTORY.md` with Food's actuals (E-file discipline).

**Done when:** the full MVP loop runs in production end to end, bilingually, on a phone — demo-ready, and every buyer-facing `<ComingSoon>` stub from Phase 1 has been replaced by the real feature it stood in for.

---

## Phases 4+ (architected in `Apoyo_Food_Architecture.md` Part I — slice when reached)

4 Saved & repeat (collections, order-again recs) · 5 Advanced search & trending materialization · 6 Seller dashboard & insights (k-anonymity floor — the signature feature) · 7 Reviews & portal reputation events · 8 Customer requests board · 9 Verification, geocoding, web-push, ws chat upgrade.
