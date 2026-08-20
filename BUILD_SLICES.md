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

**Implementation notes (done 2026-07-30):**

Hand-scaffolded (no `create-next-app`) to control the route-group structure deterministically, the same way Salon's and Apparel's Slice 1 did. Stack pinned to the versions the sibling verticals resolve: Next 15.5.22, React 19, TS strict, **Tailwind v3** (shadcn-style config, not v4's CSS-first mode), next-intl v4. `react-hook-form` + `zod` + `@hookform/resolvers` + `lucide-react` are installed but unwired — Slices 13/14 build the first real forms and half-built form logic is worse than none. No `next-auth` yet (Slice 3 adds it, pinned to `5.0.0-beta.31` — that's JWT wire-format compatibility with the issuer, not a dependency preference). No `sharp` yet (Slice 4, pinned ≥0.35.0 per Apparel's advisory finding).

**No shared/cross-repo file was touched by this slice.** Nothing in Apoyo-Demia or portal-web was read-modified-written, so there was no collision surface with the concurrent Apparel build. Slice 3 is the first slice with a cross-repo footprint.

**All four done-when criteria verified for real, not by inspection:**
- **Host-gating tested over HTTP with real `Host:` headers** against the *production* build (`npm run build && npm start`), all three host cases × 8 paths, then again in `npm run dev` over **real `lvh.me` DNS** (`food.lvh.me` / `portal.lvh.me`, both resolving to 127.0.0.1) as the slice's own wording asks. Exactly per Part B2: `food.*` → `/` 200, `/browse` 200, `/meals/[slug]` 200, `/food` **404**, `/food/admin` **404**, `/food/login` **404**, `/api/health` 200; `portal.*` → `/` **404**, `/browse` **404**, `/food` 200, `/food/admin` 200, `/api/health` 200; unknown host (`localhost:3012`) → everything 200.
- **Tokens confirmed present in the emitted CSS bundle**, not just in the config — Tailwind silently drops classes it can't resolve, so a green build proves nothing here (Apparel's Slice 1 method). **61 checks, 0 failures** over `.next/static/css/*.css`: all 19 CSS variable declarations at their corrected values, all colour/size/radius/shadow/motion/aspect utilities actually emitted, and — as a negative control — an assertion that **none of the five raw Emergent accent values is bound to a text token**, so a future session restoring them would fail this check rather than pass silently.
- **`tsc --noEmit` clean; `next build` clean (19 routes); `next lint` clean** (zero warnings).
- **Rendered in a real browser** (shared `browser-testing` tool, Playwright Chromium) at `/`, `/browse`, `/food`, `/food/admin` — all 200, zero console/page errors, all three fonts loading (Fraunces on headings, Inter on body, Caveat on the one handwritten section label).

**The palette was re-measured before being locked, not taken on trust.** Part F3 asserts its corrected table is "verified by direct contrast computation"; that computation was redone independently at this slice (WCAG 2.1 relative luminance, 40 pairings — each accent as text on all three surfaces and on its own `-soft` tint, each as a fill behind a cream label, each `-vivid` with ink on top, ink/ink-muted on every surface, the focus ring as non-text UI). **Part F3's table reproduces exactly** — green 4.52/4.98/5.44, teal 4.59/5.07/5.53, gold 4.56/5.03/5.49, terracotta 4.76/5.25/5.72, and `gold-vivid` ink-on-fill 6.55. The raw Emergent values were re-measured too and fail as the doc says (gold #DDA24A is **1.76:1** on `sunken`). The single documented gap is real and now encoded in the code rather than only in prose: **`ink-muted` is 4.37:1 on `sunken`** — `components/ui/input.tsx` and `surface-banner.tsx` both use full `ink` on sunken surfaces with the reason in a comment.

⚠ **Open question 6 is now a live decision for the user, not a hypothetical.** `--gold` shipping at `#895C1A` is a deep amber, visibly not the mockups' bright marigold `#DDA24A`. The mitigation Part F3 designed is in place and works: the original survives as `--gold-vivid` and is where gold is actually most visible in the product (status chips and availability stamps render as ink on a vivid fill, and `gold-vivid` is the best of the four at 6.55:1, safe at any size). So the bright honey is **not** gone from the UI — it just never carries text itself. Surfaced here rather than silently applied, the same way Apparel's own accent amendment was.

Decisions and findings:

- **Colour tokens are declared as space-separated RGB channels, not hex** (`--green: 83 109 70;` with the Part F3 hex in a comment beside it), consumed as `rgb(var(--green) / <alpha-value>)`. A CSS var holding a raw hex string cannot take an opacity modifier, so `bg-green/90` would silently produce nothing. Verified the emitted rule really is `rgb(var(--green)/.9)`. Token *names* match Part F3 exactly; shadcn semantic aliases (`primary`, `background`, `ring`, …) are layered on top pointing at Sobremesa values, with `primary` → `green` because Part F3's anchor rule is non-negotiable.
- **All three accent forms exist as first-class tokens** — text-safe (`green`), fill-only (`green-vivid`), soft tint (`green-soft`) — so the rule attached to each is expressed in the token name at every call site, not remembered. The `-vivid` group is documented as ink-on-fill only in both `tailwind.config.ts` and `globals.css`.
- **`lib/utils.ts`'s `twMerge` is extended with this project's font-size keys from day one.** This is inherited, not rediscovered: Apparel shipped stock `twMerge` from its Slice 1 through Slice 6 and only found in Slice 7 that it was classifying `text-label`/`text-h1` as *text colours*, silently stripping the label colour off the primary button and leaving 2.67:1 on the most-used control. Invisible to `tsc`, to lint, and to a palette-level audit. Keep the list in step with `tailwind.config.ts`'s `fontSize` keys.
- **`lib/money.ts` added ahead of any page that needs it**, and it renders `$1,250 TTD` per Part F3 / the Sobremesa spec §1.8 — not Apparel's `250 TTD`. The €-denominated mockups are a convention-level trap, so the countermeasure is structural: one formatter is the only correct way to render a price, so copying a mockup literally isn't an available mistake later. `formatCentsTtd()` is the variant Part D's integer-cents columns will actually call. Asserted live that the rendered page contains zero `€`.
- **No `.dark` block.** Sobremesa is a single warm light theme; a dark mode would need its own palette pass, not an inversion, so the hook is deliberately absent rather than half-present.
- **Surface/locale mechanism ported from Salon/Apparel verbatim in shape**: middleware sets `x-food-surface: client|seller` keyed on **the path** (not the host), and `i18n/request.ts` reads it as the default-locale fallback *beneath* the `NEXT_LOCALE` cookie. Verified all four combinations live: client → `lang="en"`, seller → `lang="es"`, and a cookie overriding each. Also asserted the *catalogue* switches, not merely the `lang` attribute. Keying on path not host is what makes the unknown-host dev case resolve correctly. Slice 3 extends the chain with JWT locale.
- **`next.config.ts` carries the `/_next/static` CORS header for the portal origin pre-emptively.** Salon shipped without it and lost its webfonts on the portal-host surface: `assetPrefix` serves `_next/static` cross-origin, and cross-origin `@font-face` is CORS-checked regardless of same-site trust. Food self-hosts **three** fonts, so this would have failed the same way at Slice 6. Scoped to `https://portal.apoyolime.com`, not `*`.
- **PWA icons are generated by a dependency-free PNG encoder** (`scripts/generate-icons.mjs`, `npm run icons:generate`) rather than by adding an image library — `sharp` is a Slice 4 decision with its own version pin, and pulling it forward to draw four circles would have pre-empted that. Node's own `zlib` is all a valid 8-bit RGBA PNG needs. Output is placeholder art drawn from the Part F3 tokens (green ground, cream plate, gold-vivid centre, teal freshness dot), 4× supersampled for anti-aliasing, with a separate full-bleed **maskable** variant whose content sits inside the 80% safe zone so Android's own mask can't crop it. Slice 12 finalises the PWA and is the natural point to swap in real artwork.
- **`/uploads/` is in `.gitignore` from this slice**, not Slice 4 — portal-web's repo was missing that rule and it was only caught after uploads already existed on disk.
- `/api/health` sits outside `/food`, so it always reports `surface: "client"` regardless of host — correct, since it is shared infra for both surfaces, not part of the seller prefix. Salon and Apparel both record the same.
- `next lint` printed the same Next-16 deprecation notice the sibling repos log (ESLint CLI is the future path). Not actioned; whichever slice next touches lint config should migrate it.
- `npm install` pulled 450 packages with 13 advisories (12 high) — the same baseline as Apparel's 428/13. All transitive and build-time (`minimatch`/`brace-expansion` under the eslint toolchain, plus `postcss` and `sharp` bundled *inside* `next`); `npm audit fix --force` "resolves" them by installing `next@9`, which is not a fix. ⚠ The `sharp <0.35.0` advisory is the one that matters later: Slice 4 must pin **≥0.35.0** as a direct dependency rather than inherit Next's bundled copy.
- **Docker was not started this slice** — nothing in Slice 1's done-when needs a database, and `prisma/schema.prisma` is a datasource/generator-only stub. Port **5434 was confirmed free** before `docker-compose.yml` was written. Slice 2 is the first slice that brings the container up.

`components/scaffold/*` is scaffolding with a scheduled death: `token-proof.tsx` exists so "the corrected hexes are present" is *visible* rather than only greppable and so every token class is genuinely *used* somewhere, `surface-banner.tsx` shows the resolved surface/locale/host on the page, and `placeholder-page.tsx` is the shared shell for the 14 route stubs. Slice 7 deletes all three when the real Sobremesa component library and page chrome land. One detail worth keeping when they go: the `-vivid` swatches are rendered at 22px semibold **on purpose** — ink on green/teal/terracotta-vivid is 3.10–3.80:1, which clears WCAG's large-text bar but not the normal-text one, so the proof page demonstrates that rule instead of quietly breaking it.

Files created: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `.eslintrc.json`, `.gitignore`, `.env.example`, `docker-compose.yml`, `prisma/schema.prisma` (stub), `middleware.ts`, `i18n/request.ts`, `messages/{en,es}.json`, `lib/{utils,time,money}.ts`, `components/ui/{button,card,input,label}.tsx`, `components/scaffold/{surface-banner,token-proof,placeholder-page}.tsx`, `scripts/generate-icons.mjs`, `app/globals.css`, `app/layout.tsx`, `app/manifest.ts`, `app/{icon,apple-icon}.png`, `public/icons/{icon-192,icon-512,icon-maskable-512}.png`, `app/(client)/{layout,page}.tsx`, `app/(client)/{browse,browse/sellers,search,saved,orders,account,login,register}/page.tsx`, `app/(client)/{meals,sellers,categories}/[slug]/page.tsx`, `app/food/layout.tsx`, `app/food/(dashboard)/page.tsx`, `app/food/{admin,login}/page.tsx`, `app/api/health/route.ts`.

### Slice 2 — Prisma schema & migrations

Read: arch doc Part D verbatim (fields/enums decided; names polishable — note the Fresh Today naming call: models stay `FoodStory*`, only UI/component naming changes); Apparel Slice 2 notes (schema-casing convention — **follow Apoyo-Demia's `@map`/`@@map` snake_case convention, not Salon's**, which has zero `@map` in its whole schema and is the wrong template here; also the two-shapes-of-Prisma-constraint-violation lesson, relevant to Slice 10's saves and Slice 14's validation).

- Full Part D schema: core + engagement + ordering + platform entities, including later-phase tables' *enums* only where cheap (don't create Phase 6–9 tables yet — zero-users means migrations are free later; keep the schema honest to what's built).
- Actually create: `FoodSeller`, `FoodSellerPhoto`, `FoodCategory`, `FoodListing`, `FoodListingPhoto`, `FoodListingCategory`, `FoodAvailabilityWindow`, `FoodStory`, `FoodStoryHighlight`, `FoodStoryView`, `FoodFollow`, `FoodSave`, `FoodOrder`, `FoodOrderItem`, `FoodOrderMessage`, `FoodNotification`, `FoodDemandEvent` — with Part D's indexes.
- Raw SQL appended: `CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm;` (superuser note for prod recorded in the migration comment).
- `prisma/seed.ts`: category taxonomy seed (Part D list) — real demo seed data is Slice 8.

**Done when:** clean `migrate dev` on fresh DB; `prisma generate` clean; category seed runs.

**Implementation notes (done 2026-07-30):**

Full Part D schema implemented — **10 enums, 17 models, 9 CHECK constraints**, on Postgres **16-alpine** in docker on host port **5434** (confirmed free at Slice 1; Apparel's own container on 5435 was left untouched, and this session never touched it).

**All three done-when criteria verified against a real database:**
- **Clean replay on a fresh DB** — proven on a **second, separate** database (`apoyo_food_migtest` on the same container) via `migrate deploy`, rather than by `migrate reset` on the working dev DB, so nothing was dropped to run the test. The committed migration file alone produced all 17 tables, 10 enum types, 9 CHECK constraints, both extensions and the GIN index. `migrate diff` reports **no drift** on the dev DB *and* on the freshly replayed one.
- **`prisma generate` clean** (Prisma Client v6.19.3); `tsc --noEmit`, `next lint` and `next build` all clean afterwards.
- **Category seed runs, and is idempotent** — `npm run db:seed` twice in a row leaves 12 rows, not 24 (upsert keyed on `slug`).

Plus a committed verification script, `prisma/verify-schema.ts` (`npm run db:verify`): **49 checks, 0 failures**, idempotent and self-cleaning (every row it writes carries a `_verify-` slug prefix and is removed before and after), so it can be re-run against a DB that already holds seed or demo data. It exists because the invariants that matter most here have **no representation in `schema.prisma` at all** — they are only real if something actually tries to violate them.

**Convention calls, recorded so later slices don't re-litigate them:**
- **Casing follows Apoyo-Demia / portal-web** (`@map("snake_case")` columns, `@@map("plural_snake_case")` tables), per Apparel's Slice 2 finding. ⚠ Salon remains the wrong template — zero `@map` in its whole schema. Asserted structurally: every `food_*` table and every column on `food_sellers` is snake_case, checked against `information_schema`.
- **IDs are `cuid()`**, matching Apparel.
- **Money is INTEGER CENTS** (`priceCents`, `subtotalCents`) — deliberately *unlike* Apparel's `Decimal(10,2)`, because Part D specifies cents and the ordering maths is whole-cent arithmetic. Exact round-trip asserted. Render only via `lib/money.ts`'s `formatCentsTtd`.
- **`startsOn`/`endsOn` are `@db.Date`, not timestamptz.** They are pure calendar dates in America/Port_of_Spain with no time-of-day meaning; storing them as instants is how "available from the 1st" silently becomes "from the 30th at 20:00" for someone. Everything else is `timestamptz`.
- **Media variants are four columns per image** (`*Thumb/*Card/*Full/*Blur`) matching the Slice 4 pipeline's output, and **nullable on `FoodSeller`** — Slice 13's onboarding is explicitly skippable-and-resumable, so a NOT NULL profile image would make a mid-onboarding seller uncreatable. (Same class of deviation Apparel flagged on its own `profileImagePath`.)
- **Listing and seller slugs are GLOBALLY unique**, because `/meals/[slug]` and `/sellers/[slug]` are root-level routes (Part F1), not nested under the seller. Slice 14 owns collision-suffixed generation.
- **`lastStoryAt` is a plain column on `FoodSeller`**, per Part E2's explicit instruction — posting to Fresh Today is *presence*, not demand, so it must not go through `FoodDemandEvent`.

**Deliberately NOT created:** `FoodCollection`/`FoodCollectionItem` (Phase 4), `FoodListingStats` (Phase 5), `FoodReview` (Phase 7), `FoodCustomerRequest`/`FoodRequestResponse` (Phase 8), `FoodSellerVerification` (Phase 9). **Their enums are omitted too**, which is a judgement call on this slice's "later-phase tables' *enums* only where cheap" clause: zero real users makes those migrations free later, and an enum type no table reads is noise rather than foresight. This diverges from Apparel, which *did* build `ApparelReview` early — Food's slice brief explicitly says not to, and Part D's later-phase entities are genuinely independent additions rather than things the current tables must migrate around. The one thing this schema *does* pre-build for a later phase is `FoodSeller.lat`/`lng`, because Part C requires those from day one so geocoding is additive rather than a migration of meaning.

**The 9 CHECK constraints, in hand-written SQL appended via `migrate dev --create-only`** (Prisma's documented pattern). Prisma models CHECK constraints not at all, which is exactly what makes them safe to put there — invisible to schema diffing, never proposed for removal by a later `migrate dev`. Each guards a rule an import script, a seed, or a future slice could otherwise violate silently; every one is asserted to reject its violation **and** to accept its neighbouring legal case:
1. `food_sellers_areas_max_three` — Part C's 1–3 areas, **upper bound only**. "At least one" is deliberately not a DB rule: onboarding is resumable, so a PENDING seller may legitimately have zero areas; ≥1 belongs to the PENDING→ACTIVE gate (Slice 16). Note `array_length()` returns NULL, not 0, for an empty array — the constraint has an explicit NULL arm for that.
2. `food_listings_price_by_mode` — the pricing model's core semantics: `priceCents` is NULL **iff** QUOTE; FIXED/STARTING_AT must carry a price. **0 is left legal on purpose** (a giveaway is a real case); only negatives are rejected. Same call Apparel made.
3. `food_listings_feeds_count_positive`.
4. `food_availability_windows_fields_by_type` — Part D's availability semantics: PREORDER requires `leadTimeDays`; `daysOfWeek` present **iff** RECURRING_WEEKLY (bitmask 1..127, so "no days selected" is rejected); `startsOn`/`endsOn` present **iff** DATE_RANGE and running forwards. ⚠ **`leadTimeDays` is deliberately allowed on *any* type, not just PREORDER** — "holiday menu, Dec 1–24, order 2 days ahead" is a real listing, and forbidding it would push Slice 14 into modelling one window as two. This is a considered loosening of the strict either/or Apparel used for its own type-dependent constraint, not an oversight.
5–7. `food_order_items_quantity_positive`, `food_order_items_price_snapshot_non_negative`, `food_orders_subtotal_non_negative`.
8. `food_stories_expires_after_created` — an entry expiring before it was posted is invisible on creation and never swept: a silent data black hole.
9. `food_demand_events_result_count_non_negative` — `resultCount = 0` is the most valuable signal in the system (Part E3), so a negative would corrupt the unmet-demand insight rather than merely look odd.

**Deletion behaviour, chosen deliberately and verified by actually attempting each deletion:**
- **Cascade** for owned presentation data — listing/seller photos, availability windows, listing-category joins, saves, follows, story views, order items and messages. Verified: deleting a seller leaves zero orphans across eight child tables.
- **Restrict** for append-only evidence — `FoodOrder → FoodSeller` and `FoodOrderItem → FoodListing`. A hard delete of a seller or listing that has orders is **blocked** (P2003, verified) rather than silently destroying a record both parties rely on. Safe because the product never hard-deletes: `SellerStatus.SUSPENDED` and `FoodListing.active = false` exist for that. Note the snapshot columns protect history from *edits*; Restrict is what protects it from *deletion* — they are two different guarantees.
- **`FoodStory.linkedListingId` is SetNull**, not Cascade — removing a listing must not take the Fresh Today post with it.
- **`FoodDemandEvent` has NO relations at all**, unlike every other table. It is the highest-write table in the app (one row per browse action from Slice 9) and its rows must outlive whatever they describe. Verified both halves: it **accepts** an event referencing a non-existent `listingId`, and demand events **survive** the deletion of the seller and listing they describe. That is the intended behaviour, not a gap.

**Findings worth carrying forward:**
- ⚠ **`pg_indexes.indexdef` is the wrong place to verify a GIN operator class, and it cost a false failure here.** Prisma writes `USING GIN ("areas" array_ops)` into the migration and Postgres builds exactly that — but `indexdef` *reconstructs* the DDL and omits an operator class that is the **default for the column's type**, so it reads back as a bare `USING gin (areas)`. The verification initially asserted on `indexdef` and failed against a perfectly correct index. Confirmed correct from the catalog instead (`pg_index.indclass` → `pg_opclass`: `opcname = array_ops`, `opcdefault = t`), which is what the script now asserts. Apparel's Slice 2 note quotes the *migration* text, which is why this looks like a discrepancy between the two repos and isn't one.
- **The two-shapes-of-constraint-violation lesson is now measured against Food's own constraints, not inherited.** A duplicate `FoodSave` comes back as a recognised `P2002` with the columns in `.meta.target` and **the constraint name absent from the message**; a CHECK violation comes back with **no usable `.code` at all** and the constraint name embedded only in the message **text**. Both asserted explicitly. Slice 10's save idempotency and Slice 14's listing validation must branch on both shapes.
- **Both extensions are proven to *work*, not merely to be installed** — `unaccent('Pastelón de plátano')` returns `Pastelon de platano`, and `similarity('pelau','pilau')` clears 0.3, which is exactly the Trinidad spelling-variance case Part E3 cites as the reason for choosing trigram matching over language-specific stemming.
- ⚠ **Production note for Slice 6, recorded in the migration's own header comment:** `CREATE EXTENSION` needs **SUPERUSER** on the shared VPS Postgres — the `apoyo_food` app role cannot run those two statements itself. They must be executed as the postgres superuser against the `apoyo_food` database before (or as part of) the first `migrate deploy`, the same way `APOYO_ECOSYSTEM.md` records for Apoyo-Portal's `btree_gist`. `IF NOT EXISTS` makes pre-creating them a no-op, so doing it ahead of time is both safe and the recommended order.

Local dev setup (not committed): `.env` **and** `.env.local` both carry the same `DATABASE_URL` — the Prisma CLI only auto-loads `.env`, Next.js only reads `.env.local`. Both are gitignored (verified with `git check-ignore`). The `apoyo_food_migtest` database was left in place on the container rather than dropped, matching Apparel's precedent.

Files created: `prisma/migrations/20260730161951_init/migration.sql` (+ `migration_lock.toml`), `prisma/verify-schema.ts`. Modified: `prisma/schema.prisma` (stub → full model), `prisma/seed.ts` (category taxonomy), `package.json` (`db:verify` script).

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

**Implementation notes (done 2026-07-30):**

Cross-repo work authorized by the user in-session; every cross-repo change is disclosed below. **Both shared repos were `git pull`ed first** (both already up to date) because a concurrent session is building Apparel into the same files — and the pull mattered: it confirmed Apparel's Slice 3 work had already landed, so this slice's footprint is genuinely smaller than the plan assumed.

**Live state checked before writing anything** (all four confirmed, none re-done):
- `Vertical` enum already has `FOOD` in **both** Apoyo-Demia and portal-web's schema mirror.
- The zod `membershipCreateSchema.vertical` enum already lists `FOOD` in **both** apps.
- portal-web's `SelectableVertical` already lists `FOOD`, so the §6b config endpoint can report it.
- **No `FOOD` row existed** in `vertical_registration_config` — Apparel's own migration comment says so explicitly ("No FOOD row … FOOD gets one when Food is built"). That row is this slice's.

**⚠ Cross-repo changes made (3 files, 1 new migration):**
1. **Apoyo-Demia** — new `prisma/migrations/20260730170000_seed_food_registration_config/migration.sql`, seeding the FOOD toggle row. **A SINGLE migration, unlike Apparel's two-file split**: that split existed only because Postgres refuses to use a newly added enum value in the transaction that added it, and `FOOD` was committed back in `20260730010000`. Seeded **`false`**, matching Apparel's call and diverging from SOCIAL/SALON (both `true`): Food's onboarding doesn't exist until Slice 13, and a CTA leading nowhere is worse than no CTA. Flipping it is a data change, not a deploy, and belongs with Slice 13.
2. **Apoyo-Demia** `lib/ecosystem-auth.ts` — added `"food-app": ["FOOD"]` to `APP_VERTICAL_SCOPE`.
3. **portal-web** `lib/ecosystem-auth.ts` — the same one-line grant. **Both copies, not one:** `/memberships` and `/users/{id}/memberships` exist in both apps against the same identity DB, and nginx path-splitting decides which answers — an app added to only one copy works or 401s depending on routing.

Both edits are additive one-liners with a comment; nothing was reformatted, to keep the collision surface with the Apparel session as small as possible. **Deliberately NOT touched:** Apoyo-Demia's `lib/registration-policy.ts` (Apparel established it serves only Demia's own UI and nothing there renders another vertical's CTA), portal-web's `lib/registration-policy.ts` (already lists FOOD — re-adding would be churn), either app's zod validators, and either `schema.prisma`. Also left strictly alone: Apoyo-Demia's **uncommitted** working-tree change to `ECOSYSTEM_WORK_PACKAGE.md`, which is the concurrent Apparel session's in-flight work.

**All three done-when criteria verified live, end to end** — against a **local portal-web pointed at a throwaway identity DB**, never production. The throwaway is a **Food-specific container on port 5441** (`apoyo-food-identity-test`) rather than reusing Apparel's `apoyo-demia-migtest` on 5439, specifically so a concurrent session couldn't collide with it.
- **The config-row migration applies clean on a throwaway DB** — replayed Apoyo-Demia's **full migration history** onto an empty database, not just the new file on top of an existing one. Result: `Vertical` = `DEMIA, SOCIAL, SALON, APPAREL, FOOD`; config rows `SOCIAL=t, SALON=t, APPAREL=f, FOOD=f`. `migrate diff` **clean** for Apoyo-Demia. `tsc --noEmit` clean in Apoyo-Demia *and* portal-web; **portal-web's 61/61 tests still pass** (unchanged count — correct, since adding a scope entry alters no existing expectation).
- **Membership read/create round-trips** — `scripts/verify-ecosystem.ts` (committed) exercises Food's own `lib/ecosystem.ts`, not curl, at **15 checks, 0 failures**. Testing the client is the point: a curl transcript proves the server works, not that this app talks to it correctly. Covers the §6b payload reporting `FOOD: false`, the lazy `(FOOD, CLIENT)` buyer mint, `(FOOD, PROVIDER)` for the seller, TTL-cache busting on write (a read straight after a write is fresh, not 60s stale), upsert idempotency under a double commitment, and **scope containment: `food-app` writing SALON, APPAREL *and* DEMIA is 401'd**, while a vertical that isn't in the enum at all fails at *validation* (422) instead — two independent gates, and the test distinguishes them rather than lumping both under "rejected".
- **A real shared-cookie session decodes here** — minted with portal-web's exact claim shape and salt, verified over HTTP against a **production build**. Unauthenticated → `{"session": null}`, nothing else.

**The staleness gap is reproduced here, not merely inherited from Apparel's notes.** One live request against Food showed:
```
session.memberships   : []                                   ← JWT claim, stale
ecosystem.memberships : [{FOOD, PROVIDER, ACTIVE}]           ← API, authoritative
guards.seller         : { open: true, slug: "_verify-cocina-slice3", status: "ACTIVE" }
```
A guard trusting the JWT claim would have **denied a seller the dashboard they had just successfully created**. `requireFoodSeller` reads the ecosystem API for exactly this reason, and the guard opening on an empty claim is the proof it does. The same request also shows `legacyRole: "CLIENT"` alongside a FOOD PROVIDER membership — **tie-up #1 holding as designed**. The full status gate Slice 13's shell depends on was verified by flipping a real row through all three values: **ACTIVE → open, PENDING → closed, SUSPENDED → closed**, plus `role: ADMIN` → admin guard true.

**The cookie-name trap was reproduced deliberately rather than merely documented.** A token minted with *dev* naming (`authjs.session-token`) and sent to the *production* build returns `{"session": null}` — no error, no log line, nothing to debug. `next start` forces `NODE_ENV=production`, and because portal-web passes `salt: sessionCookieName`, next-auth v5 derives the JWE key from (secret, salt), so a mismatched name makes the token **undecryptable**, not merely un-found. Both sides compute the name from `NODE_ENV === "production"`; they must never drift.

**Findings and calls worth carrying forward:**
- **⚠ A test of mine passed vacuously and was caught.** The first run of the seller-status matrix reported `open: false` for ACTIVE, PENDING and SUSPENDED alike — which looked like a coherent "guard is closed" result. It wasn't: the helper script had been written to the system temp directory, outside the repo, so `require("@prisma/client")` couldn't resolve and **the seller row was never created at all**. Three identical "correct-looking" failures were actually three no-ops. Re-run from inside the repo, ACTIVE correctly opens. Worth recording because the failure mode was silent agreement with the expected answer.
- **`next-auth` pinned to `5.0.0-beta.31`** (`--save-exact`), the exact version all four existing apps resolve — JWT wire-format compatibility, not a dependency preference. ⚠ **Latent ecosystem risk, unchanged and still not Food's to fix:** Apoyo-Demia and portal-web both still declare the floating tag `"next-auth": "beta"` (verified again this slice — portal-web `package.json:19`). A fresh `npm install` in either could resolve a newer beta and break cross-app JWT decode for *every* vertical.
- **⚠ A NEW `food-app` service token must be added to `ECOSYSTEM_SERVICE_TOKENS`** in the identity app(s) before Food's first deploy — the `APP_VERTICAL_SCOPE` grant alone does nothing without a matching token, and the token alone does nothing without the grant. Recorded in `.env.example`. Do not reuse `salon-app`'s or `apparel-app`'s.
- **portal-web already had a `.env.local`** which the concurrent session may depend on, so it was **not modified**; the local run passed overrides as environment variables instead (Next does not override already-set `process.env`). ⚠ Next still logs `Environments: .env.local`, which looks like the file won — it hadn't. That was **verified before any write**, by confirming a live external connection to the throwaway database in `pg_stat_activity`, rather than assumed.
- **`adminMayLoadData()` exists in `lib/auth-guards.ts` from this slice**, ahead of Slice 16's admin pages, carrying the Portal RSC-payload-leak warning at its definition — a layout gate controls what is *displayed*, not what *executes*.
- **`resolveFoodSeller()` (any standing, no membership check) is separate from `requireFoodSeller()`** (ACTIVE row + ACTIVE membership) because Slice 13's shell must *render* PENDING/SUSPENDED states rather than return unauthorized. Note Food's `SellerStatus` is `PENDING|ACTIVE|SUSPENDED` — there is no `APPROVED` value; the guard checks `ACTIVE`.
- **Only ONE ecosystem token is declared.** `PORTAL_CLAIMS_SERVICE_TOKEN` is deliberately absent from `.env.example`: Food pushes no `TimeClaim`s in any phase (Part B3), so there is no second service to authenticate to. The same-name-different-value gotcha is recorded there anyway, for whoever adds it if an exclusive-time feature ever exists.
- **`.env.example` deliberately omits `NODE_ENV`**, and now says why: it is set by the Next runtime and cannot be overridden from a `.env` file, but `lib/session.ts` reads it. Listing it would invite someone to "fix" it and silently break session decoding. An env-var completeness sweep (Salon's E5 check) otherwise reports every `process.env` reference as present.
- `scripts/mint-test-session.ts` is **test tooling only**, inert without `AUTH_SECRET`, and mints an **empty** `memberships` claim on purpose — that is what makes the staleness case above reproducible on demand.

Files created (Food): `lib/prisma.ts`, `lib/session.ts`, `lib/ecosystem.ts`, `lib/auth-guards.ts`, `app/api/account/session/route.ts`, `scripts/verify-ecosystem.ts`, `scripts/mint-test-session.ts`.
Modified (Food): `package.json` (next-auth pin), `.env.example` (identity + ecosystem keys, NODE_ENV note).
Modified (**Apoyo-Demia**): `lib/ecosystem-auth.ts`; created `prisma/migrations/20260730170000_seed_food_registration_config/`.
Modified (**portal-web**): `lib/ecosystem-auth.ts`.

### Slice 4 — Storage & media pipeline

Read: arch doc Part C (storage abstraction), Part G (EXIF/privacy — hard requirements); Apparel Slice 4 notes (the `lib/storage.ts` abstraction pattern, and the `sharp` version-pin lesson — **pin `sharp` ≥0.35.0**, Next's bundled version is under an active advisory).

- `lib/storage.ts`: a small interface (`put`, `getUrl`, `delete`) with **local disk as the default implementation** (`UPLOADS_BASE_PATH` + an app-served route, same proven pattern as Salon/Portal/Apparel) — no R2 dependency to stand up before this slice is done. R2 is a documented future swap behind the same interface, built only once the account exists (arch doc Part C).
- Upload route handler → auth guard → MIME sniff + size cap → `sharp` re-encode (strips ALL metadata including EXIF GPS) → variants (thumb 400w / card 800w / full 1600w) + blur LQIP → storage driver `put()` → return stored paths + blurDataUrl.
- `next/image` custom loader pointed at whichever driver is active; `<FoodImage>` wrapper component (blur-up, aspect handling — 4:3 meals / 16:9 cover / 1:1 avatars per Part F3).
- Throwaway script proving: EXIF GPS present in input → absent in every stored variant.

**Done when:** an upload through the route lands variants + blur via the local-disk driver; EXIF-strip proof passes; `<FoodImage>` renders blur-up in a test page.

**Implementation notes (done 2026-07-30):**

`sharp` pinned to **`^0.35.3`** as a real runtime dependency (the Slice 1 finding — Next bundles a version under an active libvips advisory). `piexifjs` + its types are devDependencies, used only to build a genuinely GPS-tagged fixture.

**Architecture:**
- **`lib/storage.ts`** — local disk is the default and only driver; R2 + a CDN custom domain is a documented future swap, deliberately not a Phase-0 dependency (the account doesn't exist, and a demo must not block on provisioning one). No caller ever touches a filesystem path: writes return a storage KEY, reads go through `resolveStorageKey`, which is also the traversal guard. **"No raw uploads anywhere" is structural, not a rule to remember** — the module has no "write the original bytes" function at all, so there is no code path that CAN persist an unprocessed upload.
- **`lib/media/validate.ts`** — size cap + magic-byte sniffing, narrowed to jpeg/png/webp. No PDF case: Food has no document upload in this plan, and Phase 9's verification documents go to a separate private bucket under Salon's locked policy (Part G), never through here.
- **`lib/media/ingest.ts`** — the engine (validate → `.rotate()` → variants → blur), plus **six one-line presets** covering every photo-bearing field in Part D: meal 4:3, seller gallery 4:3, avatar 1:1, cover 16:9, story 4:5, category hero 16:9. Adding a preset is a wrapper, never new pipeline code.
- **`lib/media/image-loader.ts`** — the custom `next/image` loader, wired via `images.loaderFile`.
- **`app/api/media/[...path]`** — the public serve route (storefront content is anonymous-browsable, so deliberately not auth-gated; the traversal guard applies regardless). **`app/api/media/upload`** — server-mediated upload behind a session guard.
- **`components/food-image.tsx`** — the one way Food renders stored media: blur-up, the aspect lock for the image's role, and the cream frame + 16px radius that make mismatched amateur phone photos read as one set.

**⚠ Two deliberate divergences from Apparel's equivalent slice, both load-bearing:**
1. **One media id is shared across an image's variants** (`<id>-thumb.webp`, `<id>-card.webp`, …), where Apparel mints a fresh UUID per variant. This is what makes the custom loader possible at all: it swaps the suffix on a key to serve the right size for a requested width. With per-variant ids, one key tells you nothing about its siblings and a custom loader cannot work. Slice 4's brief asks for that loader, so the ids are shared.
2. **No `lib/media/cleanup.ts`.** Apparel reserved a background-removal slot because a garment photo wants its background gone. Food's architecture never asks for it — cream framing, not cut-outs, is how Part F3 unifies amateur photos — so porting the hook would have been cargo-culted structure with no caller.

**Why EXIF is provably gone, not assumed gone:** `.withMetadata()` is never called anywhere in the pipeline, which is what makes sharp discard EXIF (incl. GPS), ICC and XMP on output; `.rotate()` with no arguments applies the EXIF Orientation tag to the PIXELS first, so a portrait phone photo doesn't come out sideways once the tag is discarded. Both halves are asserted, and the check scans the **raw output bytes** for the JPEG APP1 marker and the WEBP `EXIF` FourCC chunk rather than trusting sharp's own metadata reader to report honestly about its own output.

**All three done-when criteria verified for real, twice — once through the pipeline directly, once over live HTTP against a production build:**
- **`scripts/verify-media.ts`** (committed, `npm run verify:media`) — **58 checks, 0 failures**, and it is self-cleaning (asserts the uploads tree is back to its starting file count). The GPS fixture is a **real JPEG with a real GPS EXIF block** built with `piexifjs`, and its tag is **independently confirmed present before the pipeline runs** — via a raw APP1 byte scan *and* piexifjs's own reader — so the "EXIF is gone" assertions afterwards are proving something that was genuinely there. Covers all three variants at exact pixel dimensions for all four aspect presets; blur decoding as a real 16×12 JPEG under 2 kB; **a full filesystem walk confirming the uploaded buffer was never written anywhere byte-for-byte** and that every file present is a pipeline-produced `.webp`; four classes of bad upload rejected with a before/after file count proving none touched disk; 10 traversal payloads rejected; and the loader's variant selection including its boundary (400px → thumb, 401px → card).
- **Live HTTP pass** against `npm run build && npm start`: all three variants served with `Content-Type: image/webp`, the immutable cache header, and decoding at exactly 400×300 / 800×600 / 1600×1200. Traversal payloads and a well-formed-but-missing key all 404 over real HTTP, not just in the script.
- **A real authenticated upload of a GPS-tagged JPEG** → 201 with three keys sharing one media id, a 383-char blurDataUrl and a 1600×1200 canonical size; fetching the stored variant back shows **no EXIF and no exif block**. Anonymous POST → **401**; garbage-declared-as-jpeg → 422 (magic-byte mismatch); unknown `kind` → 422.
- **`<FoodImage>` renders blur-up in a browser** (Playwright, zero console errors), all four aspects correct. Confirmed in the emitted HTML that the blur data URLs are genuinely inlined and that the loader emits a real variant srcset — `200w`/`400w` → `-thumb`, `800w` → `-card`, `1200w`/`1600w` → `-full`.

**Findings worth carrying forward:**
- **⚠ The Windows sharp-handle finding is real and was pre-empted, not rediscovered.** `sharp.cache(false)` is called at the top of the verification script: sharp/libvips holds native file handles in an internal operation cache for the **process's** lifetime, not transiently, so a script that ingests and then deletes its own files hits `EBUSY` on every one. Irrelevant on the Linux VPS; needed for any verification script run repeatedly on this machine.
- **A judgement call on Fresh Today's stored aspect, flagged rather than buried.** Part F3's imagery line says "avatars & Fresh Today thumbnails 1:1", which describes how the RAIL CARD presents the image — and it still does, via a CSS `.aspect-thumb` crop of the thumb variant. But the same photo fills the **full-screen viewer** (Part E2), and storing it square would mean either heavy upscaling or discarding most of a portrait phone photo before it ever reaches the viewer. Stored 4:5 so both surfaces get real pixels. If a later slice decides the viewer should be square, changing `STORY_VARIANTS` is the entire change.
- **The upload route's auth is intentionally coarse right now** — any authenticated user may upload, because per-resource ownership ("is this YOUR listing") can't be checked before the resources exist (Slices 13/14/15). What it *does* guarantee today is that an anonymous request can never write to storage, which is the part that must not wait.
- **`NEXT_PUBLIC_MEDIA_BASE_URL` is the entire R2 swap at the call-site level.** The loader runs in the client bundle, so it must stay dependency-free and may only read `NEXT_PUBLIC_*` vars — hence the base URL lives there rather than in `lib/storage.ts`'s server-side helper alone.
- ⚠ **Prod must set `UPLOADS_BASE_PATH` outside the git checkout** (recorded in `.env.example` and in the deploy-prereq list) — the dev fallback is `<repo>/uploads`, which a `git pull` on the VPS must never be able to touch.
- My own first `tsc` pass failed on the fixture's `thumbnail: null` (`@types/piexifjs` types it `string | undefined`); the property is now omitted. `tsx` doesn't typecheck, so the script ran fine before the type error was visible — worth remembering when a script "works" but the build hasn't been run yet.

`components/scaffold/media-proof.tsx` joins the scheduled-death set (Slice 7 deletes it with `token-proof.tsx` and `surface-banner.tsx`). On first load it pushes a synthetic photo through the REAL pipeline once and caches the result in `uploads/_media-proof.json` (gitignored); every later load only reads that cache, so the blur-up on screen is genuinely a stored LQIP being replaced by a stored variant — the production path, not a mock.

Files created: `lib/storage.ts`, `lib/media/validate.ts`, `lib/media/ingest.ts`, `lib/media/image-loader.ts`, `components/food-image.tsx`, `components/scaffold/media-proof.tsx`, `app/api/media/[...path]/route.ts`, `app/api/media/upload/route.ts`, `scripts/verify-media.ts`.
Modified: `next.config.ts` (custom image loader), `package.json` (`sharp` runtime dep, `piexifjs`/`@types/piexifjs` devDeps, `verify:media` script), `.env.example` (storage + media base URL), `app/(client)/page.tsx` (renders the media proof).

### Slice 5 — i18n & translation wiring

Read: arch doc B1 (translate service), E6 intro; Apparel Slice 5 notes — **`kap64-translate` is confirmed NOT reachable from local dev** (VPS-only by its own design, no local GCP/LibreTranslate creds). This is not a bug to chase; build the degrade path (original text always delivered if the service is down) and verify both paths with a real HTTP stub standing in for the success case.

- `next-intl` skeleton: en/es message catalogues, locale cookie, the surface-default mechanism (client `en`, seller dashboard `es`).
- `lib/translate.ts`: calls `TRANSLATE_SERVICE_URL`, stores `originalText`/`originalLocale`/`translations Json` (computed once, never recomputed) — the shape Salon and Apparel both already use for their message/listing text.
- Verify: a real HTTP stub server standing in for `kap64-translate`'s success path, and the genuine down-service case for the degrade path (original text delivered, no user-facing error).

**Done when:** both the translate-success and translate-down paths are verified against something real (a stub server), not assumed; locale switching works end to end on a placeholder page.

**Implementation notes (done 2026-07-30):**

**Most of this slice's first bullet was already built in Slice 1** — the `next-intl` skeleton, en/es catalogues, the `NEXT_LOCALE` cookie and the surface-default mechanism (client `en`, seller dashboard `es`) all landed there and were verified then. What was genuinely outstanding: the **visible ES/EN toggle**, `lib/translate.ts`, the stored-translation helpers, and proving both service paths.

**⚠ Live-state finding, re-checked at this slice rather than inherited:** `kap64-translate` is **not reachable from local dev** — nothing listens on `:5500` or `:5600` on this machine. It is VPS-only by its own design ("runs at localhost:5500 … never proxied through Nginx"), and this machine has neither a GCP service-account key nor a LibreTranslate install. Salon's and Demia's own `.env.local` point at the same URL, so this is the ambient dev reality, not a Food problem. **Consequence: the service-down path is the DEFAULT state here, not a scenario that has to be staged** — so it is exercised against the genuine absence of the service, and only the *success* path needs a stand-in.

**Architecture:**
- **`lib/translate.ts`** — client for the shared microservice. **Only `POST /translate` is ported.** kap64-translate also exposes `/translate/literal` (a Qwen-backed word-for-word rendering) and `/status`, but Food's plan has no literal-translation UI anywhere — Part E6 wants one natural translation shown gently beneath the original. Porting an endpoint with no caller would be cargo-culted surface, the same call made about Apparel's `cleanup.ts` in Slice 4.
- **`lib/bilingual.ts`** — `prepareTranslatedText` (send-time, **never throws**) and `resolveTranslatedText` (read-time, **zero network calls, ever**). Shaped for Food's `FoodOrderMessage` triple (`originalText` / `originalLocale` / `translations`), NOT Apparel's generic per-field `<field>Translations` convention — because Food's schema deliberately has no bilingual columns on listings or bios. Part D never asked for them: a seller authors a dish description once in their own language, and Part E3 handles cross-language *discovery* with unaccent + trigram matching rather than by storing two copies of every listing.
- **Eager (send-time) rather than lazy (read-time, as Salon's chat does):** Salon translates per (message, reader-locale) pair because a reader's locale isn't known until they open a thread. Food is en/es only, so there is exactly ONE other locale a message could ever need — one call at send time covers every future reader, which is what Part E6 asks for.
- **`components/locale-toggle.tsx`** — the ES/EN pill, in the header of **both** surfaces. Part F3 is emphatic that this is "bilingual as brand, not a hidden setting", so it is chrome from this slice rather than a future settings-page item.

**⚠ A real bug in `lib/translate.ts`, found by the verification catching itself lying.** The first run reported **24 pass / 1 fail** — and investigating the single failure showed that **three earlier PASSes were vacuous**. The script points at a different stub per scenario and cache-busted `lib/bilingual.ts` between them, but `bilingual`'s own static import of `lib/translate.ts` was **not** busted, and `translate` captured the service URL in a module-level `const` evaluated once at first import. So the 503 scenario never saw a 503, the `skipped` scenario never saw a skip, and the "service genuinely absent" scenario never reached `localhost:5500` — all three were quietly talking to the *first* stub's by-then-closed port, degrading for the right-looking reason via the wrong mechanism, and reporting success.

Two fixes, and the first is a deliberate divergence from Salon/Apparel:
1. **`lib/translate.ts` now reads `TRANSLATE_SERVICE_URL` at CALL time, not into a module-level const.** A const makes the module's configuration depend on import *order*, which is a genuine footgun that drew blood immediately. Reading `process.env` per call costs nothing measurable server-side. Apparel keeps the const and works around it with dynamic imports; this is the version without the trap.
2. **Every scenario now asserts its stub actually received the request** (`stub.requests.length === 1`), so a scenario that silently stops exercising what it claims fails instead of passing. That anti-vacuity assertion is the part worth copying, more than the fix itself.

**Both done-when clauses verified against something real, three times over:**
- **`npm run verify:translation` — 28 checks, 0 failures.** The success path runs against a real in-process HTTP server implementing kap64-translate's *documented* contract (`{translated, provider, fromCache, detectedLang, skipped}`); `lib/translate.ts`'s own `fetch` is never mocked — a real HTTP round-trip, just to a stand-in origin. Covers: the request really asking for the *other* locale with the author's locale as source; "computed once" (three further reads across two locales leave the call count at exactly 1); the **genuine absent-service** degrade; the service's documented **503** degrading identically; `skipped: true` (source == target) deliberately **not** stored as a translation, so a thread never renders the same string twice; blank text making no call at all; trimming; and a legacy row with null locale/translations resolving safely.
- **Both paths exercised in the running app**, not just in a script. With the service absent, the page shows the Spanish original plus an explicit degrade note and **no** "translated" label or toggle — confirmed on screen, because a raw-HTML grep found those strings even when unrendered (they are serialized as client-component props). With a stub configured, the page shows the English translation, "Translated automatically", and the toggle. **Computed-once was re-proven end to end in the app**: four page loads across two locales produced exactly ONE call in the stub's own log.
- **Interactive browser verification — 17 checks, 0 failures** (Playwright, zero page errors): "See original" swaps to the Spanish original and relabels, and back again; the locale pill flips `<html lang>`, switches the whole catalogue (not just the widget), and sets the cookie; **each pill segment clears 44px in BOTH directions** (Apparel found padding alone left one segment at 43.6px); the toggle sits in the right half of the header; an ES viewer sees the author's own language with **no toggle rendered at all**; and the seller surface defaults to `es` while still carrying the toggle.

**Findings worth carrying forward:**
- **⚠ I made the same module-resolution mistake twice now** (Slice 3's Prisma helper, and this slice's Playwright script): a script written into the **scratchpad** cannot resolve bare specifiers from another directory's `node_modules`, because ESM/CJS resolve from the *file's* location, not `cwd`. In Slice 3 it produced three vacuous "correct-looking" results. Fix for the shared browser tool specifically: `createRequire("C:/Users/Karpa/.claude/tools/browser-testing/package.json")`. Write verification scripts inside the repo whose deps they need, or anchor the require explicitly.
- **A raw-HTML grep cannot tell you what a page renders.** Strings passed as props to a client component appear in the inlined RSC payload whether or not the component renders them — the degrade-path check looked like a bug until it was confirmed on screen. Use the browser for "is this visible" claims.
- **`skipped: true` handling is a real product detail, not a formality:** the service echoes the input back when source == target. Storing that as a translation would render the same sentence twice in an order thread.
- **The toggle's unselected segment uses full `ink`, not `ink-muted`** — the pill sits on the `sunken` surface, where `ink-muted` measures 4.37:1, below the bar (the Slice 1 finding, applied).

`components/scaffold/translation-proof.tsx` (+ its client half) joins the scheduled-death set — Slice 7 deletes them; the real bilingual surface is Slice 18's order thread rendered from actual `FoodOrderMessage` rows. It caches its computed triple in a file rather than the database on purpose: a `FoodOrderMessage` needs an order, which needs a seller and a listing, and fabricating that chain to demonstrate a text triple would put fake commercial rows in the dev DB. ⚠ Its cache (`uploads/_translation-proof.json`, gitignored) currently holds a translation produced by the **stub**, not by the real service — delete that file to recompute honestly against whatever is configured next.

Files created: `lib/translate.ts`, `lib/bilingual.ts`, `components/locale-toggle.tsx`, `components/scaffold/translation-proof.tsx`, `components/scaffold/translation-proof-client.tsx`, `scripts/verify-translation.ts`.
Modified: `app/(client)/layout.tsx` + `app/food/layout.tsx` (toggle in both headers), `app/(client)/page.tsx` (renders the proof), `messages/{en,es}.json` (`localeToggle` + `translation` keys), `package.json` (`verify:translation` script).

### Slice 6 — Deploy skeleton (Phase 0 exit) — VPS deploy #1

Read: `VPS_DIRECTORY_MAP.md` (full — recipe section, non-root PM2 war story, no-SSH ruling), `VPS_INVENTORY.md`, `APOYO_ECOSYSTEM.md` E2–E6/E8, Apparel Slice 6 notes **in full** — two ecosystem-wide gotchas found during Apparel's own deploy apply here too: (1) creating a domain's folder by hand before the Hestia domain exists breaks `v-add-web-domain` — create the Hestia domain FIRST, then clone into the folder Hestia scaffolds, not the reverse; (2) a vertical's bare dashboard root (`/food`) needs its own **exact-match** nginx location in addition to the trailing-slash-prefixed one, or a bare request falls through to the portal host's catch-all instead of reaching Food.

- User-driven (commands handed one step at a time): Hestia domain `food.apoyolime.com` + SSL; clone to `/home/user/web/food.apoyolime.com/private/apoyo-food` (account key exists — don't regenerate); `apoyo_food` DB + role (**+ `GRANT ALL ON SCHEMA public`**, extensions as superuser, percent-encoded password); prod `.env`; `migrate deploy`; build.
- PM2 `food-web` under **`user-pm2`** on :3012 (**`ss -tlnp` first** — E3), `next start -H 127.0.0.1` via args (E8 #3), `ecosystem.config.cjs` if ESM (E8 #2).
- nginx: `food.tpl`/`.stpl` copied from `salon.tpl`/`apparel.tpl` pattern (port 3012), applied via `v-change-web-domain-proxy-tpl`; portal domain gets `nginx.ssl.conf_food` drop-in (`/food/` → :3012 **plus** a paired `location = /food` exact-match, per the Apparel finding above); `nginx -t` then `systemctl reload nginx` (not `v-restart-proxy` — Salon finding).
- `deploy.sh` (E5 pattern + Salon's env-var check) + `.gitattributes` (`*.sh text eol=lf`, E4); `DEPLOYMENT.md` with actuals.

**Done when:** `https://food.apoyolime.com` serves the styled placeholder over SSL, both with and without a trailing slash on the bare root; production sign-in against the live issuer (portal-web) works; `portal.apoyolime.com/food` reachable and host-gated.

**Implementation notes (done 2026-07-30):** ✅ **Phase 0 exit — Food is live on the VPS.**

Executed live end to end, guided one command-batch at a time (no SSH from sessions —
`VPS_DIRECTORY_MAP.md`), every step confirmed by real pasted terminal output before the next mutating
one. Full transcript and real values: `DEPLOYMENT.md` (gitignored).

**Local artifacts, built and validated before any VPS command:**
- `deploy.sh` — diff-aware redeploy (E5): skip `npm ci` unless the lockfile moved, always run
  `migrate deploy` (idempotent, catches drift a file-diff would miss), warn-not-block env-var check,
  restart `food-web`. Run as root **unwrapped** (E6). No `food-sweep` line — that arrives with
  Slice 15/19. `bash -n` clean, LF-only confirmed, and the env-check block was dry-run standalone.
- `.gitattributes` (`*.sh text eol=lf`) at Food's first `.sh` file, per E4.
- **The `/food` trailing-slash behaviour was verified against Food's own production build before any
  nginx was written**, rather than assumed to transfer from Apparel: `/food/` → 308 → `/food`,
  `/food/admin/` → 308 → `/food/admin`. That is what makes the paired exact-match + prefix nginx
  locations necessary.

**⚠ THE FINDING OF THIS SLICE — PM2 ran the app on the wrong Node, and it did not look like that at
all.** After a clean migrate/build/seed, `/` returned **500** while `/browse`, `/search`, `/login`
and `/api/health` all returned **200**. The error log said `SyntaxError: Unexpected token 'with'`.
Ruled out permissions (`user CAN write` to `UPLOADS_BASE_PATH`) and sharp (loaded fine, libvips
8.18.3). **Root cause: `pm2 start npm …` without `--interpreter` runs the app under `/usr/bin/node`
v18.19.1, while the app was `npm ci`'d and built under nvm v22.23.1.** Node 18 cannot parse ES2025
import attributes, so *only* the routes whose module graph contains that syntax fail — which presents
convincingly as a bug in one page rather than a runtime mismatch. Fix: `pm2 delete` + `pm2 start
node_modules/.bin/next --interpreter /home/user/.nvm/versions/node/v22.23.1/bin/node -- start -p 3012
-H 127.0.0.1`; delete-and-start because the interpreter is frozen at process creation.
- ⚠ **`apparel-web` has the identical unpinned mismatch** and is healthy only because no Apparel route
  has tripped it yet. Flagged to the user for the concurrent session.
- Also: **`pm2 start npm` is strictly worse than `pm2 start .../node_modules/.bin/next`** — pinning
  the interpreter on `npm` doesn't govern the child npm spawns, which resolves `node` from PATH.
- Written up as ecosystem ruling **E10** (`APOYO_ECOSYSTEM.md`), plus `VPS_DIRECTORY_MAP.md` and a
  full `VPS_INVENTORY.md` refresh — that file was stale since 2026-07-14 and still described PM2 as a
  single root daemon, which E2 had already superseded.

**Three more ecosystem-wide findings, all recorded in E10:**
1. **E8 #3 had only ever been applied to Portal's two processes.** Audited live: `apoyo-portal`
   (:3010) and `apoyo-portal-web` (:3011) bind `127.0.0.1`; **`demiadoll-web` (:3000), `salon-web`
   (:3003) and `apparel-web` (:3013) all bind `*`** — reachable from the public internet, bypassing
   nginx. `food-web` was deployed correctly on `127.0.0.1`, verified before `pm2 save`.
2. **Hestia proxy templates carry no `client_max_body_size`**, so nginx's 1 MB default would 413 every
   photo upload while the app's own `MAX_UPLOAD_MB=10` looks correctly set. Food's template sets
   `12m`. ⚠ Apparel's has none and Apparel has an upload route.
3. **`systemctl reload nginx` is graceful — wait 2-3s before asserting with `curl`.** An immediate
   `curl` returned Hestia's static 404 page for `/api/health`, then correct JSON on every later
   attempt with no config change. I initially read this as a routing failure and said so; it was a
   worker-cycle race. Sleep after a reload.

**Deploy specifics:** the Hestia domain **already existed** (created the same morning, SSL already
issued, empty scaffolded `private/`), so `v-add-web-domain` was skipped — the benign version of the
trap Apparel hit. DB `apoyo_food_prod` / role `food_app`, password `openssl rand -hex 24` so
`DATABASE_URL` needed no percent-encoding. `unaccent` + `pg_trgm` created as superuser **before** the
first `migrate deploy`, exactly as Slice 2's migration header warned. Media lives at
`private/uploads`, a **sibling** of the checkout, so a redeploy can never touch it. `AUTH_SECRET` was
copied machine-to-machine from portal-web's `.env` and verified **by length only** — it never entered
the session transcript.

**All done-when criteria met:** `https://food.apoyolime.com/` 200 over SSL with `/food` correctly
404 (host-gating working in production); `portal.apoyolime.com/food` 200 and **proven to serve Food's
own dashboard** — `<title>Apoyo Food</title>`, `<html lang="es">`, "Panel del vendedor" — rather than
the portal app returning a 200 of its own, which a status-code-only check would not have caught;
`/food/` → 308 as designed; every sibling domain untouched; `deploy.sh` re-run genuinely idempotent
with the interpreter still node 22 and `unstable restarts 0`; unauthenticated `/api/account/session`
→ `{"session":null}`; 12 categories seeded in prod.

**Deliberately outstanding:** the **live browser sign-in** check (needs a real portal-web session —
handed to the user, with the caveat that `ecosystem` will report an error and `guards.seller` will be
closed, both expected); the **`food-app` ecosystem token**, deferred to Slice 13 exactly as Apparel
deferred its own; and a second spaced-out `user-pm2 list` health check.

Files created: `deploy.sh`, `.gitattributes`, `DEPLOYMENT.md` (gitignored). Modified:
`lib/session.ts` (defensive `getToken` guard — see below), `BUILD_SLICES.md`.

**Unrelated but found during this slice — two CRITICAL npm advisories.** `npm ci` on the VPS reported
`2 critical`, where Slice 1 had recorded none; I had not re-audited after Slices 3-5 added
`next-auth`, `sharp` and `piexifjs`. Both criticals are `@auth/core` via the pinned
`next-auth@5.0.0-beta.31`. Of its three advisories, two are issuer-side (email normalisation, OAuth
PKCE cookie binding) and do not apply to Food, which has neither email flows nor OAuth providers. The
third — *"`getToken()` throws an uncaught exception on malformed Bearer authorization headers"*
(GHSA-xmf8-cvqr-rfgj) — is on Food's hot path. The vulnerable code genuinely exists in the installed
source (`@auth/core/jwt.js:92-94`), but **it was not reproducible**: six malformed Bearer shapes and
four garbage/empty session cookies all returned 200 against a production build with nothing logged.
`lib/session.ts` now wraps `getToken` in a try/catch returning null, as proportionate insurance —
`getFoodSession` runs on nearly every request, so an uncaught throw would 500 the whole surface rather
than degrade one signed-out request. ⚠ **`next-auth` was deliberately NOT bumped**: the beta.31 pin is
JWT wire-format compatibility with the issuer and every other vertical, so moving off it is an
ecosystem-wide lockstep decision, not Food's to make unilaterally. Escalated to the user. Note the
real exposure is portal-web's, which is both the actual issuer and still on the floating `"beta"` tag.

---

## Phase 0 code review (2026-07-31) — 6 findings, all patched

Reviewed slices 1-6 against the running production build and the live site rather than by reading
for style. Recorded here because three of the findings change conventions later slices must follow.

**1. `formatTtd` rendered a different price format per locale.** It passed the viewer's UI locale to
`Intl.NumberFormat`, so `es` produced `$1250 TTD` (no separator at four digits) and `$12.500 TTD`
(dot grouping) against `en`'s `$1,250` / `$12,500` — neither matching the spec's `$X,XXX TTD`, and
`$12.500` reads as twelve-point-five to an English speaker on a site where the language toggle is one
tap away. **Fixed: the number format is pinned to `en-TT` and no longer takes a locale parameter at
all.** User's call, and the right one — TTD is Trinidad's currency and the Spanish-speaking sellers
and buyers this serves are transacting in Trinidad. ⚠ Apparel's `lib/money.ts` has the identical bug.

**2. `PhotoVariantPaths` carried `width`/`height`, which no table has columns for.** The natural
Slice 14 call site — `prisma.foodListingPhoto.create({ data: { listingId, ...await ingestMealPhoto(…) } })`
— would have thrown at runtime on unknown fields. **Fixed by making the preset return type EXACTLY
the four DB columns**, so the spread is correct by construction; dimensions remain on
`IngestImageResult` for anything that needs them. Nothing persisted does — `<FoodImage>` locks aspect
in CSS and uses `fill`, so intrinsic dimensions would be dead columns. No migration needed.

**3. ⚠ `getMemberships` is no longer wrapped in React's `cache()` — do not re-wrap it.** `cache()`
memoizes per REQUEST, and `createMembership`'s `ttlCache.delete()` cannot reach that memo, so within
one request `read → [] , mint (FOOD, PROVIDER) , read → still []`. That is exactly Slice 13's shape
(onboarding submit mints the membership, the dashboard guard re-reads it in the same request) and the
same class of failure as trusting the stale JWT claim that `requireFoodSeller` exists to avoid.
Replaced with the TTL map plus an explicit in-flight promise map, which recovers the only thing
`cache()` was buying (concurrent callers sharing one fetch) without tying correctness to a request
scope this module cannot invalidate. ⚠ **Salon and Apparel both still wrap theirs.**
- Worth knowing how it was missed: Slice 3's `verify-ecosystem.ts` asserts "a read straight after a
  write is fresh" and **passes** — but it runs in a plain Node script where `cache()` has no request
  scope and simply calls through. The assertion never exercised the memoized path. A test can pass
  for the wrong reason.

**4. `/api/media/upload` had no rate limit** — any authenticated user could fill the disk 10 MB at a
time, and ecosystem registration is open, so "authenticated" is a low bar. **Fixed with a new
reusable `lib/rate-limit.ts`** (fixed-window, per user AND per IP, limiting both request count and
total bytes; 429 + `Retry-After`). Deliberately not deferred on "no real users" grounds — the site is
publicly reachable. ⚠ **Slices 17/18 must reuse this module** for order creation, messages, Fresh
Today posts, follows and demand-event ingestion, all of which Part G requires limits on.
- A bug in the first draft of the fix, caught before commit: `checkRateLimit` incremented the count
  on every call, so charging bytes in a second call billed one upload as two requests and silently
  halved the limit. Hence the explicit `countRequest` flag rather than a `bytes` positional.

**5. Dead code removed** — `lib/media/ingest.ts` had a `const _mimeType … void _mimeType` block whose
only purpose was to "use" a type the assertion above it had already narrowed.

**6. A brittle assertion in `verify-media.ts`, found by the fixes themselves.** It asserted "every
file in the uploads tree is a pipeline-produced `.webp`" — but Slice 5's translation proof
legitimately caches `_translation-proof.json` in the same root, so the check failed for a completely
unrelated reason once both scaffolds had run (57/58). Scoped to the CATEGORY directories, which is
where the storage module actually writes, preserving the real invariant. Those root files were never
reachable through the serve route anyway: `safeStorageKey` demands a `<category>/<file>` shape.

**Verified clean, tested rather than assumed:** 9 live traversal/info-disclosure probes (encoded and
double-encoded, `.env`, `deploy.sh`, `prisma/schema.prisma`) all 404; all six security headers present
at the live edge incl. HSTS preload; no source maps in prod; host gating holds in production;
`x-food-surface` cannot be spoofed (middleware overwrites); `NEXT_LOCALE` cannot traverse into
`messages/`; money arithmetic exact from 1 cent to $89,999,999.99. Post-fix regression: **58 + 49 + 28
assertions across the three suites, 0 failures**, plus 16 new ones for the fixes; tsc/lint/build clean.

**⚠ Structural gap, not yet addressed: there is no `npm test`.** All verification lives in four
manual scripts (~150 assertions) that nothing runs automatically. Fine so far — but **Slice 14
explicitly requires unit tests for `lib/availability.ts`** ("this feeds every discovery badge and
filter; get it right once") and there is no harness to put them in. portal-web already uses vitest.
Stand one up at Slice 14 rather than improvising then.

---

## Phase 1 — The buyer demo (the polished surface)

### Slice 7 — `<ComingSoon>` registry & component library

Read: arch doc F3 (design system — this slice sets the visual bar for everything after), Part E1 (discovery sections), Part E2 (Fresh Today card anatomy); Apparel Slice 7 notes (the registry pattern).

- One `<ComingSoon feature="…">` component + a single localized registry mapping feature keys → title/description (en+es). Register the keys this phase will need stubbed: `request-order`, `contact-seller-follow-through` (if any), any seller-facing action reachable from a buyer-visible surface.
- Core components on Slice 1's corrected tokens: `<MealCard>` (4:3 photo, blur-up, dish name, price in `--terracotta`, availability stamp, seller mini-row), `<SellerCard>`, `<CategoryCard>`, `<FreshTodayCard>` (rounded-rectangular, freshness dot, NOT a circular ring), availability **stamp** (ink text on a `-vivid` fill), horizontal rail with snap scrolling, section headers, skeletons, bottom tab bar, filter bottom sheet shell.
- Motion pass: card fades, sheet springs, image blur-up everywhere; no spinners on browse surfaces.

**Done when:** a component-gallery test page renders every component above against seed-free dummy data, visually matching the Sobremesa spec's corrected palette; `<ComingSoon>` opens and closes correctly with localized copy.

**Implementation notes (done 2026-07-31):**

Both done-when clauses met and verified by measurement against a **production build** (`npm run build && npm start`), not by inspection: **`scripts/verify-a11y.mjs` — 180 checks, 0 failures**, across 2 locales × 2 widths (390 / 1280) × 4 routes, with the `<ComingSoon>` sheet opened and audited in all four locale/width combinations. `tsc --noEmit`, `next build` (23 routes) and `next lint` are clean with zero warnings, and the three pre-existing suites still pass unchanged (**58 media + 49 schema + 28 translation**). Host gating re-confirmed in production over real `Host:` headers, 18 host×path combinations — the new `/style-guide` route is correctly inside the `(client)` group, so `portal.*` 404s it.

**⚠ THE DECISION OF THIS SLICE — Part F3's availability-stamp rule is right about the intent and wrong about the mechanism, and the measurements are Part F3's own.** F3 says stamps render as "ink text on a `-vivid` fill". Its own table measures ink on `green-vivid` at **3.10:1**, `terracotta-vivid` **3.64**, `teal-vivid` **3.80**, and labels all three "large/bold labels & icons only". A stamp beside a price on a meal card is caption-sized, so **three of the four availability families would have shipped failing AA** — and gold, the fourth, is the only one that works (6.55:1). The rule as written is safe for exactly the component F3 wrote it for.

So `<AvailabilityStamp>` takes the **text-safe** accent instead, in both of its sizes:
- `sm` (the card pill) — accent FILL with a `card`-cream label: **5.44 / 5.49 / 5.53 / 5.72:1**, which is Part F3's own "vs card" column read the other way round (WCAG contrast is symmetric in its two inputs).
- `lg` (the ticket-shaped market stamp on the listing page, Emergent `food (7)`) — the accent on its own `-soft` tint with an accent border: **4.52–4.72:1**, F3's "vs own `-soft`" column.

Both are *more* saturated at this size than an inaccessible vivid fill would have been, and `sm` is what the mockups' own card pills (`food (9)`, `food (10)`) actually look like. `gold-vivid` — the retained bright Emergent marigold — keeps its sanctioned home on `<StatusChip tone="pending">`, where ink measures 6.55:1 and where Part F3 itself says it belongs. **Recorded rather than silently applied**, the same way Slice 1 surfaced open question 6. Later slices should treat the stamp component as the authority and not "restore" the vivid fill.

**Two of my own verification checks were wrong before any app code was, and both are worth knowing.** The first run reported 10 failures; all 10 were script defects:
1. **`sr-only` text was being measured for contrast.** The Fresh Today freshness dot carries a screen-reader label that inherits ink onto the teal dot — 2.51:1, and completely irrelevant, because it is clipped to nothing and exists only for assistive tech. `isVisible` now excludes elements ≤1px in either dimension *and* Tailwind's `clip: rect(0,0,0,0)` / `clip-path: inset(50%)`. ⚠ Apparel's `verify-a11y.mjs` has the same gap and simply has no `sr-only` text on a coloured fill yet.
2. **`.locator(sel).first()` resolved to a `display:none` element.** Both navs are in the DOM at every width (`hidden md:flex` header row, `md:hidden` tab bar), so `first()` picked the hidden one at 390px and reported a working nav as broken. `.locator("visible=true").first()` — filter *before* `first()`, not after.
- ⚠ **Because fix #1 is exactly the kind of filter that can quietly turn an audit into a no-op, the script now carries a permanent anti-vacuity self-test**: it injects two elements with the same failing colours (ink on `green-vivid`, caption size), one visible and one `sr-only`, and asserts the audit measures **exactly one** and reports **exactly one** failure. A future session that neuters the detector fails there instead of seeing a green 0-failures run. This generalises Slice 5's "assert the stub actually received the request" lesson.

**What the audit actually covers**, beyond contrast and ≥44px tap targets: `<html lang>` matching the driven locale; no horizontal overflow at 390px (the symptom of F3's ~30% Spanish expansion); no console/page errors; the bottom tab bar present at 390px and **absent** at 1280px with the header row doing the inverse; the sheet closing on Escape **and restoring focus to its trigger**; the sheet's copy being localized rather than a rendered key path (`comingSoon.features.…` would be the tell); every registry key having rendered a `data-coming-soon` trigger; the filter sheet's draft **not** applying before Apply and applying after it; every photo served through `/api/media/` with real `-thumb`/`-card` variant srcsets and inlined blur placeholders; and the €-mockup trap closed from the outside — zero `€` on the page, prices in `TTD`, `$120 TTD` present for STARTING_AT, and **no `$0 TTD`** anywhere, which is the QUOTE case.

**The `<ComingSoon>` registry.** `lib/coming-soon.ts` is pure data — key → `{ phase, slice, icon }` — with the localized title/description/action in `messages/{en,es}.json` under `comingSoon.features.<key>`. The key set *is* the type (`satisfies` + `keyof`), so a typo in `feature="…"` is a compile error rather than an empty modal in front of a demo audience. The one-line contract holds literally: `<ComingSoon feature="requestOrder" />` to add, delete that line to replace.

**Five keys, deliberately few.** Food's plan stubs *actions*, not pages — Phase 1 builds home, browse, search, category landings, listing detail, seller profiles, saves, follows and the Fresh Today viewer for real — so the only things standing in are commitments needing a seller on the other end, plus the two destinations no Phase 0–3 slice creates:
- `requestOrder` (Slice 17) — named by this slice's and Slice 10's briefs.
- `messageSeller` (Slice 18) — the brief's "contact-seller-follow-through (if any)". There *is* one, and it is worth being explicit rather than omitting it: Parts E5/E6 put **all** buyer↔seller conversation inside an accepted order's thread, so a seller profile deliberately has no "message me" control in the shipped product. A demo viewer will still reach for one, and the modal's job is to explain that privacy decision (Part G: pickup means visiting a home kitchen) instead of pretending the affordance doesn't exist.
- `buyerOrders` (Slice 17) — the nav's Orders destination.
- `becomeSeller` (Slice 13) — the "seller-facing action reachable from a buyer-visible surface" the brief asks to register. Stubbed rather than linked **because Slice 3 seeded FOOD's `vertical_registration_config` row `false` on purpose**: a CTA into a disabled registration is worse than no CTA. Slice 13 flips the row and deletes this line together.
- `buyerAccount` (phase 4) — ⚠ **an addition beyond any brief's list, and flagged as one.** Part F3's bottom tab bar has an Account destination and **no slice in Phases 0–3 builds a buyer account area at all**. Independently confirmed by reading the whole plan, not inherited from Apparel's identical finding.

**Component decisions worth not re-litigating:**
- **The modal IS the bottom sheet.** One overlay primitive for the app (`components/ui/bottom-sheet.tsx`) rather than a modal plus a differently-behaved sheet. Below 768px a true bottom sheet (bottom-anchored, grab handle, slides up); from 768px a centred card that fades and scales — a panel already mid-screen sliding from the bottom edge reads as a different component. Radix `Dialog` (already a dependency since Slice 1) carries focus trap, focus restoration, Escape, scroll lock and `aria-modal`; its **Presence** is why `tailwind.config.ts` gained `modal-in`/`modal-out` alongside the existing `sheet-down`/`fade-out`.
- **`asChild` is ALWAYS on for the sheet trigger, in both branches** — Radix renders its own `<button>` otherwise, and a button inside a button is invalid HTML the parser silently restructures, which broke hydration on every page carrying a stub in Apparel (React #418). Inherited, not rediscovered.
- **`<MealCard>` takes `priceCents` + `priceMode`, never a formatted string.** There is no code path from the card to a currency symbol other than `lib/money.ts`, so reproducing the mockups' `€` is not an available mistake. QUOTE renders "Price on request" and never `$0 TTD` — the DB forbids a price there (`food_listings_price_by_mode`), so rendering one would be a lie the schema itself rejects. STARTING_AT gets its "Desde/From" prefix per Emergent `food (7)`.
- **The whole card is ONE link, and the seller name inside it is text, not a nested anchor.** Nested interactive elements are the same parser-restructuring hazard as the button case above; Slice 11's profile is reached from the profile page.
- **Labels never sit on photographs.** `<CategoryCard>`'s name goes on an opaque accent band beneath the hero, and `<FreshTodayCard>`'s window pill is opaque `card`, not a translucent overlay. A photo's contrast cannot be constrained by any measurement taken today, because a future seed or upload chooses the pixels. Same conclusion Apparel reached about pills on seller photos.
- **`lib/category-accent.ts` fixes the Part F3 category→accent families once**, resolved from the slug *and* from the `seasonal` column (which wins, so Slice 16's admin can create seasonal categories this file predates and still get terracotta). ⚠ Its Tailwind classes are written out in full rather than interpolated — a class that only exists as a template literal is never emitted into the bundle, and the failure is silent.
- **The handwritten accent is rationed structurally.** `font-hand` is reachable only through `<SectionHeader script>`; no other component in the library can use it. Part F3 allows it for occasional section labels only, 1–2 per screen, and a rule that lives in one component cannot be forgotten at a call site.
- **`components/chrome/nav-config.ts` is the single source for both navs**, so the 390px tab bar and the ≥768px header row cannot drift into being different products. The wordmark is the Home destination and is sized as a real ≥44px target (Apparel shipped a 24px one), which is why the desktop row omits Home.
- **`prefers-reduced-motion` is honoured globally in `globals.css`**, not per-component. Every motion in this slice is 200–300ms, which is exactly the size of effect that gets added later without a `motion-reduce:` variant; a global rule means a component written in Slice 9 inherits it without remembering to.
- **`components/scaffold/translation-proof-client.tsx` was GRADUATED, not discarded** → `components/ui/translated-text.tsx`, taking its labels from the catalogue instead of having three strings threaded in. Slice 5's mechanism was never the scaffolding; the proof page around it was. Slice 18's order thread renders real `FoodOrderMessage` rows through it.
- **A visual defect only a screenshot could catch:** the Fresh Today steam-wisp mark was first drawn as two tall S-curves side by side, which at 14px rendered as **»**. Replaced with the literal shape — a solid dot with three short curls rising at different heights. `tsc`, lint, the build and 180 contrast/tap-target assertions all passed while it was wrong.

**`/style-guide` is a permanent, deliberately unlinked route** (`robots: noindex`, asserted). It replaces Slice 1's `token-proof.tsx` for the same reason that existed — making the criterion visible rather than inferred — but proves the *primitives*, which is the better proof now that they exist: Slice 1 proved the tokens were sound, which was true and said nothing about what a component composited on screen.

⚠ **Its sample photos are synthetic, and must not become the pattern for any.** They are, however, pushed through the **real** Slice 4 pipeline (real presets, real variant ladder, real EXIF-stripping re-encode, real LQIP) and served by the real storage driver through the real `next/image` loader, so the blur-up on screen is the production path — the same standing `media-proof.tsx` established for Slice 4, and a step up from Apparel's inline gradient SVGs, which Food has no reason to fall back to now that a pipeline exists. Ingest runs once and caches to `uploads/_style-guide-media.json` (gitignored); delete that file to regenerate. `getSampleMedia()` returns `null` on any failure rather than throwing — every card renders a sunken frame at the right aspect when it has no photo, which is a real state (a seller mid-onboarding, Slice 13), so a build tool can never take a page down.

**Deliberately NOT built this slice**, to keep it to the brief: `<MenuShelf>` and `<FreshTodayViewer>` (Part E2, Slice 11 owns both), `<FreshTodayRail>` as a named component (Slice 9 composes it from the generic `<Rail>` + `<FreshTodayCard>` — Part E2 mandates the name for the home board specifically), the region-map picker (Slice 13 ports it), the save heart on cards (Slice 10 adds it; the brief's card anatomy has none and neither do the mockups), and `lib/links.ts` / `NEXT_PUBLIC_SELLER_SURFACE_URL` — Apparel needed a cross-origin seller link before its Slice 12 deploy, but Food's seller entry point is a `<ComingSoon>` stub until Slice 13, which lands *after* the Slice 12 deploy. Add it there, not now.

⚠ **Four scaffold files are now unreferenced and were NOT deleted** — `components/scaffold/{token-proof,media-proof,translation-proof,translation-proof-client}.tsx`. This slice's brief says Slice 7 deletes them, but deletion needs the user's own explicit go-ahead naming the files, so it was raised rather than performed. `surface-banner.tsx` is still live in `app/food/layout.tsx` (the seller shell is Slice 13's) and `placeholder-page.tsx` is still live in all 14 route stubs — neither is a deletion candidate yet.

Files created: `lib/coming-soon.ts`, `lib/category-accent.ts`, `components/coming-soon.tsx`, `components/{meal-card,seller-card,category-card,fresh-today-card}.tsx`, `components/ui/{bottom-sheet,chip,availability-stamp,skeleton,rail,section-header,translated-text}.tsx`, `components/chrome/{nav-config.ts,bottom-nav.tsx,site-header.tsx,site-footer.tsx}`, `components/filters/filter-sheet.tsx`, `app/(client)/style-guide/{page.tsx,sample-media.ts,filter-demo.tsx}`, `scripts/verify-a11y.mjs`.
Modified: `app/(client)/layout.tsx` (real chrome), `app/(client)/page.tsx` (proofs removed), `app/globals.css` (`.rail-scroll`, global reduced-motion), `tailwind.config.ts` (`modal-in`/`modal-out`/`card-in`), `messages/{en,es}.json` (147 keys each, parity asserted), `package.json` (`verify:a11y`), `BUILD_SLICES.md`.

### Slice 8 — Demo seed

Read: arch doc Phase 1 (seed purpose) — **ask the user for the photography-sourcing decision before building** (open question 1: curated CC0/owned photos through the real pipeline, vs. a placeholder service).

- Curated seed: 8–12 sellers (varied areas/languages/specialties, realistic Trinidad names/bios — es and en mix), 40+ listings across categories/kinds/price modes, availability windows that make "today/weekend" sections non-empty on any demo day, a spread of Fresh Today posts (seed the rows now with far-future expiry flagged `seed=true` — Slice 11 needs them), follower counts, a few `FoodStoryHighlight` "Menu shelf" groups per seller.
- All images through the real media pipeline (Slice 4's local-disk driver in dev; same driver in prod until R2 exists).
- Idempotent (`db:seed` re-runnable); seed data clearly flagged for one-command removal before real launch.
- **All prices in `$X,XXX TTD`** — do not copy the €-denominated mockup values (arch doc Part F3's "do not reproduce" note).

**Done when:** fresh DB + seed → a temp index page (or Slice 9's real one) shows a full, varied, good-looking marketplace, prices correctly in TTD.

**Implementation notes (done 2026-07-31):**

**13 sellers · 50 listings · 75 photos · 50 availability windows · 13 Fresh Today entries · 21 Menu-shelf groups · 3,345 follows · 286 saves**, all through the real Slice 4 pipeline. `npm run db:seed:demo`, removed by `npm run db:seed:demo:clear`. **`prisma/verify-seed.ts` — 48 checks, 0 failures** (`npm run verify:seed`), plus idempotency proved by content hash. tsc/lint clean.

**⚠ OPEN QUESTION 1 IS STILL YOURS TO ANSWER — but it is no longer blocking, and it is now a one-line change.** The arch doc asks: curated CC0/owned photos through the pipeline (its own recommendation), or a placeholder service? Rather than answer it silently or stop the slice, photography is a **provider interface** (`prisma/seed-data/photos.ts`) chosen by `SEED_PHOTO_SOURCE`, with three implementations, all of which feed the same real ingest pipeline:
- **`mealdb` (current default)** — TheMealDB's free API. Real, correctly-matched, genuinely appetising food photography; this is what makes the done-when's "good-looking marketplace" true today. ⚠ **Its free tier is a development/demo licence and the images are user-contributed — this is not a licence to publish them as real sellers' photos.** The seeder prints that warning on every run.
- **`commons`** — the arch doc's recommended option: CC0/public-domain Wikimedia files pinned by name in a committed `photo-manifest.json`. Wired, licence-gated and ready; **the manifest is empty**, because curating it needs a human eye — Commons search is noisy enough that `pelau` returns the *Republic of Palau* and `black cake` returns a cake sculpture of a person. Measured yield on 10 Trini dish terms: 0–9 free-licensed hits each, most of them irrelevant.
- **`synthetic`** — offline, deterministic, no network and no licence question. Not photography and never will be; it exists so the seed can never hard-fail and so an offline machine can still run it. It is also the automatic fallback for any single photo the chosen provider fails on, and the run prints a tally so a silent slide into synthetic is visible rather than discovered at demo time.

⚠ **The licence gate on the `commons` provider hard-rejects anything that is not CC0 or public domain** — CC BY and CC BY-SA are free licences but carry attribution/share-alike duties that a marketplace rendering a photo as a seller's own does not discharge. Apparel's seed nearly shipped paid-tier Unsplash+ images by trusting a search endpoint; this is the same fix applied before it could happen. **Never widen that filter.**

**⚠ TWO REAL DEFECTS, both found by running rather than by reading, and both structural:**

1. **A single shared RNG stream is not deterministic across re-runs, and the failure is invisible until it isn't.** The seeder threaded one `Rng` through the whole run — which is only deterministic if every run makes the *same sequence* of draws. It does not: photos are ingested on CREATE only, so a re-run skips the `amateur`/`wantsSecond`/degrade draws entirely and **every downstream consumer silently receives different numbers**. The engagement phase then generated a different save scatter than the first run and collided on a primary key it had derived from a loop index (`P2002` on `id`). Fixed at the root with **`rngFor(label)` — a per-entity stream seeded from a stable label**, so each entity's numbers are a pure function of *its own identity* and cannot be shifted by what an earlier entity did or skipped. Order-independent and presence-independent. ⚠ Do not "simplify" this back to one stream.
   - Second, smaller half of the same fix: **row ids are derived from the PAIR, never from a loop index** (`…-follow-<userId>`, `…-save-<userId>`). An index-derived id is stable only while the iteration order is.
   - ⚠ **My first idempotency check passed while this bug was live**, because the second run crashed *after* every content-bearing row had already been re-upserted identically — the hash matched and the run had failed. Idempotency is only proven when the second run **also exits clean**; the check now requires both.

2. **Substring matching put corned-beef hash on the "grilled corn" listing.** Photo relevance was a plain `includes()`, so `corn` matched `corned beef` and `goat` matched nothing useful, giving cabbage rolls for curry goat. **Found by building a contact sheet of the seeded photos and looking at it** — nothing else surfaces this class of error, and it is the demo's face. Now word-boundary matched, with a dish's *name* preferred over its category/area, and multi-word terms requiring all words.
   - ⚠ **And the fix silently did nothing the first time**, which is the more useful half of the finding: photos are cached by ref, so an improved *selection* is never reached for a ref that already has a cached file — the contact sheet came back byte-identical and read as "my fix didn't work". The cache key now carries a **`SELECTION_VERSION`**; bump it whenever selection logic changes.
   - Residual, and accepted: a handful of loose matches remain (`BBQ party tray` → bao buns) and one pair of listings shares a photo. TheMealDB simply has no Trinidadian dishes, so the long tail cannot be fixed by better matching — it is fixed by choosing `commons` and curating, which is the open question above.

**Deliberately mixed photo quality, because Part F3 depends on it.** The design system stakes itself on cream framing making "mismatched amateur phone photos read as one set" — a catalogue sourced entirely from food-photography stock quietly removes the problem the design solves, so the demo would prove nothing. `degradeToPhoneCamera()` pushes roughly half the catalogue through a **worse camera**: careless off-centre framing, a small sensor's detail loss, auto-exposure off by ~8%, an indoor colour cast, and messaging-app recompression. ⚠ **Seed-only — it must never move into `lib/media/`**; it models a cheaper *camera*, not a different pipeline, and it runs **before** ingest, which is the order reality applies them in. Verified as *measurably* mixed rather than asserted: card variants at identical 800×600 pixel dimensions span **p25 44KB vs p75 75KB**.

**A listing's second photo is a tight crop of its own source** — real cooks shoot a wide plate shot and then a close-up, and with one source per dish a crop is genuinely what that second frame looks like, so Slice 10's gallery strip will not show the same picture twice.

**Idempotency is proven by content hash, not by "it didn't crash".** Cleared, seeded fresh, hashed; re-seeded, hashed again — **identical digest**, and the second run ingested **zero** photos (14s vs ~4min). The digest deliberately covers `createdAt` and every photo storage key, because a re-run that reshuffles a demo's "posted 3 days ago" or re-ingests files keeps the row counts identical while breaking the property. What makes it hold: per-entity RNG streams (above); upsert on deterministic `seed-*` ids with **content fields updated** so catalogue edits apply; and **timestamps and photos written on CREATE only** — photos because `writeMediaVariant` mints a fresh filename per call, so re-ingesting piles up orphaned files forever.

**Removal is one command and needs no schema support.** Every row carries a `seed-` id prefix, so `db:seed:demo:clear` deletes exactly this data and nothing else — no `seed` boolean column, no migration, and seeded rows are recognisable at a glance in the database. The category taxonomy (`prisma/seed.ts`, which *is* production data) is untouched by both.

**Data decisions worth not re-litigating:**
- **⚠ Two deliberate traps for later slices, and `verify-seed.ts` asserts both still exist.** `mama-lin-kitchen` is **SUSPENDED and still has `active: true` listings** — Slice 9's discovery queries must filter on the **seller's** standing, not just the listing's, and a seed where everyone is ACTIVE would let that bug ship. `pastelitos-y-mas` is **PENDING with a real listing** — the queue Slice 16 approves, and a second reason `active` alone is not enough. That leaves **11 ACTIVE sellers** on the buyer surface.
- **Availability is verified to make the discovery sections non-empty on *any* demo day**, not assumed to: for each of the seven weekdays, 13–23 discoverable listings recur on it. Seasonal `DATE_RANGE` windows are authored **without a year** (`-11-15`) and resolved to the **next** occurrence, so a demo run in July shows Christmas hampers as an upcoming season rather than an expired one — and the seed does not go stale in January.
- **No bilingual duplication, on purpose.** Food's schema deliberately has no bilingual columns on listings or bios (Part D, confirmed at Slice 5): a cook authors a dish once in their own language and Part E3 bridges languages at *discovery* with unaccent + trigram matching. So 14 listings are Spanish-authored and 36 English-authored, and the seed does **not** invent an English twin for a Spanish dish. This is a real divergence from Apparel, whose schema stores per-field translations and whose seed therefore had to exercise the translate helper.
- **Follows and saves are seeded** though the brief never asked: a profile reading "0 followers" and a marketplace where nothing was ever saved makes the demo look abandoned, which is the one thing a curated seed exists to prevent. Real rows are written and **`followerCount` is recounted from the table**, not trusted from the catalogue, so Slice 11 starts from a counter that agrees with its own data.
- **Fresh Today entries are seeded far-future (2027-12-31)** exactly as the brief asks, so they survive until Slice 15 rewrites them to realistic recent timestamps. A third land on the Menu shelf, so Slice 11's shelf is non-empty without every post being kept forever. Posting bumps `lastStoryAt` — Part E2 is explicit that this is presence, not a demand event.
- **Sellers get a real gallery** (`FoodSellerPhoto`, 2 each) beyond the brief, because Part F1's seller profile has one and Slice 11 would otherwise render an empty section.
- **The seed mints its own opaque `userId`s** (`seed-user-###`) and **never touches the identity database.** `FoodFollow`/`FoodSave`/`FoodStoryView` carry opaque ids with no cross-DB relation (Part D), which is precisely what makes that safe.

Files created: `prisma/seed-demo.ts`, `prisma/verify-seed.ts`, `prisma/seed-data/{catalog.ts,photos.ts,rng.ts,photo-manifest.json}`.
Modified: `package.json` (`db:seed:demo`, `db:seed:demo:clear`, `verify:seed`), `.gitignore` (`seed-assets/`), `BUILD_SLICES.md`.

### Slice 9 — Discovery: home, browse, search, demand logging

Read: arch doc E1 (sections), E3 (search v1), Part D (`FoodDemandEvent`).

- Home: hero, **Fresh Today rail** ("En la cocina hoy" — Part E2, rings from seed data, viewer is Slice 11), then E1's remaining sections (weekend/today, categories, new, trending-proxy, near-you with area-picker cookie flow, seasonal rail if an occasion window is active).
- `/browse`: filterable grid (category/area/price/dietary/availability/sort), filter state in URL, bottom-sheet UI. `/browse/sellers`: region-map picker + seller cards with area counts. `/categories/[slug]` landings.
- `/search`: title/tag/seller matching (unaccent + ILIKE/trigram-lite for now), meals + sellers tabs, empty-state design.
- **`lib/demand.ts` + ingestion — demand-event logging starts here:** SEARCH (query, normalized, area, resultCount), LISTING_VIEW, PROFILE_VIEW; fire-and-forget writes (never block a page on analytics); rate-limited.

**Done when:** home + all browse perspectives work with seed data on a phone viewport, using the corrected Sobremesa tokens; demand events land with correct normalization; zero-result searches logged with `resultCount=0`; Lighthouse mobile perf sane on hero/card images.

**Implementation notes (done 2026-07-31):**

Home (Part E1's composed sections), `/browse` with filters, `/browse/sellers` with the region map, `/categories/[slug]`, `/search`, and demand-event logging — all server-rendered against the Slice 8 seed. **`scripts/verify-discovery.ts` — 80 checks, 0 failures** (`npm run verify:discovery`), and the measured browser audit grew to **298 checks, 0 failures** across 8 routes × 2 locales × 2 widths against a production build. tsc/lint/build clean.

**⚠ THE VISIBILITY RULE IS THE LOAD-BEARING PART OF THIS SLICE.** A listing is discoverable only when the listing is `active` **and its seller is `ACTIVE`**. Every buyer-facing query in `lib/discovery.ts` and `lib/browse.ts` starts from one exported `DISCOVERABLE` constant rather than from a hand-written `where`, because this is the rule a new query forgets. Slice 8 seeded two traps for it and the verification drives both: `mama-lin-kitchen` is SUSPENDED and still owns `active: true` listings; `pastelitos-y-mas` is PENDING with a live one. Asserted absent from **every** section, from unfiltered browse, from the directory, from search by dish *and* by seller name, and — the case a listing query cannot cover — **404 on direct URL**: `/meals/trini-fried-rice`, `/sellers/mama-lin-kitchen` and `/sellers/pastelitos-y-mas` all 404 in production, confirmed over HTTP.
- ⚠ A subtle version of the same bug is closed in `buildWhere`: the area filter is merged **into** the existing `seller` clause. Two `seller` keys in one Prisma object silently overwrite each other, and the one that would have been dropped is the ACTIVE-status check — so `?area=central` would have leaked the suspended kitchen while every other route stayed clean. `verify-discovery.ts` asserts the compiled `where` still contains `ACTIVE`.

**`lib/availability.ts` arrives here, not at Slice 14.** Slice 14's brief owns it, but Part E1's "available today / this weekend" section cannot be built without it, so the module lands now and Slice 14 builds the seller-facing *window builder* on top without changing it. Two calls in it are worth not re-litigating:
- **The fixed zone is applied before any weekday comparison.** `2026-01-01T02:00Z` is `2025-12-31` in Trinidad — a server doing weekday maths in UTC lights the wrong day's badge **for every listing on the site, for four hours out of every twenty-four**. Asserted directly, along with day/month/year rollovers.
- **⚠ `leadTimeDays` does NOT make a listing unavailable today.** A two-day lead time means an order placed today is collected Thursday; the dish is very much on offer. Conflating them empties "available today" of every pre-order listing in the catalogue, which is most of the interesting ones. Slice 17 applies lead time where it belongs — validating a requested *fulfilment* date.
- Availability filtering runs **in the database**, not by loading every listing and computing in Node. Prisma has no bitwise operator, so the weekday bit is expanded to the 64 masks containing it — a trivially indexable `IN` list that keeps the work in the query planner. Node only decides which *stamp* the surviving rows wear.

**Search (Part E3) — `unaccent` is applied to BOTH sides, and that is asserted rather than assumed.** Applying it to one side fails asymmetrically: "pastelon" finds the dish, "pastelón" does not, so the Spanish-speaking user the feature exists for is the one it fails. The verification searches both spellings and asserts they return **the same set**, not merely that each returns something. Trigram similarity sits alongside `ILIKE` for the Trinidad spelling variance Part E3 names (pelau/pilau, geera/jeera). Exactly one hand-written SQL statement exists in the app; it returns ids only and everything downstream re-fetches through the normal typed selects, so nothing loses type safety and every interpolation stays parameterised.

**Demand logging (Part C: "cheap to log, impossible to backfill").** `lib/demand.ts` enforces three rules so no call site has to remember them: fire-and-forget (a browse page must never 500 because an analytics insert stalled), identities **hashed at the only place that writes the column** (Part E7's k-anonymity depends on it — asserted that the stored hash is 32 chars and is not the input), and rate limiting reused from `lib/rate-limit.ts` rather than reinvented.
- **Zero-result searches are recorded with `resultCount: 0`, not skipped** — Part E3 calls them the single most valuable signal in the system, and the verification asserts the row exists with a 0 rather than asserting "a search was logged".
- Negative counts are **clamped rather than passed to the DB**, because the CHECK constraint would reject them and take the page down — and this is telemetry, which must never do that.
- ⚠ **`LISTING_VIEW` and `PROFILE_VIEW` fire from the real `/meals/[slug]` and `/sellers/[slug]` routes now**, even though Slices 10 and 11 build those pages. Every card on the site already links there, so the signal exists to be captured and deferring it would throw a slice's worth of history away for nothing. Those two routes also enforce the visibility rule, which is why they 404 the seeded traps.
- ⚠ **`DEMAND_HASH_SALT` is a new prod-only env var** (recorded in `.env.example`). Unset, the process mints a random salt per boot — safe, but it makes the same visitor look new after every deploy and quietly inflates every distinct-user count in the Phase 6 insights. Needed before the Slice 12 deploy.

**Three defects found by looking at the rendered page, none of which any assertion would have caught:**
1. **"Trending now" rendered a two-card rail beside four full ones.** The fallback only substituted saves when the event stream was *completely* empty, so a young stream — the normal state of a fresh demo database, and of the first week in production — produced a visibly stunted section. Now it **tops up** to the limit instead of only falling back.
2. **Category cards were flat tinted blocks.** Part E1 asks for "category cards with hero imagery" and nothing had ever populated `FoodCategory.heroImage`. The seed now fills it (using each category's own dish vocabulary so the hero looks like the category). ⚠ It writes to **taxonomy, not seed data**, so those rows are deliberately *not* `seed-` prefixed and `db:seed:demo:clear` does not remove them.
3. The Fresh Today rail's window label now comes from the **linked listing's** availability where there is one — Part E2 is explicit that the card must say *what's fresh right now*, not merely *that someone posted*.

**⚠ AND THREE DEFECTS IN MY OWN VERIFICATION, which is the theme of this slice.** All three were checks that passed while testing nothing:
1. **The Slice 7 anti-vacuity self-test had itself gone vacuous — and it said so.** It injected a control element styled `bg-green-vivid text-ink text-caption` and asserted the audit still flags it. Slice 8 deleted `components/scaffold/token-proof.tsx`, which turned out to be the **only file in the repo still mentioning `bg-green-vivid`** — Tailwind stopped emitting the class, the control rendered on plain cream at 12.7:1, and the self-test reported "0 failures detected". It caught exactly the thing it was built to catch, one slice later, about itself. **Fixed by styling the control with inline styles instead of classes** (a control that depends on the build emitting a class is not a control), plus a new assertion that the control really measures 3.10:1.
2. **The new perf check summed a column of zeros.** It read `content-length`, which the media route does not set because it streams — so "0KB is under 2.5MB" could never fail, on the one page it exists to protect. Now measures the response **body**, with an explicit assertion that the total is non-zero. Real numbers on a 390px viewport: **56 images, 1,534 KB total, largest 55 KB, and every single one served as a 400px `-thumb` variant with zero `-full` files** — which is the thing a Lighthouse score would actually have been complaining about, measured directly rather than quoted.
3. **A Windows filename bug killed an entire audit run mid-flight.** Adding `/search?q=…` to the route list made the screenshot path illegal (`?` is reserved), and the ENOENT reads like a missing directory rather than an illegal name. Route names are now slugified for filenames.

**Other decisions worth not re-litigating:**
- **`/categories/[slug]` is a `/browse` view, not a second implementation** — same `parseFilters`/`browseListings` pair with the slug forced into the category filter, so the two can never drift into ranking or filtering differently.
- **Filter state lives in the URL** (Part E1's shareable-link requirement), so `<FilterBar>` holds none of its own and applying a change is a navigation. Slice 7's draft-until-Apply sheet is what keeps that to **one** navigation per filter session — which matters beyond snappiness, because per-tap navigations would turn one person's indecision into a demand signal.
- **⚠ `price-asc` puts QUOTE (null-price) listings LAST.** "Cheapest first" leading with four price-on-request cards is a bug that looks like a design choice. Asserted.
- **The region map is ported from the Apoyo-Demia app, restyled not copied.** Same geometry file, same eight `RegionKey` groupings — so "Central" means the same thing in every vertical — but Part F3's warm illustrated Trinidad in **teal**, not the original's charcoal-and-gold GIS panel. ⚠ The SVG is `aria-hidden` and the real control is a list of `<button>`s beneath it: an SVG map is the easiest place in an app to build a mouse-only control, and this one is fully keyboard-operable without it. Slice 13 reuses the component for a seller's 1–3 areas via its `max` prop.
- **Choosing an area on the directory writes the `food_area` cookie**, which is what the home page's "cooks near you" reads — so a visitor declares where they are once, not per surface. A plain cookie rather than anything signed, because it carries no authority: it reorders a rail.
- **Section 7 ("from sellers you follow") is deliberately absent.** It needs a signed-in viewer with follows and Slice 11 owns follows; an empty "from sellers you follow" heading shown to every anonymous visitor is worse than not having it.
- **Search is a real `<form>` submit, not search-as-you-type** — which is a demand-logging decision as much as a UX one: `/search` logs one event per render, so per-keystroke navigation would record "p", "pa", "pas"… as five demand signals and drown the one that matters. Part E3 defers type-ahead to Phase 5, which will need its own debounced logging rule.

Files created: `lib/{availability,browse,demand,discovery,regions,search,tt-region-paths}.ts`, `components/{fresh-today-rail,listing-grid,region-map}.tsx`, `app/(client)/browse/filter-bar.tsx`, `app/(client)/browse/sellers/area-picker.tsx`, `app/(client)/search/search-form.tsx`, `scripts/verify-discovery.ts`.
Modified: `app/(client)/page.tsx` (home sections), `app/(client)/browse/page.tsx`, `app/(client)/browse/sellers/page.tsx`, `app/(client)/categories/[slug]/page.tsx`, `app/(client)/search/page.tsx`, `app/(client)/meals/[slug]/page.tsx` + `app/(client)/sellers/[slug]/page.tsx` (visibility guard + demand events), `prisma/seed-demo.ts` (category heroes), `scripts/verify-a11y.mjs` (new routes, perf block, self-test fix, filename slug), `messages/{en,es}.json` (221 keys each, parity asserted), `.env.example` (`DEMAND_HASH_SALT`, `SEED_PHOTO_SOURCE`), `package.json`, `BUILD_SLICES.md`.

### Slice 10 — Listing detail, saves, rule-based recs

Read: arch doc F1 (page content), E4 Phase-2-equivalent recs (rule-based tier).

- `/meals/[slug]`: gallery (swipe), price/availability summary, dietary/occasion badges, seller card, "More from this seller" + "Similar in category" rails, sticky "Request order" CTA → **`<ComingSoon feature="request-order">`** (styled, not broken — real wiring is Slice 17).
- Saves: heart on cards/detail (auth-gated), `/saved` grid; SAVE demand events.
- Rule-based recs: "More from this seller", "Similar in {category}", "Popular in your area" (view/save counts) — deterministic, no cold-start problem.

**Done when:** listing detail renders fully with seed data; save/unseed round-trips; the CTA opens `<ComingSoon>` correctly.

**Implementation notes (done 2026-07-31):**

`/meals/[slug]` replaces Slice 9's placeholder wholesale — gallery, price/availability summary (one stamp per window, not just the card's single summarized one), dietary/occasion/ingredient badges, a compact seller row, three rule-based rec rails, and the sticky "Request order" CTA. The save heart is a real, shared feature: it lives on `<MealCard>` itself, so every card on the site (home rails, browse, categories, search, both rec rails on this page, `/saved`) carries it, not just the detail page.

**⚠ The anonymous-buyer question this slice would otherwise have had to answer was already resolved, in this exact ecosystem, by Apparel's own Slice 10.** Food has no client login door yet (`/login` is still Slice 1's placeholder — no slice in Phases 0–3 builds one, per Slice 7's `buyerAccount` stub note), and the ecosystem's cross-vertical login flow carries a hard rule the user set during Apparel's build: one vertical's URL/brand must never be surfaced to another vertical's visitor as a redirect target. Apparel's Slice 10 hit this, stopped, and got an explicit resolution: build Save for real for an authenticated buyer; an anonymous click shows an inline "sign in to save" hint with no link and no redirect; the real login door is separate, future work. Food's `<SaveButton>` and `toggleSaveListing` follow that resolution file-for-file rather than re-litigating it — recorded here, not silently inherited, the same way Slice 9's pulled-forward `lib/availability.ts` was surfaced rather than assumed.

**Architecture:**
- **`lib/actions/save-listing.ts`** — the one Server Action in the app so far, `toggleSaveListing`: find-then-creates/deletes `FoodSave`, calls the already-built `ensureFoodClientMembership` (Slice 3) best-effort inside a try/catch (a transient ecosystem-API hiccup must not turn a heart-tap into a failed save — the same resilience posture `lib/demand.ts` already takes for its own writes, and proven live here too: this dev environment has no local portal-web running, so the membership call genuinely fails on every save, and the save still succeeds every time), and logs `SAVE` only on the positive transition, never on unsave.
- **`lib/saves.ts`** — the read side, deliberately NOT a Server Action: `isListingSaved` (the detail page's own heart) and `savedListingIds` (a batch lookup for a grid/rail of cards — one query per page render, not one per card).
- **`components/ui/save-button.tsx`** — optimistic (the heart flips before the Server Action resolves, reverting only on a reported failure), `terracotta` fill when saved (not `green`, which stays reserved for the anchor/wayfinding rule — Part F3's non-negotiable primary-button colour).
- **`<MealCard>` was restructured, not just extended.** Its root used to BE the `<Link>`; a `<button>` (interactive content) is excluded from `<a>` by the HTML spec, the same nesting rule that already keeps the seller name as plain text rather than a nested anchor. So the outer element is now a `relative` `<div>` carrying the card's border/padding/animation, the `<Link>` inside is `display: contents` — no box of its own, so its children still lay out directly in the parent flex column and the whole photo+text area stays one click target — and `<SaveButton>` sits beside it as a sibling, absolutely positioned over the photo's corner. `save` is an optional prop; a call site that doesn't pass it renders no heart at all, so this was a non-breaking change to every existing caller.
- **`lib/discovery.ts` gained two rec functions**, alongside the already-built `mostSavedListings` (Slice 9), giving Part E4 Phase 1's exact three: `moreFromSeller` (scalar `sellerId` equality, not a second `seller` key merged onto `DISCOVERABLE`) and `similarInCategory` (anchored on the listing's PRIMARY category only — `categories[0]`, sorted by `FoodCategory.sortOrder` — so "Similar in Desserts" doesn't pull in Lunch because a dish happens to carry both tags).
- **`components/listing-gallery.tsx`** — real touch swipe via native CSS scroll-snap (no gesture library), with a thumbnail strip that both mirrors and drives the active slide via `scrollIntoView`. Full-resolution `pathFull` in the main pane, `pathCard` in the thumbnails — the split Slice 4's pipeline exists to produce. Thumbnails only render with 2+ photos.
- **`components/listing-seller-row.tsx`** — the mockup's compact inline seller card, deliberately NOT `<SellerCard>` (that's the directory's full cover-photo card, too large for an inline intro here). No Follow button: the mockup shows one, but Follow is Slice 11's real feature with its own denormalized counter, and stubbing it here would register a `<ComingSoon>` key this slice never asked for.
- **The per-window availability breakdown reuses `describeWindow`** (built at Slice 9 for Slice 14's seller-facing builder, per that module's own comment) rather than showing only the card's single summarized stamp — a listing with both a RECURRING_WEEKLY and a PREORDER window shows two stamps, matching the `food (7)` mockup, and needed no new logic, only a tone map (`RECURRING_WEEKLY→recurring, PREORDER→preorder, DATE_RANGE→seasonal`) and a handful of label strings.
- **`lib/occasion-tags.ts`** — `occasionTag` is a free-text `String?` column, not an enum (only the demo seed's three values — christmas/birthday/divali — have translations). An unknown tag falls back to rendering itself rather than a broken `occasionTags.foo` key path, the same "unknown resolves gracefully" instinct `lib/category-accent.ts` already applies to an unrecognised category slug.
- **`/saved`** — signed-out state is the same inline hint pattern, no redirect; signed-in reads `FoodSave` joined through `DISCOVERABLE` (a save whose listing has since gone non-discoverable — seller suspended, listing deactivated — is filtered out rather than rendered as a dead link) and reuses `<ListingGrid>`, so a saved card looks and behaves identically to every other card on the site.
- **The sticky CTA** is `<ComingSoon feature="requestOrder" variant="primary">` inside a `fixed` bar, positioned above the mobile bottom tab bar (`bottom: calc(56px + safe-area-inset-bottom)`) and as a floating corner button on desktop (`md:bottom-6 md:right-6`, no tab bar there to clear).

**All three done-when clauses verified for real, several ways over:**
- **`npm run verify:saves` — 22/22** (new script): the `FoodSave` model directly — the `(userId, listingId)` unique constraint rejects a duplicate (P2002), un-save removes exactly one row, saving again after un-saving succeeds, deleting a listing cascades its saves (on a throwaway row, never a real seeded one); `lib/saves.ts`'s batch and single reads; `moreFromSeller` and `similarInCategory` against the real seed, including the SUSPENDED-seller trap for the category rail; the SAVE demand event carrying a hashed identity and the seller id. `toggleSaveListing` itself isn't exercised here — it calls `next/headers`' `headers()` via `getFoodSession()`, which throws outside a real request scope, so a plain script can't call it directly; that path is proven live instead (below).
- **`npm run verify:a11y` grew to 378/0** (from Slice 9's 298): `/meals/pastelon-de-platano` and `/saved` added to the standard per-locale/width contrast/tap-target sweep, plus a dedicated block on the meal page — no `€`, price in TTD, 2+ real gallery photos served through `/api/media/`, the seller row links to `/sellers/[slug]`, and the sticky CTA's `[data-coming-soon="requestOrder"]` trigger opens a real localized sheet (not just the style guide's demo of the same registry key) and closes on Escape.
- **A live interactive pass with a real minted session (15/15, ad-hoc — not committed as a script, the same way Apparel's own equivalent passes weren't)**: anonymous click shows the sign-in hint and writes nothing; authenticated click flips the heart, writes exactly one `FoodSave` row, survives a full page reload (the done-when's own "round-trips" clause, proven by re-fetching from the database on a fresh render, not by trusting client state), logs exactly one SAVE demand event; un-saving flips it back, removes the row, and logs **no** second event; and — confirming the shared `<MealCard>` wiring, not just the detail page's own heart — clicking a card's heart on `/browse` saves it without also following the card's link.
- **A second interactive pass on the gallery (8/8)**: thumbnail clicks select the right slide and deselect the others; scrolling the native snap track back to slide 0 re-selects thumbnail 0 (the swipe mechanism genuinely drives the thumbnail state, not just the reverse); zero console errors.
- **`tsc --noEmit`, `next lint`, `next build` all clean.** Regression suites unchanged and still clean: 58 media + 48 seed + 28 translation + 49 schema.

**Two findings from the verification itself, both benign but worth recording:**
1. **My own first save-flow check was a timing race, not a product bug.** `<SaveButton>` flips its `aria-pressed` OPTIMISTICALLY (before the Server Action resolves), so a fixed-delay read of the database right after a click can run before the write actually commits — the check failed once (0 rows) while the very next assertion, a page reload a few lines later, correctly found the row. Fixed by polling instead of a single timed read. The theme carries forward from every prior slice's own "a check that passes for the wrong reason" findings, just this time in a script that failed for the wrong reason instead.
2. **⚠ Reproduced, not rediscovered: `position: fixed` elements duplicate mid-page in Chromium's full-page screenshot stitching** (Apparel's own Slice 10 finding). A `fullPage: true` screenshot of the desktop layout showed "Request order" floating over the middle of the page instead of pinned to the bottom-right corner; a normal (non-full-page) screenshot after scrolling confirms it is correctly `fixed` at the viewport corner throughout. A screenshot artifact, not a rendering bug — worth knowing before treating a full-page capture of any `fixed` element as ground truth.

Files created: `lib/saves.ts`, `lib/actions/save-listing.ts`, `lib/occasion-tags.ts`, `components/ui/save-button.tsx`, `components/listing-gallery.tsx`, `components/listing-seller-row.tsx`, `scripts/verify-saves.ts`.
Modified: `components/meal-card.tsx` (restructured for the save heart), `components/listing-grid.tsx` (`session`/`savedIds` threading), `lib/discovery.ts` (`moreFromSeller`, `similarInCategory`), `app/(client)/meals/[slug]/page.tsx` (placeholder → the real page), `app/(client)/saved/page.tsx` (placeholder → the real page), `app/(client)/{page,browse/page,categories/[slug]/page,search/page}.tsx` (pass `session` through to `<ListingGrid>`/`<ListingRail>`), `scripts/verify-a11y.mjs` (new routes + the meal-page CTA/content block), `messages/{en,es}.json` (`save`, `occasionTags`, `client.meal`, `client.saved`, `client.sections` additions and `availability`'s per-window label keys — parity verified: 242/242), `package.json` (`verify:saves`).

### Slice 11 — Seller profile, follows, Fresh Today viewer

Read: arch doc F1 (seller profile), E2 in full (Fresh Today viewer + Menu shelf), Part D (`FoodFollow`, `FoodStoryView`).

- `/sellers/[slug]`: cover/profile imagery, bio, areas (mini-map), languages, specialties, **Menu shelf** (labeled highlight cards from seed data), active listings grid, gallery, follower count, Follow button (real — a buyer action against seeded sellers, not stubbed).
- Client viewer at `/stories/[sellerSlug]` (route name can stay generic; the UI is the Fresh Today viewer): full-screen, progress bars, tap/swipe advance, seller→seller continuation, linked-listing CTA, view tracking (`FoodStoryView`), seen/unseen shown as a card border, not a ring.
- Follow/unfollow wiring, follower counter maintenance, FOLLOW demand events. "From sellers you follow" home section goes live (Slice 9's home gets this section wired for real).

**Done when:** two local users — one follows a seeded seller, the seller's Fresh Today posts show correctly in the follower's rail/section; the viewer works with gestures on mobile; Menu shelf renders seed highlights.

**Implementation notes (done 2026-07-31):**

`/sellers/[slug]` replaces Slice 9's placeholder wholesale (cover, avatar with the freshness dot, bio, specialty/language chips, fulfillment-mode icons, an areas mini-map, Menu shelf, active listings, gallery, real Follow). `/stories/[sellerSlug]` is an entirely new route — Slice 1 never stubbed it, so this slice built the whole tree from nothing. Follow mirrors Slice 10's Save shape exactly, including the anonymous-buyer resolution already settled there (inline sign-in hint, no redirect — not re-litigated). Home's section 7 ("from sellers you follow") is live, and the Fresh Today rail is genuinely followed-first/unseen-first now.

**Scoping calls made before writing any code, recorded rather than silently decided:**
- **Follow lives on the seller profile only, not threaded onto every `<SellerCard>`** the way Save was threaded onto every `<MealCard>` in Slice 10. The brief's own wording ties Follow to `/sellers/[slug]` specifically; extending it to the directory/home/search seller cards would repeat Slice 10's nested-interactive-element rework a second time for a feature not asked for there. A real, scoped follow-up if a later slice wants it — not started here.
- **`<MenuShelf>` cards link to the seller's own Fresh Today viewer**, not a highlight-scoped mini-viewer. A genuinely separate "play just this shelf" mode is real future work; with the seed mostly carrying one story per highlight, the full viewer already shows the right content.
- **Backward seller→seller navigation in the viewer opens the previous seller's FIRST slide, not their last.** True "resume where you left off" would need the target route to know which end to start from (a query param). Forward continuation (the common path — auto-advance and tap-right) is the real thing; this one direction is a documented, defensible simplification.

**⚠ A real bug caught before it shipped, not after — worth its own entry.** `globals.css` forces every `animation-duration` to `0.01ms` under `prefers-reduced-motion: reduce` (Slice 7). The obvious implementation — drive the slide-advance off the progress bar's CSS animation via `onAnimationEnd` — would have rapid-fired through an entire Fresh Today story in milliseconds for exactly the users that setting exists to protect. Fixed at the design stage: the advance timer is a plain `setTimeout(SLIDE_DURATION_MS)` in JS, completely decoupled from the progress bar's animation (which stays purely cosmetic); under reduced motion the timer is skipped entirely rather than sped up, since WCAG 2.2.2 requires auto-advancing content lasting over 5s to be pausable and this slice has no pause control — "never starts" is the simplest correct reading of that. Manual tap/swipe/keyboard navigation is unaffected either way.

**Architecture:**
- **`lib/follows.ts`** (read) / **`lib/actions/follow-seller.ts`** (`toggleFollowSeller`, the mutation) — the same split as Slice 10's saves. The one real difference from Save: `followerCount` is a DENORMALIZED counter that is actually DISPLAYED (the profile header), so every toggle **recounts the real `FoodFollow` table and writes the result inside one `$transaction`** with the row's own create/delete — never a blind increment/decrement, which would drift under a double-click or a retried request. Verified live with real churn (follow → unfollow → follow again), not just reasoned about: the count landed back on its exact original seeded value, not original±1 from an increment bug that happened to cancel out.
- **`components/ui/follow-button.tsx`** — a labelled pill (`food (9)`'s own mockup: "Seguir" beside the name, not a full-width bar), same optimistic-then-confirm shape as `<SaveButton>`. **`components/seller-follow-header.tsx`** is the small Client Component wrapper that keeps the profile's own "N followers" text in sync with the button's optimistic toggle via a callback, so the rest of `/sellers/[slug]` can stay a Server Component.
- **`lib/stories.ts`** — the viewer's own queries, deliberately separate from `lib/discovery.ts`'s per-STORY `freshTodayEntries`: `sellerStoryQueue` (ordered, followed-first/unseen-first, PER SELLER — what "seller → seller continuation" walks), `sellerActiveStories` (one seller's active stories, chronological, what the viewer renders), `seenStoryIds` (batch `FoodStoryView` lookup, mirroring `lib/saves.ts`'s `savedListingIds`).
- **`lib/actions/mark-story-viewed.ts`** (`recordStoryView`) — two different things happen per slide, and only one needs a session: `FoodStoryView` is opaque per-user standing and is written only for an authenticated viewer (the model's own schema comment: "an anonymous viewer records nothing"); the `STORY_VIEW` demand event fires for EVERY viewer, matching the asymmetry Slice 9 already established for `LISTING_VIEW`.
- **`freshTodayEntries` (Slice 9) now takes an optional `userId`** and re-sorts in Node — followed sellers first, unseen first within that group, then everyone else by recency (Part E1's own wording, applied literally). Over-fetches to `limit * 3` before re-sorting so a followed seller's older post isn't cut off by the initial recency window; with only 13 active stories in the whole seed this never actually trims anything today, but it is the correct shape for when it does.
- **`followedSellersListings` (new, `lib/discovery.ts`)** — section 7's query, `DISCOVERABLE` listings from followed sellers. Uses a fully-authored `seller: { status: "ACTIVE", followers: { some: { userId } } }` clause rather than spreading `...DISCOVERABLE` and adding a second `seller` key — the Slice 9 finding about two `seller` keys silently overwriting each other, applied on the write side this time rather than rediscovered.
- **`components/menu-shelf.tsx`** — labelled RECTANGULAR cards, never IG-style circles. Worth flagging explicitly: the mockup set itself has BOTH versions (`food (8)`'s circles are an earlier, superseded draft; `food (9)`'s "MENU SHELF" rectangles are the corrected one, matching the schema's own comment on `FoodStoryHighlight`) — one screenshot away from copying the wrong one. A highlight with zero linked stories (12 of the seed's 21 groups) is filtered out by the profile page before this component ever sees it, rather than asked to render an empty rectangle.
- **`components/region-map.tsx` gained a `readOnly` mode** for the profile's "areas (mini-map)" — reusing the SAME illustrated-Trinidad component as the browse-directory picker rather than inventing a third area-visualisation idiom, restyled to a non-interactive display: the sub-list shows only the seller's own 1–3 areas as plain labels, not all eight regions as dead buttons. Backward-compatible (`onToggle` is now optional; every existing caller is unaffected).
- **`components/fresh-today-viewer.tsx`** — full-screen (`fixed inset-0 z-50`, no separate route-group layout needed), progress bars, tap-zoned advance (left half back, right half forward), pointer-event-based swipe (works for both a real touchscreen and Playwright's mouse-drag simulation without needing `hasTouch`), Escape/Arrow keys, a linked-listing CTA. Uses `next/image` directly with `object-contain` rather than `<FoodImage>` — Slice 4's own note is explicit that stories are stored 4:5 specifically so the *full-screen viewer* gets real, uncropped pixels, and `<FoodImage>`'s aspect lock always crops (`object-cover`), which is right for a card and wrong here.

**All four done-when clauses verified for real, several ways over:**
- **`npm run verify:follows` — 34/34** (new script): the `FoodFollow` model directly (constraint, the transactional recount proven with real churn, cascade on a throwaway seller); `lib/follows.ts`'s reads; `followedSellersListings` including a "following nobody" empty case; `freshTodayEntries`'s followed-first re-sort; `lib/stories.ts`'s queue ordering, chronological per-seller reads, and — the visibility rule, re-proven in a THIRD module now — `sellerActiveStories` refuses the SUSPENDED seller's slug outright; `seenStoryIds` and a real `FoodStoryView` upsert; FOLLOW and STORY_VIEW demand events, including STORY_VIEW firing for a null (anonymous) userId. `toggleFollowSeller` and `recordStoryView` themselves aren't exercised here for the same reason `toggleSaveListing` wasn't in Slice 10 — both call `next/headers` via `getFoodSession()`, which throws outside a real request scope; both are proven live instead.
- **`npm run verify:a11y` grew to 462/0** (from Slice 10's 378): `/sellers/cocina-de-abuela` and `/stories/cocina-de-abuela` added to the standard sweep, plus dedicated blocks — the profile's Follow button and Menu-shelf-card-links-to-viewer are real and visible; ≥4 real photos (cover/avatar/shelf/listings) all served through `/api/media/`; no `€`; the viewer's progress-bar segment count and story photo are real and served through the same route.
- **A live interactive pass with a real minted session (23/23, ad-hoc, not committed as a script — the same posture Slice 10 took for its own save-flow pass)**: anonymous Follow click shows the hint and writes nothing; authenticated toggle flips the button, the displayed follower count, and the database in agreement; survives a full page reload; logs exactly one FOLLOW event; un-following returns `followerCount` to its EXACT original seeded value (128, not 127 or 129 from a drift bug that happened to look right); home's "from sellers you follow" section appears with the followed seller's listing once followed. The viewer: progress-bar segment count matches the seller's real active-story count; tap-right advances; a pointer-drag swipe completes without error; the close button and Escape both navigate away; zero console errors through the whole gesture sequence.
- Regression suites unchanged and still clean: `tsc --noEmit`, `next lint`, `next build` all clean; `verify:discovery` 80/80 (Fresh Today's re-sort didn't break its own non-empty/visibility checks); `verify:saves` 22/22.

Files created: `lib/follows.ts`, `lib/actions/follow-seller.ts`, `lib/actions/mark-story-viewed.ts`, `lib/stories.ts`, `components/ui/follow-button.tsx`, `components/seller-follow-header.tsx`, `components/menu-shelf.tsx`, `components/fresh-today-viewer.tsx`, `app/(client)/stories/[sellerSlug]/page.tsx`, `scripts/verify-follows.ts`.
Modified: `app/(client)/sellers/[slug]/page.tsx` (placeholder → the real page), `app/(client)/page.tsx` (section 7, real `seenIds`, `freshTodayEntries` userId), `components/fresh-today-rail.tsx` (href → `/stories/[slug]`), `components/region-map.tsx` (`readOnly` mode), `lib/discovery.ts` (`freshTodayEntries` re-sort, `followedSellersListings`), `tailwind.config.ts` (`story-progress` keyframe/animation), `scripts/verify-a11y.mjs` (new routes + profile/viewer content blocks), `messages/{en,es}.json` (`client.sellerProfile` replaced, `client.sections.following`, `fulfillmentModes`, `stories` — parity verified: 254/254), `package.json` (`verify:follows`).

### Slice 12 — Buyer polish & PWA — VPS deploy #2 (buyer demo live)

Read: arch doc F3 (accessibility + PWA), Part I (Phase 1 exit bar).

- Full bilingual pass across every Phase-1 surface (no retrofit debt); accessibility check against the corrected token contrast ratios in real components, not just the token table; motion/perf pass (skeleton + blur-up everywhere, no spinners).
- PWA: manifest finalized, installability verified, offline cached shell + last-viewed browse data.
- **Deploy pass:** slices 7–11 to prod (`deploy.sh`); seed run in prod (flagged, removable); smoke test with the shared browser-testing tool across the full buyer loop (home → browse → search → listing → seller profile → follow → Fresh Today viewer → save).

**Done when:** `https://food.apoyolime.com` is a publicly demoable, aesthetically complete discovery experience — browse, search, listing, profile, follow, Fresh Today — on a phone, seed-populated, live.

**Implementation notes (done 2026-07-31):** ✅ **Phase 1 exit — the buyer demo is live.**

All code-side work was built and verified locally, then deployed for real — user-driven, one command-batch at a time, no SSH from the session (`DEPLOYMENT.md` §8 has the full sequence and the live transcript). `deploy.sh` ran clean (93 files, no schema change, 27 routes built); the full demo seed ran in prod for the first time (13 sellers, 50 listings, matching local counts exactly, `verify:seed` 48/48 against the real prod data); `food-web` stayed healthy across three separate `user-pm2 list` checks.

**⚠ One real prereq this slice's own restatement had missed, caught from the deploy's own output, not pre-empted.** `DEMAND_HASH_SALT` — flagged as prod-required back at Slice 9 — was still unset; the build log's own warning caught it live. Fixed on the spot (`openssl rand -hex 32` appended to `.env`, `food-web` restarted) rather than left for a future session to rediscover. Recorded in `DEPLOYMENT.md` §8 and the `food_deploy_prereqs` memory so the pattern (a var flagged slices before it's needed gets buried in old notes by deploy time) doesn't repeat for Slice 13's own token.

**Live smoke test, run directly against `https://food.apoyolime.com` (real HTTPS traffic, not a VPS command) — 20/20:** the full Part I loop — home → browse (47 real cards) → search (finds "pastelón") → listing detail (`$120 TTD`, no `€`, Save shows the anonymous sign-in hint correctly, Request order CTA present) → seller profile (Follow present, its own sign-in hint, Menu shelf links to the viewer) → Fresh Today viewer (real photo, close button) → the ES/EN toggle flipping `<html lang>` live — all pass, zero console errors, screenshots confirm the design renders correctly at production scale. Scope stated plainly: no production login credentials exist in this session, so Save/Follow were verified in their anonymous form live (the correct designed behavior) — the authenticated round-trip was already proven with a minted session locally in Slices 10/11, running the same code now live here, not re-proven against prod specifically.

**Bilingual pass:** parity re-confirmed at 256/256 (up from Slice 11's 254 — two new keys for `/offline`). A dedicated sweep (not just parity) found the one real gap: **six route `<title>` metadata exports were hardcoded English literals** (`"Browse"`, `"Sellers"`, `"Saved"`, `"Search"`, the `/categories/[slug]` not-found fallback), never touched by next-intl at all — a Spanish-locale visitor's browser tab still said "Browse". Fixed by converting each to `generateMetadata()` reading the already-correct translation key; `/meals/[slug]` and `/sellers/[slug]` also gained real per-page titles (the dish/seller's own name) where they'd had none. Everything else — every JSX text node, `aria-label`, `alt`, `placeholder` — was already clean, confirmed by a dedicated grep sweep across every Phase-1 surface.

**Motion/perf:** "skeleton + blur-up everywhere" turned out to be a two-part claim with two different answers. Blur-up: universal, already true (no raw `<img>` anywhere in the app, confirmed by grep — everything goes through `<FoodImage>` or, for the Fresh Today viewer, a direct `next/image` with its own blur placeholder). Skeletons: `components/ui/skeleton.tsx` exists and is demonstrated on `/style-guide`, but has **zero real call sites** — every page in this app is server-rendered with fully-resolved data before the HTML ships, so there is no client-side pending state a skeleton would ever cover. Recorded as a considered, structurally-correct outcome, not a gap: the primitive is there if a future client-fetched surface ever needs it. No spinners anywhere (`animate-spin`/`Spinner`/`Loader2` all grep to zero).

**⚠ Two real, measured Lighthouse findings, both fixed — not guessed at, the same discipline Apparel's own Slice 12 applied.** First pass on `/`, `/browse`, `/meals/[slug]` (mobile, `--throttling-method=devtools`, matching Apparel's own corrected methodology rather than `simulate` mode, which that slice found unreliable on a machine running other work) scored accessibility 95/93/95:
1. **`maximumScale: 1` in `app/layout.tsx`'s `viewport` export blocked pinch-zoom entirely** — a real WCAG 1.4.4 (Resize Text) violation, not a stylistic call, caught by Lighthouse's `meta-viewport` audit on every page. Removed outright (not raised to a higher cap — any `maximumScale` still overrides the user's own zoom setting).
2. **`heading-order`: `/browse` skipped a level, `<h1>` straight to `<h3>`.** `<MealCard>`, `<SellerCard>` and `<CategoryCard>` all hardcode their title as `<h3>`, correct under the pages that wrap them in an `<h2>` `<SectionHeader>` rail (home, search, meal-detail's rec rails) but wrong on the three pages that put a card grid directly under a page `<h1>` (`/browse`, `/saved`, `/browse/sellers`, `/categories/[slug]`). Fixed by changing all three cards' title element to `<h2>` — valid everywhere, since a repeated `<h2>` sibling under an existing `<h2>` section header is not a skip, only *descending* past a level is. ⚠ `text-h2` in each card's className is the unrelated type-scale token (font-size), not the semantic level — the two share a name coincidentally, flagged in the code comments so a future reader isn't confused by it.
- Re-measured after both fixes: **accessibility 100/100/100** on all three pages, best-practices and SEO 100 throughout. Performance 87–93, LCP 2.2–2.6s, CLS 0, TBT 200–380ms — the "credible on a throttled connection" bar Apparel's own done-when named, applied here too even though Food's own brief doesn't repeat the words. `bf-cache` was also flagged (`cache-control: no-store` on every dynamic page) but Lighthouse's own audit labels both reasons "Not actionable" — correct and left alone: this is a session-aware app, and a bfcache restore of a stale save/follow state would be a real bug, not a missed optimisation.

**PWA — the actual new subsystem this slice adds.** No ecosystem precedent exists to port: Salon is explicitly "PWA-none" and no sibling vertical has shipped a service worker. Built from first principles, hand-written (no `next-pwa`/workbox dependency) — the same instinct as Slice 1's dependency-free icon encoder, for a scope this small.
- **`public/sw.js`** — network-first for navigations (caches each successful render keyed by URL, falls back to the cache and then to a precached `/offline` shell on failure), cache-first for `/_next/static/*` and `/icons/*` (content-hashed, never stale by construction), stale-while-revalidate for `/api/media/*` (so a previously-seen dish photo still renders offline), pass-through (never cached) for everything else — explicitly including all of `/food/*` and every non-media `/api/*` route, a second layer of safety beyond the production host split so session-dependent seller content can never be served from a shared cache.
- **`app/(client)/offline/page.tsx`** — the navigation fallback. Deliberately reads no session or database state: `sw.js` precaches whatever HTML this route returns at SW-install time and replays that ONE snapshot to every offline visitor afterward, so it has to render identically regardless of who's looking.
- **`components/service-worker-register.tsx`**, mounted only in the `(client)` layout — the seller dashboard was never the installed app's `start_url` and must never be. No custom "Install" button; "installability verified" is about the manifest+SW+HTTPS criteria genuinely being met, not a bespoke prompt UI.
- **`npm run verify:pwa` — 19/19, new script**: manifest fields + real icon files; the SW reaches `active` state; a previously-visited page (`/browse`) still renders real content (>100 chars, not an empty shell) after `context.setOffline(true)`; a route never visited that session falls back to the precached `/offline` page; `/food` navigability unaffected.

**⚠ A real regression caught by the full suite re-run, in a script's OWN cleanup, not in product code.** `verify:seed` failed on a re-run: `sweet-hands-bakery`'s `followerCount` was **343 on disk vs 342 real rows** — a drift `verify-seed.ts` exists specifically to catch (Slice 8: "recounted from the table, not trusted from the catalogue"). Traced to `scripts/verify-follows.ts`'s own final cleanup line, `prisma.foodFollow.deleteMany(...)`, which removes the synthetic test follow but — unlike `toggleFollowSeller` itself, and unlike every OTHER write in that same script — never recounts `FoodSeller.followerCount` afterward. Every prior run of `verify:follows` (Slice 11's own development included) has been leaving whichever seller `findFirst({status:'ACTIVE'})` happened to resolve to one follower over-counted, permanently, until the next unrelated fix happened to correct it. Fixed at the root (the cleanup now recounts, matching the transaction it's undoing) and reproduced clean: ran `verify:follows` again immediately after the fix, then `verify:seed` again — 48/48, no drift. The one already-stray row (`sweet-hands-bakery`) was corrected directly (recounted from the real `FoodFollow` table, not deleted or guessed).

**Deliberately NOT done this slice, and why:**
- **No new seller/brand photography was sourced for the PWA icons.** They remain Slice 1's dependency-free generated placeholder art. Nothing in this slice's brief asked for real artwork, and Slice 1 already named this as the natural point to swap it in *if* real art exists — it doesn't yet.
- **No custom "Add to Home Screen" prompt UI.** Deferred as real, separable future work (see `service-worker-register.tsx`'s own comment) — "installability verified" is satisfied by the underlying criteria being met, checked directly, not by a bespoke affordance.

**Verification summary, this slice:** `tsc --noEmit`, `next lint`, `next build` all clean. `verify:pwa` 19/19 (new). `verify:a11y` 490/0 (up from Slice 11's 462 — the new `/offline` route, both heading/viewport fixes re-verified clean across every existing route too). Lighthouse (mobile, devtools-throttled) on `/`, `/browse`, `/meals/[slug]`: accessibility/best-practices/SEO 100/100/100, performance 87–93. Full regression: `verify:saves` 22/22, `verify:follows` 34/34 (post-fix), `verify:discovery` 80/80, `verify:seed` 48/48 (post-fix), `verify:media` 58/58, `verify:translation` 28/28, `db:verify` 49/49.

Files created: `public/sw.js`, `app/(client)/offline/page.tsx`, `components/service-worker-register.tsx`, `scripts/verify-pwa.mjs`.
Modified: `app/layout.tsx` (removed `maximumScale`), `app/manifest.ts` (comment only — reflects Slice 12 landing), `app/(client)/layout.tsx` (mounts `<ServiceWorkerRegister>`), `app/(client)/{browse/page,browse/sellers/page,saved/page,search/page,categories/[slug]/page,meals/[slug]/page,sellers/[slug]/page}.tsx` (localized/real `generateMetadata`), `components/{meal-card,seller-card,category-card}.tsx` (`<h3>`→`<h2>` heading-order fix), `scripts/verify-a11y.mjs` (`/offline` route), `scripts/verify-follows.ts` (cleanup recount fix), `messages/{en,es}.json` (`client.offline` — parity verified: 256/256), `package.json` (`verify:pwa`), `DEPLOYMENT.md` (gitignored — §8, the deploy #2 command sequence), `BUILD_SLICES.md`.

---

## Phase 2 — The seller story (functionality-first, not polish-first)

### Slice 13 — Seller onboarding & profile editor

Read: arch doc F2 (onboarding flow), B2 (region map port, status pattern), Part G (address privacy), B1 (decision-14/15 — the registration toggle only gates CTA visibility now; Food's own onboarding-submit is the real authorization point).

- Port `region-map.tsx` + `tt-region-paths.ts` from the Apoyo-Demia app or Salon as the area picker (1–3 areas) — same `RegionKey` values Apparel also reuses.
- Seller registration entry creates `FoodSeller` (PENDING) + `(FOOD, PROVIDER)` membership (needs Slice 3's `food-app` scope + token already in place).
- Guided profile setup (skippable-resumable): profile photo → cover → bio → areas → languages → specialties → fulfillment modes. Media through Slice 4's pipeline. Gallery manager (`FoodSellerPhoto`).
- Dashboard shell at `/food` (nav, empty states pointing at next actions). **No admin approval queue yet** — that's Slice 16, mirroring Apparel's own sequencing; a session can flip a test seller's status directly for local testing in the meantime.

**Done when:** a fresh user completes onboarding locally end to end and lands on the dashboard as PENDING; the dashboard shell correctly renders the PENDING state (not an unauthorized error).

**Implementation notes (done 2026-08-02):** ✅ **Phase 2 opens — Food has a supply side.**

Registration (`/food/onboarding`), the guided setup wizard (`/food/profile/setup`), the always-available editor (`/food/profile`) and the dashboard shell (`/food`) are all real, against a real ecosystem API. **`npm run verify:onboarding` — 66/66**, driving the whole flow in a browser against a **production build** with a real minted session and a **local portal-web on a throwaway identity DB**; **`npm run verify:seller` — 43/43** on the domain layer. tsc/lint/build clean (30 routes).

**⚠ Both cross-repo prerequisites this slice has carried since Slice 3 are now handled, and one of them is a finding.**
1. **`Apoyo-Demia/prisma/migrations/20260802220000_enable_food_registration_config/`** — the FOOD `vertical_registration_config` flip to `true`, authorized in-session and mirroring Apparel's `20260731090000` file-for-file (an `UPDATE`, never an upsert; the seeding migration guarantees the row). **This is the ONLY file written outside the Apoyo-Food repo.** Both sibling repos were pulled first (both already current); the `"food-app": ["FOOD"]` scope grants were confirmed still present and untouched in *both* `lib/ecosystem-auth.ts` copies. Applied and verified: Demia's **full 61-migration history replayed onto a throwaway identity DB**, ending `SOCIAL=t, SALON=t, APPAREL=t, FOOD=t` with `updated_by='migration:food-slice-13'`, and `migrate diff` reporting **no difference**.
2. **⚠ THE `food-app` TOKEN IS THE SECRET ONLY, NOT `food-app:<secret>` — and nothing said so before this slice.** Read off portal-web's own `authenticateEcosystemCaller`: it splits each `ECOSYSTEM_SERVICE_TOKENS` entry on the first `:` and timing-safe-compares the presented Bearer against **the part after it**. So the identity apps' `.env` holds `food-app:<secret>` while Food's holds `<secret>` alone. Sending the full pair is a flat `401 UNAUTHORIZED` with nothing indicating which half is wrong — which is exactly what the first live call here returned. Now stated in `.env.example` in the loudest terms available. ⚠ **The live VPS `.env` files still have no `food-app` entry at all** — that is a deploy prerequisite, not a code change, and it is listed with the others below.

**⚠ TWO REAL DEFECTS, both found by the verification rather than by reading, and both fixed.**

1. **Completing a step swapped the page out from under the seller.** `/food/profile/setup` with no `?step` derived the current step from the data on *every* render — so the moment a photo upload called `router.refresh()`, the page moved to the next step while the seller was still looking at the one they had just finished. It presented as "Continue never appears after an upload", which reads like a broken button. **Fixed by resolving the resume target and REDIRECTING to the pinned `?step=` URL** rather than rendering it in place. The pinned URL is also shareable, bookmarkable and stable across a reload — which is most of what "resumable" means in practice. Both halves are asserted now: a bare URL lands on the resume step *and* pins itself there.
2. **⚠ The primary button's HOVER state fails WCAG AA, and has since Slice 7 — on the most-used control in the app.** `hover:bg-green/90` looked like "slightly darker green"; on this palette alpha composites the accent with the **cream page beneath it**, so 90% green is really green *mixed with cream*, which LIGHTENS the fill. Measured: **4.39:1** for the cream label, against a 4.5 bar. **Fixed with two new tokens that darken instead** — `--green-deep` (#475D3C, 6.83:1) and `--error-deep` (#8C3F31, 6.90:1) — so a hover moves contrast in the direction a hover should. The two surviving alpha hovers were measured and left alone because they go the safe way (`green-soft/80` under ink is 12.60, `error/10` under error text is 4.75). ⚠ **Never restore an alpha hover on a filled button on this palette.** ⚠ Salon and Apparel almost certainly carry the same shape.
   - Worth knowing how it stayed hidden through Slice 12's 490/0 run: an audit only measures a hovered element if the mouse happens to be resting on it, and this slice's registry change shifted the style-guide layout enough to move the pointer onto that button. **A green contrast run is evidence about the states that were sampled, not about every state.**

**Architecture decisions worth not re-litigating:**

- **Registration is ONE field, and the rest is the wizard.** Architecture F2's rule for this flow is "every step skippable-and-resumable — never force completeness before value", and a long registration form is the exact opposite: it demands completeness *before* anything of value exists. The kitchen name is required only because `slug` derives from it and a kitchen with no name has no URL to send a buyer to.
- **Skippable-and-resumable is STRUCTURAL, not wizard state.** There is no draft anywhere. Every step writes its own field group immediately, and where the flow resumes is *derived by reading the row back* (`lib/seller-profile.ts`'s `nextIncompleteStep`). Closing the tab loses nothing submitted; "Skip" is a plain `<a>`, not a submit, so declining a step cannot persist a half-typed value; and every step stays directly reachable from the progress list, because a flow that can only be walked forwards is not resumable in any useful sense. ⚠ This is a deliberate divergence from Apparel's equivalent slice, which holds all state client-side and calls its action once — correct for Apparel's brief ("an abandoned flow leaves neither"), wrong for Food's, which asks for resumability outright. Food's answer to "abandoned leaves neither" is different and just as structural: an abandoned flow leaves a `PENDING` seller who is invisible to every buyer surface.
- **Write order: seller row FIRST, membership SECOND** — the ghost-provider lesson, inherited from Apparel with its reasoning re-derived rather than copied. Minting standing first and then failing the row write leaves `(FOOD, PROVIDER)` with no seller record, invisible to every surface that reads the local table. This way round a failure leaves a `PENDING` row with no standing, which grants access to nothing — and **the dashboard re-asserts the membership on every render**, so the repair happens the next time the seller opens their workspace, without anyone knowing it was needed. ⚠ **Requirement inherited by Slice 16:** approval must confirm the membership exists before flipping a seller to `ACTIVE`. An `ACTIVE` row whose mint never landed is the one combination that locks a seller out of their own dashboard, because `requireFoodSeller` demands both.
- **The §6b toggle is read for CTA VISIBILITY and never for authorization** (decision 15). `onboardSeller` deliberately does not consult it: doing so would quietly promote a visibility switch back into a security control. Stated plainly so a later slice does not assume more, the real gate is that registration produces a `PENDING` seller — filtered out by `DISCOVERABLE` everywhere, and 404 on `/sellers/[slug]` — until Slice 16's queue approves them. Both consumers (the buyer footer, the workspace CTA) fail **closed**, so Food degrades to a closed door rather than a broken one.
- **One implementation, two presentations.** The editor at `/food/profile` renders the *same* field components as the wizard with `nextHref` omitted, which turns "Continue and advance" into "Save and stay". There is exactly one validator per field, so "the setup flow validated it differently" cannot become true.
- **⚠ Ownership comes from the SESSION, never from the form.** No action or route in this slice takes a seller id. `requireOwnSeller()` resolves the row by `userId` from the decoded JWT, and the photo mutations scope by the compound `{ id, sellerId }` rather than by photo id alone — a photo id is a cuid an attacker can read off a public page. "Edit someone else's kitchen" is not a request shape that exists, rather than a check that could be forgotten. This is the per-resource authorization Slice 4 explicitly deferred until the resources existed.
- **`/api/seller/media` is a NEW route, not a reuse of `/api/media/upload`.** The Slice 4 route returns storage keys to the browser and leaves persistence to the caller; a seller form built on it would POST those keys back to be written onto a row, and a client that can name the key it wants stored can name a key it does not own. Harmless for public dish photography, but it is a trust-the-client's-pointer shape, and this is the slice where seller-owned resources first exist. Doing ingest *and* persistence in one ownership-checked request means the only key ever written to a `FoodSeller` row is one that request just produced. `/api/media/upload` is untouched for Slices 14/15.
- **Replacing an avatar or cover deletes the previous variants** (row updated first, files second — an orphaned file is disk waste, a row pointing at deleted files is a broken public profile). Without it, a seller trying five photos in their first ten minutes leaves twelve orphaned files that nothing ever collects.
- **Gallery reordering RE-INDEXES 0..n-1 rather than swapping two `sortOrder` values.** `sort_order` carries no unique index and the Slice 8 seed writes rows that share a value; swapping two equal numbers is a no-op that renders as a button which does nothing — the worst kind of bug, because the page looks like it worked. At most 12 rows, so the cost is irrelevant. Asserted directly against three rows all sharing `sortOrder = 0`.
- **`lib/slug.ts` arrives here, not at Slice 14.** Slice 14's brief owns it, but registration cannot create a row without a slug — the same call Slice 9 made pulling `lib/availability.ts` forward. Two rules it locks in: **accents fold via NFD before the character filter** (a naive `[^a-z0-9]` strip turns the *default* case on a Spanish-first surface, "Cocina de Doña Martínez", into `cocina-de-do-a-mart-nez`), and **slugs never rotate** — renaming a kitchen changes `displayName` only, because `/sellers/<slug>` is a URL a cook pastes into WhatsApp. Collision suffixing is check-then-write and the caller retries on `P2002`, which is deliberate: the alternative is a transaction holding a lock across an ecosystem HTTP call.
- **`becomeSeller` was RETIRED from the `<ComingSoon>` registry and four seller-nav keys added.** The one-line contract running in the direction it was designed for: the footer now links to real onboarding (gated on the toggle) instead of opening a modal about it. `sellerListings`/`sellerStories`/`sellerOrders`/`sellerInsights` replace it, because the conventions block is explicit that an unbuilt destination gets a modal rather than a MISSING NAV ITEM — a seller who cannot see where listings will live has no way to know the product has them. `FeaturePhase` gained `6` for `sellerInsights`, registered deliberately even though no slice in this file builds it (Part E7's signature feature, whose `FoodDemandEvent` history has been accumulating since Phase 1). `verify-a11y.mjs` asserts the four new keys render **and** that `becomeSeller` no longer does.
- **`lib/links.ts` + `NEXT_PUBLIC_SELLER_SURFACE_URL` land here**, exactly where Slice 7 said to add them. A relative footer link into `/food/onboarding` resolves against `food.apoyolime.com`, where `middleware.ts` 404s the whole `/food` subtree — so the one link the supply side depends on would dead-end with nothing in any log. Unset in local dev on purpose (both surfaces answer on `localhost:3012`, so relative is the only thing that works without DNS); **⚠ prod must set it.**
- **`app/food/layout.tsx` no longer pads its children**, so the workspace nav can be a full-bleed bar under the header; each route group supplies its own `<main>` (`/food/admin` and `/food/login` gained one). `<SurfaceBanner>` is no longer referenced anywhere — **not deleted**, flagged, same posture Slice 7 took with the other scaffold files.
- **`loadSellerWorkspace` IS wrapped in React `cache()`, and `getMemberships` still must not be.** The difference is stated in the code because it looks like an inconsistency: `cache()` memoizes per request and cannot be invalidated from inside it, which is fatal for a value a Server Action mints mid-request — but `loadSellerWorkspace` reads only the session and the local row, and mutations happen in Server Actions that `revalidatePath` turns into a *new* request. So the memo is plain deduplication between the dashboard layout and the page beneath it, with no correctness edge.
- **`required` in the completion model is ADVISORY.** Slice 16 owns the PENDING→ACTIVE gate. Surfacing the list now is what stops a seller reaching that queue with an empty profile and no idea why they are waiting.
- **No login door, again.** `<SignedOutNotice>` states the situation and stops — no redirect, no link — because Food has none of its own and the ecosystem rule (settled during Apparel's build, applied at Slices 10/11) is that a vertical must never surface another vertical's URL as a redirect target. Asserted live: the anonymous `/food` page contains **zero** links in `<main>`.

**Part G's address rule is enforced structurally, and proven that way:**

- There is **no address field** on any form, and `verify-seller.ts` asserts against `information_schema` that `food_sellers` has **no address-shaped column at all** — so a future migration adding one fails a test rather than a review. `lat`/`lng` exist from Slice 2 for Phase-9 geocoding and are asserted to stay null through the whole flow.
- **EXIF/GPS stripping is proven end to end through the real UI**, not inherited from Slice 4's own suite: the browser pass uploads a **genuine GPS-tagged JPEG** (Port of Spain, built with `piexifjs`), confirms the tag is present in the fixture **before** upload, then reads all three stored variants back off disk and scans the **raw bytes** for the JPEG APP1 marker and the WEBP `EXIF` FourCC. It also walks the entire uploads tree byte-for-byte to confirm the original was never written anywhere. A home cook photographs food in their kitchen; on a product whose fulfilment model is "come to my house", a geotagged profile photo is doxxing them with their own camera.
- The registration page **says this out loud** before anyone agrees to it, rather than only in a code comment.

**Verification, and its own limits, stated plainly:**

- **`verify:onboarding` (66/66, new)** — anonymous surface (signed-out notice, no links, 401 on the media route); registration creating a PENDING row with an accent-folded slug **and a real `(FOOD, PROVIDER)` membership minted against the live API**; idempotent re-visit; the EXIF block above; skip → save → resume across every step, with each write re-read from the database; the PENDING dashboard rendering as a workspace and **not** an unauthorized error, with the nav, the checklist and three ComingSoon stubs; `/sellers/<slug>` 404 while PENDING and 200 once flipped ACTIVE, carrying the name, specialties and photo entered during setup; a second signed-in account 401'd on the media route and redirected out of the editor; the footer's real link; and **zero console/page errors across the whole flow**.
- **The session is minted with an EMPTY `memberships` claim on purpose**, reproducing the staleness case: every guard in this flow has to read the ecosystem API, and one trusting the JWT claim would deny a seller the dashboard they just created.
- **⚠ A Chromium cookie finding, needed to run any of this against a production build.** `next start` forces `NODE_ENV=production`, so the cookie is `__Secure-authjs.session-token`. Playwright's `addCookies` **rejects** that cookie given `{ url: "http://localhost:3012", secure: true }` ("Invalid cookie fields") — CDP validates the `__Secure-` prefix against the URL's *scheme*. Given `{ domain, path, secure }` instead it accepts it, and Chromium then **sends** it over `http://localhost`, because localhost *is* a secure context by Chrome's own rules. Two code paths, two different answers about the same cookie.
- **⚠ Known gap, deliberate: `verify-a11y.mjs` cannot reach the seller surface.** It drives every route anonymously and the whole workspace is behind a session, so its 494 contrast/tap-target checks cover the buyer surface only. The two failures that break a phone outright are asserted in `verify-onboarding.mjs` instead — **no horizontal overflow at 390px** (the likely failure on a surface that defaults to Spanish, ~30% longer per Part F3) and **every visible control clearing 44px** — on `/food`, the areas step and the editor. Full contrast auditing of the seller surface needs the a11y script taught to carry a session; real, separable work, and Phase 2's own bar is "working", not "visually finished".
- **⚠ Still no `npm test`.** The Phase-0 review flagged that Slice 14 requires unit tests for `lib/availability.ts` and there is no harness. This slice added two more manual scripts rather than fixing that, deliberately — standing vitest up belongs with the slice whose brief asks for it. The manual suite is now **~440 assertions across ten scripts**, none of them run automatically.
- **Full regression, all green after the button fix:** `verify:a11y` **494/0** (up from 490), `verify:onboarding` 66/66, `verify:seller` 43/43, `verify:ecosystem` 15/15, `verify:pwa` 19/19, `verify:seed` 48/48, `verify:discovery` 80/80, `verify:saves` 22/22, `verify:follows` 34/34, `verify:media` 58/58, `verify:translation` 28/28, `db:verify` 49/49. Bilingual parity **392/392** (up from 256 — this slice adds 136 keys per catalogue).
- **⚠ `verify-ecosystem.ts`'s FOOD assertion was INVERTED, not deleted.** Slice 3 asserted `config.FOOD === false`; this slice's migration makes that false. It now asserts `true`, with a comment saying why — so a database missing the new migration fails loudly instead of the test being quietly dropped.

**⚠ Outstanding VPS prerequisites before Slice 13 can be deployed** (nothing here is a code change; the running site is unaffected until a deploy happens):
1. **`food-app:<secret>` in `ECOSYSTEM_SERVICE_TOKENS` in BOTH the Apoyo-Demia app's and portal-web's live `.env`** — generate ONE new secret (`openssl rand -hex 32`), never reuse salon-app's or apparel-app's, and put the **secret alone** in Food's own `ECOSYSTEM_SERVICE_TOKEN` (see the format finding above). Without it, registration still creates the seller row but the membership mint fails — recoverable, since the dashboard re-asserts it, but every seller stays without ecosystem standing until it lands.
2. **`NEXT_PUBLIC_SELLER_SURFACE_URL=https://portal.apoyolime.com` in Food's prod `.env`** — new, and it is a **build-time** variable, so it must be set *before* `deploy.sh` runs its build, not after.
3. **Apoyo-Demia must deploy** for the registration toggle to flip in production. Until then Food shows "registration opens soon" — a closed door, not a broken one — so the two deploys need no coordination.
4. Re-grep every `process.env` reference against the live `.env` as part of that deploy's own pre-flight, per the standing lesson from Slice 12's `DEMAND_HASH_SALT` miss.

Files created: `lib/{slug,seller,seller-profile,links}.ts`, `lib/actions/{onboard-seller,update-seller-profile,seller-photos,seller-form-state}.ts`, `app/api/seller/media/route.ts`, `app/food/(dashboard)/{layout.tsx,onboarding/page.tsx,profile/page.tsx,profile/setup/page.tsx}`, `components/ui/textarea.tsx`, `components/seller/{field-form,toggle-list,step-nav,setup-progress,profile-checklist,status-banner,workspace-empty-states,seller-nav,signed-out-notice,onboard-form,display-name-field,bio-field,areas-field,languages-field,specialties-field,fulfillment-field,photo-field,gallery-manager}.tsx`, `components/seller/upload.ts`, `scripts/verify-seller.ts`, `scripts/verify-onboarding.mjs`.
Modified: `app/food/layout.tsx` (full-bleed shell, `<SurfaceBanner>` dropped), `app/food/(dashboard)/page.tsx` (placeholder → the real dashboard), `app/food/{admin,login}/page.tsx` (own `<main>`), `components/chrome/site-footer.tsx` (stub → real link), `components/coming-soon.tsx` (two icons), `components/ui/button.tsx` (hover contrast fix), `lib/auth-guards.ts` (`ensureFoodProviderMembership`), `lib/coming-soon.ts` (registry churn), `app/globals.css` + `tailwind.config.ts` (`green-deep`/`error-deep`), `messages/{en,es}.json` (392/392), `scripts/verify-a11y.mjs` (stub inventory), `scripts/verify-ecosystem.ts` (inverted FOOD assertion), `.env.example`, `package.json`, `BUILD_SLICES.md`.
Created (**Apoyo-Demia**): `prisma/migrations/20260802220000_enable_food_registration_config/migration.sql` — the only file written outside this repo.

### Slice 14 — Listing CRUD & availability windows

Read: arch doc Part D (`FoodListing` + windows), E5 intro (what listings must support), F1 dashboard routes.

- `/food/listings` list + `/food/listings/new` + edit: title/description, kind, price mode + price, feeds-count, categories (m2m), dietary tags, ingredient tags, occasion tag, photos (ordered, hero-first, pipeline-ingested), active toggle.
- Availability-window builder: PREORDER (lead days) / RECURRING_WEEKLY (day picker) / DATE_RANGE, multiple windows, per-window note. Human-readable summary rendered back ("Weekends · order by Friday 4pm").
- `lib/availability.ts`: window → "available today/tomorrow/this weekend" computation (fixed TZ) with unit tests — this feeds every discovery badge/filter; get it right once.
- Slug generation (title-based, collision-suffixed) for listings + sellers.

**Done when:** a PENDING seller creates a listing with photos + 2 window types; availability computation passes tests; listing renders on the Phase-1 detail page once the seller is (manually, for now) flipped to ACTIVE.

**Implementation notes (done 2026-08-03):** ✅ **Sellers can build a real menu.**

`/food/listings` (list), `/food/listings/new` (create), `/food/listings/[id]` (edit — base fields, photos, availability windows) are all real, backed by the real `FoodListing`/`FoodListingPhoto`/`FoodAvailabilityWindow` tables. **`npm run verify:listing-editor` — 38/38**, driving the slice's own done-when word for word in a browser against a **production build**: a PENDING seller creates a listing, adds two photos and TWO window types (RECURRING_WEEKLY + PREORDER), and the listing renders on `/meals/[slug]` only once the seller is manually flipped to ACTIVE. **`npm run verify:listings` — 33/33** on the domain layer (slug collisions, price/window validation held up against the *actual* CHECK constraints, ownership scoping, the visibility rule from the write side). **`lib/availability.test.ts` — 27/27**, the first `npm test` this repo has ever had (**vitest**, pinned `^3.1.0` to match portal-web's own pin — the one precedent in this stack). tsc/lint/build clean (33 routes).

**⚠ `lib/availability.ts` needed NO changes to its exported behaviour** — Slice 9 pulled it forward whole, correctly anticipating this slice's needs, and this slice only added two small bitmask helpers (`bitmaskFromDays`/`daysFromBitmask`) for the day picker. Every existing function is now proven by a real automated suite rather than by the ad hoc verification scripts and code comments that were the only evidence before today — closing the gap the Phase-0 review flagged and Slice 13 re-flagged: **this repo had zero automated tests before this slice.**

**Three real defects found by verifying, not reading, none of them in application code:**

1. **A genuine bilingual UX bug: two dropdowns on the same edit page were both labelled "Tipo".** The listing's `kind` selector (`kindLabel`) and the window builder's `type` selector (`typeLabel`) translated to the identical Spanish word — confusing for the Spanish-first seller surface regardless of testing, and it also made the two controls programmatically indistinguishable by accessible name. Renamed to "Tipo de plato" / "Tipo de horario" in Spanish (and "Dish kind" / "Availability type" in English, for the same clarity, though English's own words didn't literally collide). Found because the E2E script's `getByLabel("Tipo")` was ambiguous — the ambiguity was real, the test just surfaced it first.
2. **My own E2E script raced ahead of the real page navigation.** `waitForURL(/\/food\/listings\/[a-z0-9]+$/i)` also matches `/food/listings/**new**` — "new" is itself lowercase-alphanumeric — so the wait resolved on the STARTING url before the create action had even run, and the very next assertion read the database before the write landed. No Playwright error, because the regex genuinely matched; the script just proved nothing. Fixed with a length floor (`{10,}`) that only a cuid satisfies. The theme across every slice's own findings continues: a check that resolves for the wrong reason is worse than one that fails.
3. **`getByLabel` cannot find a `<fieldset><legend>` group.** `<WeekdayPicker>`'s day-picker legend named its group correctly per HTML/ARIA (a `<fieldset>` has an implicit `role="group"`, named by its `<legend>`) — but `getByLabel` is built for `<label>`-associated form controls specifically, a different pairing, and never matches a legend. Not a component defect (the pattern is the correct accessible one); the test needed `getByRole("group", { name })` instead. Recorded because `<ToggleList>` (Slice 13) uses the identical fieldset/legend shape, so any FUTURE script locating inside it needs the same query.

**Architecture decisions worth not re-litigating:**

- **One atomic form for create+edit, NOT a resumable wizard.** Slice 13's onboarding is a guided multi-step flow because architecture F2 asks for "skippable-and-resumable, never force completeness before value" on a *profile*. This brief describes listing CRUD as a single form ("title/description, kind, price mode + price, feeds-count, categories, dietary tags, ingredient tags, occasion tag") with no such instruction — a dish has no product reason to be built one field at a time, so `upsertListing` validates and writes everything in one call. `<ListingForm>` is deliberately NOT built on `<FieldForm>` (Slice 13's edit-in-place component): create and edit need genuinely different post-submit behaviour (create redirects to the new listing's edit page, where photos/windows can attach to a real id; edit shows inline "Saved"), and teaching `<FieldForm>` a redirect mode it otherwise never needs would have been the wrong direction to bend it. Same reasoning kept `<AvailabilityWindowForm>` bespoke rather than wedged into `<FieldForm>` — its add-another-and-clear behaviour is a different shape than edit-and-confirm.
- **`active` is deliberately NOT a field in `<ListingForm>`.** It's a seller-facing pause switch (`<Switch>`, a new primitive — real `role="switch"`/`aria-checked`, deliberately distinct from the `aria-pressed` toggle buttons used everywhere else in this app, because ARIA gives the two different semantics: "one thing, on or off" vs "select zero-or-more from a set"), flipped independently with no Save required, on both the list page and the edit header. Bundling it into the main form would mean pausing a sold-out dish always required touching everything else about it too.
- **New listings default `active: true`, matching the schema.** Considered and rejected the alternative (default to a draft `false` until manually published): the done-when's own wording tests that flipping the *seller* — not the listing — is what gates visibility, and `<MealCard>` already renders a real, supported empty state for a listing with no photo yet (Slice 7's sunken placeholder). A listing is complete the moment its required fields exist; `active` is for pausing an existing dish, not gating a new one.
- **Deactivating is the ONLY "delete" this product has, and there is no delete button anywhere in this UI.** Slice 2's deletion policy is explicit: a hard delete of a listing with orders is `Restrict`-blocked at the DB level, and "the product never hard-deletes: `SellerStatus.SUSPENDED` and `FoodListing.active = false` exist for that." `verify-listings.ts` proves both halves — pausing genuinely removes a listing from `DISCOVERABLE` (the buyer-facing effect), and a listing with no orders technically CAN still be hard-deleted at the DB layer (nothing here suggests otherwise) — no UI path calls it.
- **`lib/availability-window-form.ts` mirrors `food_availability_windows_fields_by_type` FIELD FOR FIELD, not just in spirit.** Every window a seller submits is validated against the exact same four rules the CHECK constraint encodes (PREORDER requires a lead time; `daysOfWeek` present iff RECURRING_WEEKLY; both date boundaries present iff DATE_RANGE and running forwards; lead time allowed on ANY type) — checked here so a bad value is a form error, not the CHECK's unhelpful 500 with no usable `.code` (Slice 2's own finding, applied rather than rediscovered). The app layer adds ONE stricter rule the DB doesn't: a lead time must be ≥1, not merely ≥0 — "0 days ahead" is same-day, which having no PREORDER window already means.
- **`lib/window-labels.ts` is new, and it's a refactor as much as an addition** — `buildWindowLabels()` was extracted from `/meals/[slug]/page.tsx`'s own inline construction (Slice 10) so the buyer's listing page and the seller's window-summary list render the word-for-word IDENTICAL sentence for the same window, from one source rather than two that could quietly drift. `<AvailabilityWindowList>` (new) uses it to show a seller exactly what a buyer will see, via the same `describeWindow` + `<AvailabilityStamp>` pairing.
- **Windows are add-one/remove-one, never a whole-array replace.** "Multiple windows per listing" (the brief's own words) is the common case Slice 8's seed already models throughout the catalogue, and per-window CRUD keeps `validateWindowInput`'s mirroring of the CHECK constraint exact — a batch replace would need the identical per-row rule re-derived anyway, with more surface for the two to drift.
- **`/api/seller/listing-media` is a NEW route, not a third kind on `/api/seller/media`.** Same rationale Slice 13 gave for why THAT route exists alongside `/api/media/upload`: ingest and persist in ONE ownership-checked request, so the browser never handles a storage key it could substitute for one it doesn't own. Here the check is one relation hop further out (listing → seller, not seller directly) — `requireOwnListing(listingId)` confirms both "you own a seller row" and "this listing is yours" before a single byte is read. Rate-limited under the SAME `seller-media:*` buckets as the other route, not a second budget — a seller flooding the disk via listing photos instead of profile photos is still one seller flooding the disk.
- **Listing slugs are collision-suffixed GLOBALLY, not per-seller** — confirmed in `verify-listings.ts` with two different sellers naming the same dish. `/meals/[slug]` is a root-level route (Slice 2), so the uniqueness has to be global; `lib/slug.ts`'s `firstFreeSlug` helper is now shared between `uniqueSellerSlug` and the new `uniqueListingSlug` rather than copied, since the collision rule is one rule. **Listing slugs never rotate on edit either** — the same reasoning Slice 13 gave for seller slugs, extended here: `/meals/<slug>` is a URL a buyer bookmarks or a seller pastes into WhatsApp, and renaming a dish updates `title` only.
- **"Primary category" needed no new mechanism.** Slice 10 already derives it by `orderBy: { category: { sortOrder: "asc" } }` on the listing's category join — the category with the lowest taxonomy `sortOrder` wins, an admin-controlled precedence rather than "whichever the seller picked first." `<ListingForm>`'s category picker is therefore a plain multi-select (reusing `<CategoryChip>`, the same tinted chip the buyer surface renders); it does not need to track or communicate which selection is "primary" at all.
- **Ingredient tags got their own small chip-input, deliberately NOT extracted from `<SpecialtiesField>` into a shared primitive.** Two real call sites is the textbook moment to extract, and it was considered — but `<SpecialtiesField>` is Slice 13's already-verified code, and touching it here would have widened this slice's blast radius for a cosmetic win. Duplicated instead, same shape, independent files.
- **`DIETARY_TAGS` (Slice 9's `lib/browse.ts` constant) is reused as-is for the listing form's dietary checkboxes**, and `filters.dietaryTags`'s existing translations are reused directly rather than re-declared under a `seller.*` namespace — one vocabulary, one translation, whichever surface is asking.
- **`KNOWN_OCCASION_TAGS` (Slice 10's `lib/occasion-tags.ts`) is now exported** and feeds the occasion field's `<datalist>` suggestions — the free-text column stays free text (Part D), but a seller typing "christmas" sees the same word the buyer-facing badge will render, rather than guessing at spelling.
- **The dashboard's listings card is genuinely data-driven now, the first of the three empty-state cards to be.** `WorkspaceEmptyStates` takes a real `listingCount` and branches copy/action between "add your first dish" (0) and "manage your N dishes" (1+); Fresh Today and Orders stay `<ComingSoon>` stubs, correctly, since Slices 15/17 haven't shipped yet.

**Verification, and its own limits, stated plainly:**

- **`verify:listing-editor` (38/38, new)** covers the full done-when plus what it implies: the anonymous/PENDING/ACTIVE visibility chain from both the editor and buyer sides; both photos landing as pipeline storage keys with a correctly-labelled hero; both window types with their bitmask/lead-time encoded correctly and their human-readable summaries rendering on BOTH the editor and the live `/meals/[slug]` page; editing an existing listing through the identical action with the slug provably unchanged; the pause switch flipping immediately and genuinely 404ing the listing even under an ACTIVE seller; a second seller 404'd off the edit URL directly and 401'd off the upload API; and a 390px layout sweep (overflow only — see the gap below).
- **`verify:listings` (33/33, new)** is the domain layer: every window-validation branch (RECURRING_WEEKLY with zero days, DATE_RANGE running backwards or missing a boundary, PREORDER with no lead time, a DATE_RANGE window that ALSO carries a lead time — Part D's own named example) checked against `lib/availability-window-form.ts`, and separately checked against the REAL database CHECK constraints as defence-in-depth (a hand-crafted row violating "daysOfWeek present iff RECURRING_WEEKLY" is rejected by Postgres itself, not just by the app).
- **⚠ Known gap, same shape as Slice 13's: `verify-a11y.mjs` still cannot reach `/food/listings*`** — it drives every route anonymously, and the whole listing editor is session-gated. `verify-listing-editor.mjs` only checks horizontal overflow at 390px on the three new routes, not full contrast/tap-target auditing (Slice 13's onboarding flow got the same partial treatment). Teaching the a11y script to carry a session is real, separable work, still not done. Phase 2's own bar remains "working", not "visually finished."
- **`verify-onboarding.mjs`'s stub-inventory assertion was UPDATED, not merely re-passed.** It previously asserted `sellerListings` renders a `<ComingSoon>` trigger on `/food`; this slice retired that stub, so the assertion now checks for its ABSENCE — the identical treatment `verify-a11y.mjs` already gives `becomeSeller`'s Slice 13 retirement, so a regression (the stub silently coming back) fails loudly rather than passing by doing nothing.
- **Full regression, all green:** `verify:a11y` 494/0 (unchanged — confirms the buyer surface and the anonymous seller surface are both untouched), `verify:onboarding` 66/66 (post stub-retirement fix), `verify:ecosystem` 15/15, `verify:pwa` 19/19, `verify:seed` 48/48, `verify:discovery` 80/80, `verify:saves` 22/22, `verify:follows` 34/34, `verify:media` 58/58, `verify:translation` 28/28, `db:verify` 49/49. Bilingual parity **494/494** (up from Slice 13's 392 — 102 new keys per catalogue).

Files created: `lib/{listing,listing-form,availability-window-form,window-labels}.ts`, `lib/actions/{upsert-listing,listing-photos,listing-availability}.ts`, `lib/availability.test.ts`, `app/api/seller/listing-media/route.ts`, `app/food/(dashboard)/listings/{page.tsx,new/page.tsx,[id]/page.tsx}`, `components/ui/{select,switch}.tsx`, `components/seller/{weekday-picker,availability-window-form,availability-window-list,listing-photo-manager,listing-form,listing-active-toggle}.tsx`, `vitest.config.ts`, `scripts/{verify-listings.ts,verify-listing-editor.mjs}`.
Modified: `lib/availability.ts` (`bitmaskFromDays`/`daysFromBitmask`), `lib/slug.ts` (`uniqueListingSlug`, shared `firstFreeSlug`), `lib/seller.ts` (unchanged behaviour, re-verified), `lib/occasion-tags.ts` (`KNOWN_OCCASION_TAGS` exported), `lib/actions/seller-form-state.ts` (listing/window error keys), `lib/coming-soon.ts` (`sellerListings` retired), `components/seller/{seller-nav,workspace-empty-states}.tsx`, `components/seller/upload.ts` (`UploadOptions` for the listing-media endpoint), `app/food/(dashboard)/page.tsx` (real `listingCount`), `app/(client)/meals/[slug]/page.tsx` (refactored onto `lib/window-labels.ts`), `scripts/{verify-a11y.mjs,verify-ecosystem.ts,verify-onboarding.mjs}` (stub-retirement / inverted-toggle assertions), `messages/{en,es}.json` (494/494; also fixed the Tipo/Tipo collision), `package.json` (`test`, `verify:listings`, `verify:listing-editor`, `vitest` devDependency), `BUILD_SLICES.md`.

### Slice 15 — Fresh Today posting tools & seller dashboard

Read: arch doc E2 in full (posting flow, expiry), Part D (story entities), E7 intro (what a basic dashboard needs vs. the full Phase-6 insights feature).

- `/food/stories` (route name generic; UI is Fresh Today): post flow (photo → caption → optional linked listing, ≤3 taps), active-posts list with view counts, delete; Menu shelf manager (create/name/assign highlights).
- `food-sweep` process (PM2, `--interpreter none` if tsx): Fresh Today expiry pass; runs locally via npm script for now, PM2 wiring at Slice 19's deploy.
- Convert Slice 8's seed Fresh Today posts to realistic recent timestamps (they were seeded far-future to survive until this slice).
- Basic seller dashboard: views/saves/follows counts — **not** the full analytics/insights dashboard (that's Phase 6, later).

**Done when:** post → appears with the freshness-dot treatment → viewer works with gestures → expiry sweep clears an aged post → highlight persists on the Menu shelf; dashboard shows correct counts for a real seller's real listings.

**Implementation notes (done 2026-08-03):** ✅ **Sellers can post, and the demo's Fresh Today content is honest about time.**

`/food/stories` (post flow, active-posts list, Menu shelf manager) and `food-sweep` (the expiry job, both a persistent PM2-shaped runner and a `--once` single pass) are real. **`npm run verify:story-posting` — 28/28**, driving the slice's own done-when word for word in a browser against a production build: two real posts (photo through the real pipeline, caption, a linked ACTIVE listing) → the freshness dot on the public profile → the full-screen viewer's tap-advance and Escape → an authenticated buyer's view recorded → `food-sweep --once` (the REAL CLI entry point, shelled out to, not a reimplementation) clearing a backdated ephemeral post while an equally-backdated HIGHLIGHTED one survives and still shows on the seller's own Menu shelf manager → the dashboard's views/saves/follows tiles matching real, independently-queried counts. **`npm run verify:sweep` — 12/12** and **`npm run verify:seller-stories` — 14/14** cover the domain layer, including proving the sweep's file deletion against real files on disk, not just row counts. tsc/lint/vitest/build clean (31 routes).

**⚠ THE FINDING OF THIS SLICE — realistic story timestamps broke two OTHER scripts' silent assumptions, and both were deterministic, not flaky.** Converting the seed's Fresh Today posts from a far-future placeholder to `createdAt` + 24h (a genuine mix of already-expired and still-active, matching real production behaviour) was explicitly this slice's own instruction. It also quietly invalidated an assumption every PRIOR slice's script had been free to make without stating it: *any* seeded story was *always* active, because nothing before this slice could make one expire. Two places broke the moment that stopped being true:
1. **`verify-follows.ts`** picked its "followed seller" fixture via `findFirst({ where: { status: "ACTIVE" } })` — no story-freshness filter, because none was ever needed. On a real run, the arbitrarily-first ACTIVE seller had zero currently-active stories, and `freshTodayEntries` correctly omitted them — which the script read as a broken re-ordering rather than its own stale fixture. Fixed by adding `stories: { some: { expiresAt: { gt: new Date() } } }` to the selection `where`.
2. **`verify-a11y.mjs` hardcodes `cocina-de-abuela`** as its `/stories/[slug]` fixture — named explicitly in Slice 11's own comment for being simultaneously an ACTIVE seller with a Menu shelf highlight, active listings, a gallery, AND an active story, because several assertions (the profile page's Menu-shelf-links-to-the-viewer check among them) depend on all of those being the SAME seller at once. Left to the same coin flip as every other seller, that seller's one freshToday entry landed already-expired on the very first re-seed after this slice's rewrite — a **deterministic** outcome of the hash-based per-entity RNG stream (`rngFor('fresh:cocina-de-abuela')`), not a timing fluke, so it would have failed identically on every future run until fixed. Rather than teach the a11y script to resolve a seller dynamically (which would have needed to re-derive ALL of those other properties, not just story freshness, since several assertions assume one seller satisfies every one of them at once), the SEED now exempts this one specific, named seller's index-0 entry from the expiry coin flip — the same "deliberate, named exception" shape the seed already uses for `mama-lin-kitchen` (SUSPENDED) and `pastelitos-y-mas` (PENDING), applied to a new class of trap this slice introduced.

**Architecture decisions worth not re-litigating:**

- **The sweep's one rule, stated as code rather than prose: `expiresAt <= now AND highlightId IS NULL`.** A highlighted story is *never* swept, however old — Part E2: "Highlighted entries persist on the profile." This is a property of the row's own `highlightId`, not of `expiresAt`; `expiresAt` still governs whether a highlighted story appears in the Fresh Today VIEWER's "active stories" (Slice 11's own `sellerActiveStories` filters on it regardless of highlight status) — only the sweep treats a highlight as a deletion exemption. The done-when's own sentence — "clears an aged post → highlight persists on the Menu shelf" — describes TWO outcomes from ONE pass, not two jobs, and `lib/sweep.ts` is written that way: one query, one delete, one file-cleanup loop.
- **`lib/sweep.ts` / `scripts/sweep.ts` mirror Salon's `lib/sweeps.ts` / `scripts/sweep.ts` shape** — the ecosystem's own precedent for this exact job class (BUILD_SLICES.md conventions: "Expiry sweep job pattern … reused for Story expiry and stale-order expiry"). A persistent `setInterval` sidecar ticking every 5 minutes, running once immediately on startup, swallowing a failed tick rather than taking the process down. `scripts/sweep.ts` also takes a `--once` flag — not asked for explicitly, but cheap to add and what makes both this slice's own verification AND a future PM2-cron-restart deployment possible without a second script. PM2 wiring is deliberately NOT done here — Slice 19's job, per the brief — but the two gotchas it will need (`--interpreter none` for a tsx script; pin the interpreter path explicitly, Slice 6's own finding) are recorded in the script's own header so Slice 19 doesn't have to rediscover them.
- **The sweep deletes the ROW before the FILES** — the reverse of every other deletion in this app (`deleteStory`, `removeListingPhoto`, etc. all delete files first). Deliberate, not an inconsistency: everywhere else, a crash between the two steps should leave a row pointing at deleted files (worse) rather than an orphaned file (disk waste). Here the row is being discarded outright with nothing anyone is currently viewing depending on it surviving a few extra seconds, so the failure mode that matters most is the opposite: a crash mid-sweep should never leave a row whose files are already gone.
- **Photo upload reuses `/api/media/upload` (`kind: "story"`) — no new route.** Slice 4's own comment reserved that generic, non-persisting route for exactly this shape: an entity whose photo has to exist before the entity itself does. `createStory` is the trust boundary on the returned keys — `isStoryStorageKey` (inlined directly into `lib/actions/create-story.ts`, not `lib/story-form.ts` — see the finding below) rejects a key from any category other than `stories`, so a tampered request can't make a `FoodStory` render someone else's avatar or a listing's meal photo.
- **⚠ A real client-bundle bug, caught by `next build` and by nothing else.** `lib/story-form.ts` originally held `isStoryStorageKey`, which imported `safeStorageKey` from `lib/storage.ts` — a module that touches `fs/promises`. `<StoryPostForm>` (a Client Component) imports `MAX_CAPTION_LENGTH` from the SAME file, so webpack bundled the whole transitive import graph — including `fs/promises` — into the BROWSER bundle, and the production build failed outright (`Module not found: Can't resolve 'fs/promises'`). Invisible to `tsc` and to lint, both blind to bundle boundaries; only `next build` catches it. Fixed by moving `isStoryStorageKey` into `lib/actions/create-story.ts`, the one server-only place that ever needed it, and `lib/story-form.ts` now carries an explicit header warning against importing anything `fs`-adjacent again.
- **No `updateStory` exists anywhere, on purpose.** Part E2: "No scheduling, no editing after post (delete + repost) — keep the surface tiny." Only creation and deletion. The Menu shelf manager's own three verbs — create/name/assign — are each a dedicated action (`createHighlight`/`renameHighlight`/`assignStoryToHighlight`), none of them an "edit a story" action in disguise.
- **Deleting a highlight does NOT delete its stories** — `FoodStory.highlight` is `onDelete: SetNull` (Slice 2), so a removed shelf releases its stories back to plain posts, which `food-sweep` picks up on its next pass exactly as if they had never been highlighted. No application-level cleanup needed; the FK does the whole job, and `lib/actions/story-highlights.ts` says so rather than adding a redundant delete-many.
- **View counts on `/food/stories`'s active-posts list are `FoodStoryView` rows — authenticated unique viewers, not total impressions.** `FoodDemandEvent` (which DOES fire for anonymous viewers too, via `STORY_VIEW`) carries no `storyId` column at all, so a per-post anonymous count genuinely cannot be computed from it; only Phase 6's aggregate "Fresh Today reach" can ever include anonymous views. Stated in the component's own comment so a later slice doesn't "fix" the number by trying to blend two incompatible signals.
- **The basic dashboard's three counts, and why each is one query (or zero):** Views is `FoodDemandEvent` rows carrying this seller's id across `PROFILE_VIEW` + `LISTING_VIEW` — both already write `sellerId` (Slice 9/10), so no join through every listing is needed. Saves is `FoodSave` counted through the listing relation (`FoodSave` has no `sellerId` column — Part D — a save belongs to a listing). Follows reads `FoodSeller.followerCount` directly — the denormalized counter Slice 11 already maintains transactionally on every follow/unfollow — rather than recomputing it, matching how that slice established the column as authoritative for display. Shown for every seller standing, PENDING included: zero is a real, honest number for someone nobody can discover yet, not a state to hide.
- **The dashboard's Fresh Today card became data-driven the same way Slice 14 made the listings card real** — `activeStoryCount` counts only NON-expired posts on purpose: a seller who posted yesterday and let everything expire should see the empty-state copy again ("post your first update"), not a stale "manage your post" pointing at nothing currently live.
- **`sellerListings`'s sibling stub, `sellerStories`, is now retired from `lib/coming-soon.ts`** — the same one-line-plus-registry-entry contract Slices 13/14 already exercised twice. The seller nav now has four real destinations and one stub (`sellerOrders`, Slice 17); `scripts/verify-a11y.mjs` and `verify-onboarding.mjs` both check for the retirement's ABSENCE, not merely drop it from the present-list, the same regression guard applied to `becomeSeller` and `sellerListings` before it. The now-unused `"camera"` `FeatureIcon` variant (its only user was the retired stub) was removed from both `lib/coming-soon.ts` and `components/coming-soon.tsx`'s icon map rather than left as dead code.

**Verification, and its own limits, stated plainly:**

- **`verify:sweep` (12/12, new)** proves the sweep against REAL files on disk (via `writeMediaVariant`, the actual storage-writing function, not a fabricated path) — an ephemeral-expired row's files are genuinely deleted, a highlighted-expired row's files are genuinely untouched, a second immediate pass clears zero (idempotent), and un-highlighting an old post hands it back to the very next pass.
- **`verify:seller-stories` (14/14, new)** covers ownership scoping (proven the same way every ownership check since Slice 10 has been — the compound-`where` shape run directly, because `requireOwnStory`/`requireOwnHighlight` call `next/headers` and throw outside a real request scope), `activeStoriesForSeller`'s expiry filter with a real `FoodStoryView` count, `highlightsForSeller` showing an expired story that's still on its shelf, and `sellerDashboardStats`'s three numbers against independently-created fixture rows (including a `SEARCH` demand event deliberately NOT counted as a view, to prove the `kind` filter is real).
- **⚠ `verify-story-posting.mjs` writes REAL files for its backdated fixtures, not just DB rows** — the first draft fabricated `FoodStory` rows with storage keys that were never actually written to disk, which 404'd the moment a page tried to render them and surfaced as a false "app is broken" console-error failure. Fixed by writing real (tiny, non-image) bytes at the exact keys before creating the rows, mirroring `verify-sweep.ts`'s own discipline. The "highlight persists" assertion was also redirected from the PUBLIC profile page to the SELLER'S OWN manager page mid-development: `/sellers/[slug]` shows only a highlight's SINGLE most-recent story as its cover (Slice 11's `take: 1`), and the live-posted story from earlier in the same run was newer than the deliberately-backdated one — so checking the public profile would have passed or failed for the wrong reason regardless of whether the sweep's exemption actually worked. The manager page (`highlightsForSeller`, no `take` limit) is where every story under a shelf is genuinely enumerated, which is the real claim.
- **Full regression, all green, with two real fixes along the way (see the finding above):** `verify:a11y` 494/0, `verify:onboarding` 66/66, `verify:listing-editor` 38/38, `verify:ecosystem` 15/15, `verify:pwa` 19/19, `verify:seed` 51/51 (up from 48 — the new story-timestamp assertions), `verify:follows` 34/34 (post-fix), `verify:listings` 33/33, `verify:seller` 43/43, `verify:discovery` 80/80, `verify:saves` 22/22, `verify:media` 58/58, `verify:translation` 28/28, `db:verify` 49/49. Bilingual parity **546/546** (up from Slice 14's 494 — 52 new keys per catalogue).
- **⚠ Still no ownership-bypass check via a real HTTP route for stories, unlike Slices 13/14's listing/seller-media routes.** There is no story-specific upload route to attempt a cross-account POST against (`/api/media/upload` persists nothing, so there is no resource to steal); the delete/highlight actions are Server Actions, not reachable by a plain `page.request.post` without reconstructing Next's server-action invocation protocol. The compound-`where` ownership SHAPE is proven at the domain layer (`verify-seller-stories.ts`); a live cross-account bypass attempt was judged not meaningfully testable via HTTP here and was not faked.

Files created: `lib/{story-form,sweep,seller-stories}.ts`, `lib/actions/{create-story,story-highlights}.ts`, `app/food/(dashboard)/stories/page.tsx`, `components/seller/{story-post-form,active-stories-list,highlight-manager,dashboard-stats}.tsx`, `scripts/{sweep.ts,verify-sweep.ts,verify-seller-stories.ts,verify-story-posting.mjs}`.
Modified: `lib/actions/seller-form-state.ts` (story/highlight error keys), `lib/coming-soon.ts` (`sellerStories` retired, `camera` icon removed), `components/coming-soon.tsx` (icon map), `components/seller/{seller-nav,workspace-empty-states}.tsx`, `app/food/(dashboard)/page.tsx` (dashboard stats + real story count), `prisma/seed-demo.ts` (realistic story timestamps + the `cocina-de-abuela` exemption), `prisma/verify-seed.ts` (story-timestamp assertions rewritten), `scripts/verify-follows.ts` (fixture-selection fix), `scripts/verify-a11y.mjs` + `scripts/verify-onboarding.mjs` (stub-retirement assertions), `messages/{en,es}.json` (546/546), `package.json` (`verify:sweep`, `verify:seller-stories`, `verify:story-posting`, `food-sweep`, `food-sweep:once`), `BUILD_SLICES.md`.

---

## Slice 16 — Admin composition & trust basics

Read: `UNIFIED_ADMIN_SHELL_SLICES.md` (UAS-S2/S3 + the Salon mirror as the worked example); Apparel `BUILD_SLICES.md` Slice 16 plan (its own equivalent, not yet built as of this writing — Food may end up being the first vertical to actually execute this pattern; if so, extending `portal-web/lib/admin-nav.ts`'s `AdminOwnerApp` type to include `"food"` is real, needed work, not a formality).

- `/food/admin` renders the **shared Apoyo admin shell chrome** — mirror Salon's approach exactly: a copy of `lib/admin-nav.ts`, a client shell component, and namespaced CSS (e.g. `--fd-*`) scoped so it cannot collide with this app's Tailwind tokens.
- ⚠ **Every data-loading admin page must call the payload guard before its first query** — the layout gate controls what is *displayed*, not what *executes*; a page under a denying layout still serializes its query results into the RSC payload. This was a real live leak found in Portal (`PRE_LAUNCH_CHECKLIST.md` §0, Apoyo-Demia repo). Do not repeat it here.
- Seller approval queue (`PENDING` → `ACTIVE`/`SUSPENDED` — the queue Slice 13's onboarding has been waiting on), listing takedown, report/flag intake, category manager (add/edit, en+es names).

**Done when:** the admin surface is ADMIN-only, an **unauthenticated** production-build GET of every admin route has been grepped for seeded/real data and is clean, the chrome is visually identical to Portal's, and a real PENDING seller from Slice 13 can be approved to ACTIVE through this UI (not a manual DB flip).

**Implementation notes (done 2026-08-03):** ✅ **Food has an admin surface, and it composes into the shared ecosystem shell.**

`/food/admin` renders the shared Apoyo admin shell chrome (seller approval queue, listing takedown, report/flag intake, category manager), mirroring Apparel's own Slice 16 — built and committed since Food's own brief was written, and used as the worked example in place of Salon (the brief's original pointer). **`npm run verify:admin` — 20/20** on the domain layer, **`npm run verify:admin-e2e` — 28/28** driving the real `/food/admin` UI in a browser against a **production build**: unauthenticated and signed-in-non-admin requests both leak zero seeded data; a real PENDING seller is approved to ACTIVE, suspended, and reinstated, each through a real button click, never a manual DB flip; a real open report is dismissed; a real listing is taken down via the search tool and its public page immediately 404s; a real category is created with both names. tsc/lint/build clean (30 routes). Bilingual parity **617/617** (up from Slice 15's 546). Full regression re-run: `verify:discovery` 80/80, `verify:listings` 33/33, `verify:translation` 28/28, `verify:a11y` **494/0** (unchanged from Slice 15 — no regression).

**⚠ TWO REAL DEFECTS found by driving the actual browser, both fixed — neither in the code this slice's brief asked for:**

1. **`getProviderRegistrationConfig()` (Slice 3) claimed to fail closed on an ecosystem-API outage but didn't.** Its own comment said "fail CLOSED… rather than throw", and the `!res.ok` branch honoured that — but the `fetch()` call itself throwing (ECONNREFUSED, as opposed to a reachable server returning a bad status) was never caught, and propagated straight out of `<SiteFooter>` (Slice 7), which calls this on **every** buyer-facing page. Reproduced directly: with no local portal-web running, `/`, `/browse`, `/sellers/[slug]` and `/meals/[slug]` all 500'd identically, while `/food` and `/food/admin` (no `SiteFooter`) were unaffected — the tell that pointed straight at the shared chrome rather than anything Slice 16 touched. `lib/discovery.ts`'s own Slice 16 change (`takenDownAt`) was checked and ruled out first, directly: every discovery function called outside HTTP entirely, against the same DB, returned correct real data with no ecosystem API reachable at all. Fixed with a try/catch around the fetch call, wrapping it in the SAME fail-closed return the `!res.ok` branch already used — the fix `getProviderRegistrationConfig` always claimed to have.
2. **My own `verify-admin-e2e.mjs` left a launched Chromium open on any assertion failure**, which kept the Node process's event loop alive indefinitely with nothing left to do — not a hang mid-test, a hang *after* an error was already caught and logged, because nothing on the failure path called `browser.close()`. Compounded by testing against the wrong locale: the script hardcoded English button labels ("Approve", "Suspend"…), but this app's real default is Spanish (the same thing `verify-onboarding.mjs` already found for its own surface) — every locator waiting on English text burned its own 30s Playwright timeout before the dangling browser connection took over and the process sat idle. Fixed both: locators now match the real Spanish default, and `main().finally()` unconditionally closes the browser and calls `process.exit()`, so a future assertion failure fails fast and visibly instead of hanging silently.

**Architecture decisions worth not re-litigating:**

- **`FoodListing.takenDownAt` is a SEPARATE gate from the seller's own `active` pause switch, not a repurposing of it.** Food's `active` is a plain boolean the seller controls freely (Slice 14); Apparel's equivalent status enum has a distinct `REMOVED` value an admin controls that a seller cannot self-reverse. Food's schema had no such distinction before this slice — reusing `active` for admin takedown would have meant a seller could silently undo an admin's removal by flipping their own switch back on, which would make "takedown" a purely decorative admin action. `DISCOVERABLE` now requires both `active: true` AND `takenDownAt: null`; `toggleListingActive` refuses to flip `active` while `takenDownAt` is set (returning a `takenDown` error, currently unreachable through the UI since the toggle is hidden whenever a listing is taken down — kept for defence in depth against a direct action call). The seller's own listings pages show a plain "Taken down by Apoyo" badge/notice instead of the toggle.
- **The shared admin shell CSS uses `--aa-*`, not the `--fd-*` the brief itself suggested.** The brief was written before Apparel proved out the pattern; Apparel's (and Salon's) actual built shell uses `--aa-*` as a FIXED namespace for the shared chrome contract, not a per-vertical prefix — the whole point of nav-contract item 5 ("chrome visually identical to Portal's") is that this CSS is meant to be identical across every vertical, so giving Food's copy its own prefix would be the one thing guaranteed to invite drift instead of prevent it. Deviated from the brief's own suggestion deliberately, matching the two already-built precedents instead.
- **`FoodReport` mirrors `ApparelReport`'s shape almost exactly, with one Food-specific swap**: `FOOD_SAFETY_CONCERN` replaces `WRONG_CATEGORY` as a report reason — a home-kitchen marketplace has real food-safety stakes Apparel's does not (architecture Part G), and "wrong category" has no equivalent weight here. `listingId` is nullable with `onDelete: SetNull` (a report is evidence about the SELLER even if the listing it named is later gone); `sellerId` is denormalized onto the row for the same query-convenience reason Apparel's copy does it. Anonymous reporting (`reporterUserId` nullable) and the one-OPEN-report-per-listing dedup are carried over verbatim — the mitigation for an anonymous, unauthenticatable reporter is content-scoped, not identity-scoped, and that reasoning doesn't change per vertical.
- **`updateSellerStatus`/`takedownListing`/`resolveReport` return a plain `{ok, reason}` shape, not `SellerFormState`.** The admin UI shows one generic error label per action (`AdminActionButton`'s `errorLabel` prop) rather than a per-reason message, matching Apparel's own admin actions exactly — so those reason strings never need translated messages. `createCategory`/`updateCategory` are the one place this slice genuinely needed inline per-field errors (a form with real validation, not a button), so those two alone return `SellerFormState` and read from the shared `seller.errors` dictionary, matching every OTHER seller-facing form in this app rather than Apparel's plainer `<form action={...}>` pattern.
- **`decideSellerLifecycleAction` is a pure function, decision only, no I/O** — the same split Apparel's `applySellerLifecycleAction` uses, and for the same reason: it's what let the exact bypass Apparel's own Slice 16 found live (a transition reachable from the wrong starting state, e.g. `reinstate` succeeding from `PENDING` and skipping `approve`'s own precondition) get asserted directly in `verify-admin.ts` for every `(action, startingStatus)` combination, without needing a live session or database write to prove the status machine itself is closed. `approve`'s extra precondition — `activationBlockers(completionInputFor(seller))` must be empty — is Food's own addition, since Food's `SellerStatus` has no `APPROVED`-vs-`PENDING` split point Apparel's has for the same purpose; it also finally makes `lib/seller-profile.ts`'s `REQUIRED_STEPS` mean something. That module's own comment named this exact moment as the module's reason for existing since Slice 13.
- **`updateSellerStatus`'s `approve` path re-confirms `(FOOD, PROVIDER)` membership before flipping the row**, mirroring the correctness requirement Apparel's Slice 16 named for itself, adapted to a different root cause. Food's onboarding already mints this membership at submit time (Slice 13) and `loadSellerWorkspace` self-heals it on every dashboard render — but a seller who never revisits the dashboard after submitting could reach this queue with the mint still missing, and `requireFoodSeller()` checks BOTH the row's status AND an ACTIVE membership. Approving without this call would flip the row to ACTIVE while leaving the seller unable to use the workspace they were just approved for.
- **The category manager (add/edit, en+es names) has no Apparel precedent** — `FoodCategory` is a Food-only model. `CategoryForm` reuses `SellerFormState`/`useTransition`, the same idiom every Slice 14/15 seller form already uses, and `uniqueCategorySlug` is a third caller of `lib/slug.ts`'s shared `firstFreeSlug` collision helper (alongside sellers and listings) rather than a fourth copy of the same retry loop. No delete action exists — the brief says "add/edit" only, and a category with listings attached would need a decision about what happens to those listings that nothing here was asked to make.
- **The buyer-facing report trigger (`<ReportListingSheet>`) mirrors Apparel's `<ReportSheet>` almost verbatim** (a plain text link with a flag icon, not a prominent button — "available, not featured" reads the same on a home-kitchen marketplace as on a garment marketplace), but built on Food's OWN primitives (`<Select>`/`<Textarea>`/`<BottomSheet>`) rather than Apparel's `<ChipGroup>`/`<Field>`, which don't exist in this app and weren't worth inventing for one caller.

**Verification, and its own limits, stated plainly:**

- **`verify-admin.ts` (20/20, new)** covers everything reachable without a real session (`requireAdmin()`-gated Server Actions resolve to signed-out outside a request scope, proven directly rather than assumed — the same limitation every prior slice's Server-Action-heavy domain script has documented): every `(action, startingStatus)` combination of the seller status machine including the exact bypass shape Apparel's own build found live; `DISCOVERABLE`'s `takenDownAt` gate against a real row, proven separately from `active`; `reportListing`'s anonymous dedup, invalid-reason rejection, and re-reporting after resolution, all against a real DB; `FoodReport`'s SetNull/Restrict deletion behaviour, verified by actually attempting each deletion, the same discipline Slice 2 established for the rest of the schema.
- **`verify-admin-e2e.mjs` (28/28, new)** drives the actual done-when sentence word for word against a production build, plus the report/takedown/category paths the done-when implies but doesn't name outright. One assertion (`(FOOD, PROVIDER)` membership confirmation after approve) SKIPS rather than passes or fails when no local ecosystem API is reachable — probed for real reachability rather than trusted from the env var's host string, so a configured-but-not-running host skips instead of reporting a false product failure. `approve` itself still succeeds either way, since `ensureFoodProviderMembership` (Slice 3) is deliberately non-fatal.
- **⚠ No live cross-account bypass attempt via HTTP for the admin actions**, the same gap Slice 15 named for its own Server Actions: `requireAdmin()`-gated actions aren't reachable by a plain `page.request.post` without reconstructing Next's server-action invocation protocol. `requireAdmin()`'s own logic (legacy `role === "ADMIN"`) is unchanged since Slice 3 and re-exercised here by every signed-in-non-admin assertion; a genuine non-admin session was proven denied both data and mutation access (the UI never renders the action buttons at all without `admin`), not merely a decision to trust the existing guard.
- **⚠ Debug probe scripts used to isolate the two defects above (`scripts/_probe-*.{ts,mjs}`) are left on disk, not committed** — thrown together to bisect a live failure, not durable test coverage, and flagged here rather than deleted unilaterally.

Files created: `lib/{admin-nav,admin-sellers,category-form}.ts`, `lib/actions/{admin,report-listing}.ts`, `components/admin/{apoyo-admin-shell,admin-access-denied,admin-action-button,category-form}.tsx`, `components/report-listing-sheet.tsx`, `app/food/admin/{layout.tsx,apoyo-admin-shell.css}`, `prisma/migrations/20260803085030_admin_takedown_reports/`, `scripts/{verify-admin.ts,verify-admin-e2e.mjs}`.
Modified: `prisma/schema.prisma` (`FoodListing.takenDownAt`, `FoodReport` + `ReportReason`/`ReportStatus`), `lib/discovery.ts` (`DISCOVERABLE` requires `takenDownAt: null`), `lib/listing.ts` (`takenDownAt` in both selects), `lib/slug.ts` (`uniqueCategorySlug`), `lib/actions/upsert-listing.ts` (`toggleListingActive` refuses while taken down), `lib/actions/seller-form-state.ts` (category + takedown error keys), `lib/ecosystem.ts` (**real fix** — `getProviderRegistrationConfig` now actually fails closed on a network-level fetch failure, not just a bad HTTP status), `app/food/admin/page.tsx` (placeholder → real admin surface), `app/food/(dashboard)/listings/{page.tsx,[id]/page.tsx}` (takedown badge/notice, toggle hidden), `app/(client)/meals/[slug]/page.tsx` (report trigger wired in), `messages/{en,es}.json` (617/617), `package.json` (`verify:admin`, `verify:admin-e2e`), `BUILD_SLICES.md`.
Modified (**Apoyo-Portal**, cross-repo, user permission granted in-session): `portal-web/lib/admin-nav.ts` (`"food"` added to `AdminOwnerApp`/`AdminNavGroup`, a Food registry group entry — mirroring Apparel's own addition of itself).

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

**Implementation notes (done 2026-08-03):** ✅ **Ordering is real — built, not stubbed — but ships administratively paused, per a Custom Edit to this slice's own brief.**

**⚠ CUSTOM EDIT, not in the original brief: a pre-launch "Coming Soon" admin gate.** The user isn't ready to officially launch the service, and asked for the *feature itself* to ship complete while a single admin-controlled toggle decides whether buyers can actually use it — flip it on later from `/food/admin` when ready, no redeploy. This is a NEW layer, not a repurposing of the existing `<ComingSoon>` registry: `lib/coming-soon.ts` marks features that don't EXIST in code yet ("built later, this slice"); this gate marks a feature that exists and works, administratively paused. Conflating the two would have been wrong on both sides — the registry's own `FeaturePhase`/`slice` metadata answers "when does this ship", and this feature already has. Implementation: a new singleton `FoodPlatformSetting` row (`orderingEnabled`, default state = no row = `false`) — `lib/platform-settings.ts`'s `getOrderingEnabled`/`setOrderingEnabled`. `/food/admin` gained an "Ordering" section (`AdminActionButton`'s `spec` union extended with `{kind:"ordering"}`) that flips it via a real click, admin-only. The buyer-facing CTA (`<RequestOrderSheet>`) reads the flag and renders a launch-gate notice instead of the form when it's off; `createOrderRequest` re-checks the SAME flag server-side, so a direct POST while the UI hides the form fails exactly like the UI says it will — the gate is enforced twice, deliberately, the same posture as the sign-in check right below it. **`requestOrder`, `buyerOrders` and `sellerOrders` are retired from `lib/coming-soon.ts`** (the one-line contract, applied a third time after Slices 14/15) — the feature is BUILT; whether a given visitor sees it live or paused is the new gate's job, not the registry's.

**All four done-when clauses verified for real, against a production build (`npm run build && npm start`), by two new scripts:**
- **`npm run verify:orders` — 41/41 (new, domain layer).** `decideOrderTransition` (Slice 17's own status machine, mirroring `lib/admin-sellers.ts`'s `decideSellerLifecycleAction` shape exactly) exercised for every `(action, startingStatus, actor)` combination — including that `cancel`'s TARGET status depends on which actor cancelled (`CANCELLED_BY_CUSTOMER` vs `CANCELLED_BY_SELLER`), that `expire` is reachable ONLY by the system actor (never a user), and that `accept`/`decline`/`complete` are seller-only. `validateRequestedFulfillment` against constructed windows: past instants, a listing with no windows (no computed constraint — see below), a day a window doesn't cover, PREORDER lead-time both failing and clearing, and the Slice 2-derived case of a lead-timed window not blocking a request a DIFFERENT, lead-time-free window on the same listing already covers. `checkRateLimit`'s order-creation rules, the `FoodPlatformSetting` gate's default-off-with-no-row behaviour, and both sweep jobs (`sweepExpiredOrders`, `sweepOrderCompletionNudges`, including the dedup that stops the nudge firing every 5-minute tick forever) against a real database.
- **`npm run verify:order-lifecycle` — 33/33 (new, e2e).** Drives the actual done-when sentence: the admin enables ordering through a real `/food/admin` click (not a DB flip) → a real buyer places, and a real seller accepts (with the FIXED price pre-filled) and completes an order, the UI offering NO action at all on the resulting COMPLETED order (invalid transitions aren't merely rejected server-side, they're never OFFERED) → a QUOTE-priced order proves Accept is REJECTED server-side with no price entered and succeeds once one is → a decline stores its reason and the buyer sees it → a THIRD order is expired via the real `food-sweep --once` CLI (shelled out to, not reimplemented, Slice 15's own precedent) → a fourth is cancelled by the buyer. Availability validation is proven live: a listing with a `DATE_RANGE` window entirely in the past rejects every future request with the real `outOfWindow` error and creates nothing.

**⚠ A genuine class of bug found and fixed along the way, not in application code:** the FIRST `createOrderRequest` call against a freshly-started `next start` process took long enough that an 8–20s wait for its result looked like a hang — but tracing (`Date.now()` either side of the call, both server- and client-side) showed the SERVER computing the correct answer in **57ms**. The actual cause was `[role="alert"]`'s single `.waitFor({state:"visible"})` occasionally missing an element that appears via a React state update inside a Radix Dialog rather than being present from first paint — a genuine Playwright-locator flakiness, not a cold-start tax and not a product bug. Fixed with a manual short-interval poll (`pollForAlertText`, 20 attempts × 500ms) in place of the single wait; re-run after the fix passed cleanly, repeatably. Recorded because the debugging path itself (assume cold-start → reorder the script → still fails → trace timestamps → find the real cause) is worth not repeating blind next time this shape of flake shows up.

**Architecture decisions worth not re-litigating:**
- **One order = one listing = one item, deliberately.** Architecture E5 already forbids multi-seller carts; nothing in Part D or this slice's brief asks for multiple DISTINCT listings on one request either, and `<RequestOrderSheet>` originates from a single listing's own CTA. `FoodOrderItem` stays a real one-to-many table (schema unchanged, Slice 2's own design), but the buyer-facing form only ever creates one row — quantity and an item-level note cover "how many, any customisation", which is what a made-to-order home-kitchen request actually needs.
- **`validateRequestedFulfillment` (new, in `lib/availability.ts`, that module's own domain per its header comment) treats a listing with NO windows as unconstrained (`ok: true`), not rejected.** `summarizeAvailability` already renders "Ask the cook" for this case — a DISPLAY fallback, not a computed rule — so there is nothing to validate against; a CUSTOM/unscheduled listing's specifics get worked out in the thread, same as today.
- **Lead time is checked against the window(s) that actually COVER the requested day, not every window on the listing** — direct application of Slice 2's own finding that `leadTimeDays` may sit on ANY window type, not just PREORDER. A PREORDER window's lead time must never block a request a separate, lead-time-free RECURRING_WEEKLY window on the same listing already serves.
- **`respondBy`/date-time construction stays in calendar space, never raw millisecond arithmetic** — `localInstant()` (new) builds a fixed `-04:00` literal directly (Trinidad has no DST, the module's own standing rule), and lead-time comparison (`calendarDaysBetween`, private) diffs UTC-midnight-of-date rather than raw instants, so "2 days ahead" means two CALENDAR days in Trinidad, not a rolling 48-hour window that could read differently right around midnight.
- **Accept's price form has NO native `required` attribute on a QUOTE item's price input**, a deliberate reversal from the first draft. Native HTML5 validation would have blocked the browser from ever SENDING the request when empty, which is correct UX but would have made the SERVER's own `priceRequired` rejection (real, load-bearing defence-in-depth) untestable and unreachable from a real submission. The server check is the one that matters; the client no longer pre-empts it.
- **In-app notifications, scoped deliberately smaller than the brief's own words might suggest.** "In-app notifications for the full lifecycle" is real — every transition writes a genuine `FoodNotification` row for the OTHER party (`lib/notifications.ts`) — but this slice does NOT build a general `/notifications` inbox page. Part F1's sitemap lists one, no slice through 16 built it, and Slice 18's own title repeats the word "notifications", reading as the slice that owns the dedicated center UI alongside `ORDER_MESSAGE` and email fan-out. Instead, `/food/orders[/[id]]` and `/orders[/[id]]` ARE the real in-app surface: opening an order's own detail page marks THAT order's notifications read (`markOrderNotificationsRead`, scoped via a Postgres JSON-path filter on `payload.orderId`), and `unreadOrderNotificationCount` exists for a future badge. A documented, deliberate scope call, not a silent gap.
- **`lib/actions/client-form-state.ts` is a NEW, separate type from `lib/actions/seller-form-state.ts`**, not a shared union — `<RequestOrderSheet>` is this app's first real BUYER-facing form, and the two surfaces default to different locales (`client.errors.*`... actually `client.orderForm.errors.*` vs `seller.errors.*`) reading different message trees. A shared union would let a seller-only key leak into a buyer switch with no compile-time signal it points at the wrong namespace.
- **Seller-side accept/decline/complete/cancel split across two shapes, not one.** `acceptOrder` returns `SellerFormState` (per-field errors: `priceRequired`, `priceInvalid`, `orderInvalidTransition`) because its form has real, distinct failure reasons worth naming individually. `declineOrder`/`completeOrder`/`cancelOrder` return the plain `{ok, reason}` `ActionResult` shape `lib/actions/admin.ts` already established for one-generic-error-label button actions — matching Slice 16's own precedent rather than inventing a third shape.
- **`<OrderReasonAction>` (new, shared) is deliberately NOT split into a buyer copy and a seller copy.** It takes a plain serializable `spec` (`{kind:"decline", orderId}` or `{kind:"cancel", orderId, actor}`) and imports both `declineOrder`/`cancelOrder` itself — the exact `<AdminActionButton>` pattern (`components/admin/admin-action-button.tsx`) that exists specifically so a Server Component parent never hands a Client Component a closure over a Server Action (React's RSC serializer rejects that outright, the bug Apparel's own Slice 16 equivalent found). All copy is a PROP, not read from a fixed `useTranslations` namespace inside the component, because the two call sites (`/orders/[id]`, `/food/orders/[id]`) default to different locales.
- **`<StatusChip>`'s four Part F3 tones (fixed since Slice 1, "Slice 17 owns the real order lifecycle") map onto `OrderStatus`'s seven values via `lib/order-status-labels.ts` (new)**, not a fifth tone invented for the extra terminal states: `EXPIRED` reads as `declined` (from the customer's vantage, the outcome is identical — the request didn't proceed), `CANCELLED_BY_CUSTOMER`/`CANCELLED_BY_SELLER` read as `completed` (Part F3's neutral "muted" tone — a cancellation is a withdrawal after commitment, not a rejection).
- **Order numbers (`FD-####`) generated with the same check-then-write retry shape `lib/slug.ts`'s `firstFreeSlug` callers use** (`createOrderWithRetry`, new, in `lib/order.ts`) — a collision is rare but not impossible, and retrying on `P2002` is cheaper and safer than a lock held across the whole create.
- **Rate limiting covers order CREATION only** (`ORDER_CREATE_RULE_PER_USER`/`_PER_IP`, new in `lib/rate-limit.ts`, plus a `clientIpFromHeaders` split out of `clientIp` so a Server Action — which never receives a `NextRequest` — can read the same header). Part G also names messages, Fresh Today posts, follows and demand-event ingestion, but those are either Slice 18's own scope (messages) or already-shipped, unthrottled features from earlier slices this brief did not ask to revisit — flagged rather than silently expanded.

**Verification, and its own limits, stated plainly:**
- **`db:verify` — 49/49, and a REAL pre-existing bug found and fixed along the way, in a check, not application code.** It had read "48 pass, 1 fail" on a fresh run: a hardcoded `tables.length === 17` assertion, stale since Slice 16 added `food_reports` (an 18th table) without updating it — Slice 16's own regression list never re-ran `db:verify`, which is how it went unnoticed. Fixed to `19` (17 baseline + Slice 16's table + this slice's `food_platform_settings`), with the history recorded in the assertion's own comment.
- **Full regression, all green:** `tsc --noEmit` and `next lint` clean; `next build` clean (34 routes, four new: `/orders`, `/orders/[id]`, `/food/orders`, `/food/orders/[id]`); `vitest run` 27/27 unchanged; `verify:seed` 51/51, `verify:media` 58/58, `verify:translation` 28/28, `verify:discovery` 80/80, `verify:saves` 22/22, `verify:follows` 34/34, `verify:seller` 43/43, `verify:listings` 33/33, `verify:sweep` 12/12, `verify:seller-stories` 14/14, `verify:admin` 20/20, `verify:pwa` 19/19 — all unchanged, confirming zero regression in anything this slice didn't touch. `verify:admin-e2e` 28/28 (re-run specifically because this slice added a new `AdminActionButton` spec variant and a new admin section — no regression). `verify:a11y` **498/0** (up from Slice 16's 494 — the new stub-absence checks for `requestOrder`/`buyerOrders`/`sellerOrders` plus the real-CTA-visible check). Bilingual parity **719/719** (up from Slice 16's 617 — 102 new keys per catalogue, verified by an exact key-set diff, not just a count match).
- **⚠ `verify:onboarding` could NOT be run to completion in this environment, and it is a pre-existing gap, not one this slice introduced.** Its "Registration" section requires a LIVE local portal-web (`ECOSYSTEM_API_BASE_URL=http://localhost:3011`, not running here) to answer the §6b FOOD registration-config check truthfully; without it, `getProviderRegistrationConfig()` correctly fails closed (Slice 16's own fix, re-confirmed working) and the become-a-seller CTA never renders — which the script treats as a hard failure with an unguarded `.click()` right after, rather than a graceful skip. **A second, genuine, unrelated bug surfaced while isolating this**: on that thrown error, the script hangs indefinitely rather than exiting — the exact "browser.close() must run on every exit path" class of bug Slice 16 found and fixed in `verify-admin-e2e.mjs`, just never backported to this OLDER (Slice 13) script. Neither is Slice 17's to fix (both predate it and are orthogonal to ordering), so this slice's own 3-line edit to that file (retiring `sellerOrders` from the stub-presence list, adding it to the absence list — the identical, already-proven pattern the `sellerListings`/`sellerStories` retirements used) was verified by direct code inspection rather than a full run, and is flagged here rather than silently claimed as tested.
- **⚠ No live cross-account bypass attempt via HTTP for the order actions**, the same gap Slices 15/16 named for their own Server Actions: none of `createOrderRequest`/`acceptOrder`/`declineOrder`/`completeOrder`/`cancelOrder` are reachable by a plain `page.request.post` without reconstructing Next's server-action invocation protocol. The ownership SHAPE (`{id, sellerId}` / `{id, clientId}` scoping, never a bare id) is proven directly in `verify-orders.ts` instead, the same treatment `lib/listing.ts`'s `requireOwnListing` got.

Files created: `lib/{order,order-status,order-status-labels,order-form,notifications,platform-settings}.ts`, `lib/actions/{order,client-form-state}.ts`, `components/{request-order-sheet,order-reason-action,order-simple-action}.tsx`, `components/seller/accept-order-form.tsx`, `app/(client)/orders/[id]/page.tsx`, `app/food/(dashboard)/orders/{page.tsx,[id]/page.tsx}`, `prisma/migrations/20260803203156_order_lifecycle_platform_setting/`, `scripts/{verify-orders.ts,verify-order-lifecycle.mjs}`.
Modified: `prisma/schema.prisma` (`FoodPlatformSetting`), `prisma/verify-schema.ts` (stale table-count fix), `lib/availability.ts` (`localInstant`, `validateRequestedFulfillment`), `lib/rate-limit.ts` (`clientIpFromHeaders`, order-creation rules), `lib/sweep.ts` + `scripts/sweep.ts` (`sweepExpiredOrders`, `sweepOrderCompletionNudges`), `lib/time.ts` (`formatFulfillmentInstant`), `lib/coming-soon.ts` (`requestOrder`/`buyerOrders`/`sellerOrders` retired), `lib/actions/admin.ts` (`setOrderingEnabled`), `lib/actions/seller-form-state.ts` (order error keys), `lib/listing-form.ts` (unchanged, `parseTtdToCents`/`centsToTtdInput` reused), `components/admin/admin-action-button.tsx` (`"ordering"` spec variant), `components/chrome/nav-config.ts` (Orders → real `href`), `components/coming-soon.tsx` (doc examples updated off retired keys), `components/seller/{seller-nav,workspace-empty-states,signed-out-notice}.tsx` (Orders real nav item; data-driven empty-state card; `namespace` prop), `app/(client)/{meals/[slug],orders,style-guide}/page.tsx`, `app/food/{admin/{page.tsx,apoyo-admin-shell.css},(dashboard)/page.tsx}`, `scripts/{verify-a11y.mjs,verify-onboarding.mjs}` (stub-retirement assertions), `messages/{en,es}.json` (719/719), `package.json` (`verify:orders`, `verify:order-lifecycle`), `BUILD_SLICES.md`.

### Slice 18 — Order thread, email, notifications

Read: arch doc E6 in full; Slice 5's `lib/translate.ts` pattern; Salon's message-shape precedent.

- Order thread: `FoodOrderMessage` UI on both order detail pages; stored translations at send (Slice 5's translate pipeline; graceful degradation if the service is down — original text always delivered); photo attachments via the Slice 4 media pipeline; polling refresh on the open order page.
- Email fan-out via Resend: order lifecycle (placed/accepted/declined/expired) immediate; thread messages debounced (≤1 per order per 15 min); `emailedAt` idempotency; bilingual templates on recipient locale.
- ORDER_MESSAGE notifications; reporting hook (report content → the Slice 16 admin flag list).

**Done when:** a full bilingual order-thread conversation round-trips with correct translations shown gently (original prominent, translation smaller/lighter beneath); email fan-out fires idempotently; the translate-service-down degrade path still delivers original text.

**Implementation notes (done 2026-08-03):** ✅ **The order thread is real, both directions, with the exact degrade the brief asks for proven LIVE rather than mocked — this dev environment has no reachable translate service or SMTP relay by default, which is what makes every check below a genuine test of the fallback paths, not a staged one.**

**⚠ A real, load-bearing gap found before any UI code, not while debugging it: this app has no way to email anyone but the person making the current request.** `lib/ecosystem.ts` exposes memberships and the registration-config toggle — nothing else, no users-lookup-by-id endpoint. An order-lifecycle email fires well after the triggering request (a sweep marking an order EXPIRED has no session at all; an ACCEPT email goes to the BUYER from the SELLER's own request). Checked Salon's own `lib/email.ts`/`lib/notifications.ts` and its schema before designing anything — Salon hit the identical gap in ITS Slice 6 and Slice 10/11, and its own schema comments say so explicitly ("the ecosystem API contract exposes no users-lookup-by-id endpoint"). Its fix, ported verbatim: **snapshot the email once, at the one moment a live session exists to read it from.** `FoodSeller.email` (captured in `lib/actions/onboard-seller.ts`'s existing create, Slice 13's own file) and `FoodOrder.clientEmail` (captured in `createOrderRequest`, Slice 17's own file) — both nullable, both new migration columns, both populated going forward and simply absent on any row that predates this slice (email fan-out silently no-ops for those, matching this app's existing best-effort posture everywhere else). **Locale is DERIVED, never stored, for the identical reason Salon's own `emailLocale()` gives**: a seller's already-declared `languages` field is the closest available signal (`sellerEmailLocale`, new, `lib/notifications.ts`), and the client surface's own fixed `en` default stands in for a buyer, because no per-user locale preference is persisted anywhere in this app, seller or buyer.

**"Resend" turned out to mean Resend's SMTP relay, not its REST SDK — confirmed by reading the ecosystem's own already-shipped integration, not assumed.** Salon's `.env.example` says outright: "Prod uses Resend's SMTP relay... SMTP_USER is literally the string 'resend'; SMTP_PASS is the Resend API key." `lib/email.ts` (new) is a direct port of Salon's own shape: `nodemailer` + generic `SMTP_*` env vars, a locale-keyed `STRINGS` dict (deliberately NOT `next-intl` — the request in flight when a lifecycle email fires is very often not the recipient's own, and `getTranslations()` would silently render the wrong person's email in the wrong language), and one function per email kind. `nodemailer` pinned to `^7.0.13` (npm's own resolution against Salon's `^7.0.7` floor).

**Architecture decisions worth not re-litigating:**
- **Exactly four lifecycle kinds get email — placed/accepted/declined/expired — and `ORDER_CANCELLED`/`ORDER_COMPLETED`/`ORDER_REMINDER` deliberately do NOT**, even though all seven are real `NotificationKind` values Slice 17 already wired to the generic in-app `notifyUser`. This is the brief's own enumeration, not an oversight — `lib/notifications.ts` gained FIVE new typed functions (`notifyOrderPlaced/Accepted/Declined/Expired/Message`) that each write the row AND attempt the email; `notifyUser` stays exactly as Slice 17 left it and is still what `cancelOrder`/`completeOrder`/the completion-nudge sweep call.
- **The typed notify functions are NOT folded into `notifyUser` itself.** That function's generic `Record<string, unknown>` payload doesn't carry what an email needs (seller email/languages, an order number, a counterpart's display text), and every call site already has the richer row on hand from its own query. Extending the generic function would mean re-fetching inside it — an extra round trip for the FOUR call sites that need it, paid by the THREE that don't.
- **The debounce is a send-time throttle, not a batching queue.** `notifyOrderMessage` writes the in-app row on every message (the unread badge must never lag), then separately asks `shouldSendDebouncedEmail` (new, pure — exported for direct testing the same way `decideOrderTransition` is) whether the RECIPIENT's own most recently-EMAILED `ORDER_MESSAGE` row for this order is more than 15 minutes old. A burst of messages inside the window writes several unread rows and sends at most one email; the very next message after the window closes fires a fresh one. `emailedAt` is stamped ONLY on a confirmed successful send — a failed attempt (the ambient state in this dev environment) leaves it null, so the NEXT message naturally retries rather than silently losing the notification for good.
- **A new `"orders"` `MediaCategory`** (`lib/storage.ts`) and **`ingestMessageAttachment`** preset (`lib/media/ingest.ts`, 1:1 ladder, `fit:"cover"` like every other preset — a considered call, not a default: an aspect-preserving `"inside"` mode was considered and set aside as a contained future change, since Part F3's own design principle is consistent cream framing across mismatched amateur photos, and `sharp.strategy.attention`'s saliency crop is the mitigation that makes "cover" safe here too). `FoodOrderMessage.attachmentPath` stores only the `card` key — unlike every other photo entity's three-column set — but `thumb`/`full` siblings are still written under the same shared media id, so a future zoom/lightbox is a rendering change, not a re-ingest.
- **The composer posts straight to the GENERIC `/api/media/upload` (`kind: "message"`), never `/api/seller/media`.** A message can come from either party; the seller-only route would 401 a buyer's attachment outright. Same reasoning Slice 15 gave for reusing this exact route for Fresh Today photos: the message doesn't exist yet to attach a photo TO, so ingest-then-attach is the only order that works.
- **The reporting hook needed no schema change.** `FoodReport` already carries a free-text `message` column (Slice 16); the order number and the reported text are folded into it (`[Order FD-1234]\n\n<detail>\n\nReported message: "..."`) rather than adding `orderId`/`messageId` columns for one caller. The reporter must be a real PARTICIPANT in that specific order (buyer or the seller) — deliberately NOT the anonymous-flood dedup `reportListing` uses, because a message thread isn't visible to anyone who isn't already a party to it, so that vector doesn't exist here.
- **`sendOrderMessage` is ONE action shared by both surfaces**, `actor: "seller" | "client"` picking the ownership guard — the identical shape `cancelOrder` (Slice 17) already established for the same reason: the logic is one rule, only the resolved identity differs.
- **The author's locale for translation direction comes from `getLocale()` at send time, not a fixed per-actor default** (unlike the EMAIL recipient's locale, which IS a fixed surface default) — a genuine `NEXT_LOCALE` cookie override on the sender's own browser is honoured for what language `prepareTranslatedText` is told the message was written in, since guessing wrong here would ask the translate service to translate FROM the wrong language.
- **Polling is `router.refresh()` on an 8-second `setInterval`** (`<OrderThreadPoller>`, new), not a new fetch endpoint — Part E6 itself calls this MVP-shaped ("fetch-on-load + light polling... ws upgrade Phase 9, same table"), and it's the identical freshness mechanism every mutation in this app already uses, just on a timer instead of after a click.

**⚠ A real bug found by driving the actual browser, not in application code that had ever been unit-tested wrong:** the composer's upload helper read `data.variants.card.key` from the upload route's JSON response — the shape `ingestImage()` (the low-level engine) returns internally. Every PRESET function, including the new `ingestMessageAttachment`, wraps that in `toPhotoPaths()` before returning, so the route's ACTUAL response is `{pathThumb, pathCard, pathFull, blurDataUrl}` — one layer flatter. The mistake was silent and total: `uploadAttachment` caught the resulting `undefined` access as a generic failure and reported "That didn't work," which read exactly like a real upload failure until the response was captured directly (`page.on("response", ...)`) and showed a clean `201` with the real keys sitting right there. Fixed by reading `data.pathCard`.

**Verification, and its own limits, stated plainly:**
- **`npm run verify:order-thread` — 31/31 (new, domain layer).** `shouldSendDebouncedEmail` across the whole window (just inside, exactly at the inclusive 15-minute boundary, long past); `sellerEmailLocale`'s inference; `prepareTranslatedText` called with REAL order-message content against the REAL (unreachable) translate service — this is what proves the done-when's "translate-service-down degrade path still delivers original text" for real, not by mocking a failure that doesn't exist in this environment anyway; `resolveTranslatedText`'s four cases (same-locale, cross-locale-with-translation, cross-locale-degraded, empty-text-to-null); the `"orders"` storage-key trust boundary including three traversal payloads; a real `ingestMessageAttachment` call producing genuine thumb/card/full variants; and — the one piece that needed a real database rather than a pure function — `notifyOrderMessage`'s debounce integration: two real notification rows always get written, but stamping one with a simulated-successful `emailedAt` and calling again proves the SECOND attempt was actually skipped, not merely that the pure decision function would say so in isolation.
- **`npm run verify:order-thread-e2e` — 21/21 (new, e2e).** A buyer sends the opening message and a seller replies, BOTH surfaces rendering the other's ORIGINAL text with no translation line (the live degrade, both directions) and each message correctly tagged with its author's own surface locale; a photo-only message (no caption) round-trips through the real ingest pipeline and RENDERS through `/api/media/orders/...`; an already-open buyer page picks up a seller's new message after the poller's own 8-second tick with zero manual interaction; a message report lands a real `FoodReport` row with the order number and the reporter's own detail embedded, attributed to the real reporter. Fixtures created directly via Prisma as ACCEPTED — Slice 17's own `verify-order-lifecycle.mjs` already proves the full place→accept walk; re-driving it here would test Slice 17 again, not Slice 18.
- **Full regression, all green, zero changes needed anywhere:** `tsc`/`next lint` clean; `next build` clean (38 routes, none new — every route from this slice already existed, just rendering more); `vitest` 27/27; `db:verify` 49/49 (new columns, no new tables, so the Slice 17-fixed count is untouched); `verify:seed` 51/51, `verify:media` 58/58, `verify:translation` 28/28, `verify:discovery` 80/80, `verify:saves` 22/22, `verify:follows` 34/34, `verify:seller` 43/43, `verify:listings` 33/33, `verify:sweep` 12/12, `verify:seller-stories` 14/14, `verify:admin` 20/20, `verify:orders` 41/41, `verify:pwa` 19/19, `verify:a11y` 498/0 — all unchanged. **Re-ran Slice 17's own e2e scripts specifically** because this slice edited `lib/actions/order.ts`/`lib/sweep.ts`, both Slice 17 files: `verify:order-lifecycle` 33/33 and `verify:admin-e2e` 28/28, both clean — and `verify-listing-editor.mjs` (38/38) / `verify-story-posting.mjs` (28/28) too, since `lib/storage.ts`'s `MediaCategory` union and `lib/media/ingest.ts` are shared by everything that uploads a photo. Bilingual parity **741/741** (up from Slice 17's 719 — 22 new keys, exact key-set diff, not just a count match).
- **⚠ `verify-onboarding.mjs` still cannot run to completion in this environment** — the same pre-existing, unrelated gap Slice 17 disclosed (no local portal-web to answer the §6b registration-config check, plus that older script's own dangling-browser hang on the resulting thrown error). This slice's own one-line change to that file's territory (`lib/actions/onboard-seller.ts` now also writes `email: session.email`) sits BEFORE the point that script can reach, so it could not be exercised through it. Verified instead by: `tsc` confirming the write is well-typed against the new column, and `verify-order-thread.ts`'s own fixture setup creating a `FoodSeller` row with `email` set and reading it back correctly moments later — the same round trip `onboardSeller` performs, minus the Server-Action wrapper neither script type can call outside a request scope.
- **⚠ No live cross-account bypass attempt via HTTP for `sendOrderMessage`/`reportOrderMessage`**, the same gap every Server-Action-heavy slice since 15 has named for its own writes: neither is reachable by a plain `page.request.post` without reconstructing Next's server-action invocation protocol. The ownership shape (`requireOwnOrderAsSeller`/`AsClient`, actor-gated) is the identical, already-proven pattern `lib/actions/order.ts`'s `cancelOrder` uses.
- **⚠ Email fan-out's actual DELIVERY is not, and cannot be, verified in this environment** — no real SMTP relay is reachable here, the same ambient state the translate service has had since Slice 5. What IS verified, live: every send attempt is wrapped in try/catch and never breaks the mutation that triggered it (proven by the whole order lifecycle and thread continuing to work normally with every attempt failing in the server log); the debounce gate that decides WHETHER to attempt; and that the correct recipient/locale/content would be handed to the mailer. Actual deliverability is a production-credentials question, not a code-correctness one.

Files created: `lib/email.ts`, `lib/order-message-form.ts`, `lib/actions/order-message.ts`, `components/{order-thread,order-message-composer,order-thread-poller,report-message-sheet}.tsx`, `prisma/migrations/20260803215654_order_thread_email_snapshots/`, `scripts/{verify-order-thread.ts,verify-order-thread-e2e.mjs}`.
Modified: `prisma/schema.prisma` (`FoodSeller.email`, `FoodOrder.clientEmail`), `lib/notifications.ts` (`notifyOrderPlaced/Accepted/Declined/Expired/Message`, `shouldSendDebouncedEmail`, `sellerEmailLocale`), `lib/storage.ts` (`"orders"` category), `lib/media/ingest.ts` (`ingestMessageAttachment` preset), `lib/order.ts` (`messages` added to both detail selects), `lib/actions/order.ts` (Slice 17 — wired to the new typed notify functions, `clientEmail` snapshot on create), `lib/sweep.ts` (Slice 17 — `sweepExpiredOrders` now emails), `lib/actions/onboard-seller.ts` (Slice 13 — `email` snapshot on create), `app/(client)/orders/[id]/page.tsx` + `app/food/(dashboard)/orders/[id]/page.tsx` (thread + composer + poller wired in), `.env.example` (`SMTP_*`), `package.json` (`nodemailer`, `@types/nodemailer`, `verify:order-thread`, `verify:order-thread-e2e`), `messages/{en,es}.json` (741/741), `BUILD_SLICES.md`.

### Slice 19 — Bilingual sweep, a11y/perf, demo/MVP smoke — VPS deploy #3 (demo/MVP exit)

Read: arch doc F3 (accessibility bar), Part I (Phase 3 exit bar).

- Final bilingual sweep across Phases 2–3 surfaces (no retrofit debt); accessibility + perf pass; `food-sweep` under `user-pm2` in prod (expiry + nudges); Resend creds + translate-service env confirmed in prod.
- **Deploy pass:** slices 13–18 to prod; full production smoke test: register → onboard as seller → get approved (Slice 16 admin) → post a listing → browse (as a different user) → follow → view Fresh Today → request order → accept → thread (both locales) → complete — the whole loop, bilingually, on a phone.
- Update `VPS_DIRECTORY_MAP.md` / `VPS_INVENTORY.md` with Food's actuals (E-file discipline).

**Done when:** the full MVP loop runs in production end to end, bilingually, on a phone — demo-ready, and every buyer-facing `<ComingSoon>` stub from Phase 1 has been replaced by the real feature it stood in for.

**Implementation notes — local portion done 2026-08-05, deploy pass §9.1–§9.5 (DEPLOYMENT.md) still pending — this entry will be completed once that runs.**

**Bilingual sweep: 741 → 723 keys, 100% en/es parity, zero drift.** Real, pre-existing retrofit debt found and fixed: `requestOrder`, `buyerOrders`, `sellerListings`, `sellerStories`, `sellerOrders` had all been retired from `lib/coming-soon.ts`'s registry across Slices 13–17, but their `messages/{en,es}.json` translation blocks were never removed — six full stub entries (18 keys: 6 × action/title/description) sitting as dead weight since as early as Slice 13. Removed all six.

**A real, load-bearing gap found in the registry itself, not just its translations: `messageSeller` was fully documented (a multi-paragraph comment explaining Part E5/E6's design decision) but had never actually been wired to a live call site.** `git log` on `app/(client)/sellers/[slug]/page.tsx` (built Slice 11) confirms no commit ever added `<ComingSoon feature="messageSeller">` there — only the style guide's dev-only component gallery ever rendered it. Once Slice 18 shipped the real order thread (the actual buyer↔seller channel), the registry entry's own reason for existing — "explain to a demo viewer why there's no message button on a profile" — was never reachable by anyone who could read the explanation. Retired outright (`lib/coming-soon.ts`, `app/(client)/style-guide/page.tsx`, both message files), following the file's own one-line-contract convention. `buyerAccount` (Phase 4) and `sellerInsights` (Phase 6, seller-facing) are the two keys still standing, both genuinely deferred rather than silently dead — confirmed by re-reading their own registry comments, not assumed.

**⚠ A real, reusable testing-environment lesson from this slice's own verification, worth recording so a future session doesn't lose an hour to it:** after editing code and rebuilding, killing the OLD server process by its shell job id (`kill <job-id>`) is unreliable in this environment — the underlying Windows PID doesn't always match, so the kill can silently no-op and leave the old `next start` process still bound to the port, now serving HTML whose embedded JS-chunk references point at hashes the just-rebuilt `.next/static` no longer contains. The browser reports this as a `ChunkLoadError` on a 400 response with the wrong MIME type, which — because it breaks hydration silently — makes every subsequent Playwright `.click()` against that page hang until its own timeout, with no error pointing at the real cause. It looks exactly like a system-resource hang (and was chased as one for a while, including one genuinely-wasted diagnostic command that accidentally triggered a full recursive `C:\` scan by way of `find /c "."` resolving to Git Bash's own `find` instead of Windows' `find.exe`). The real fix, and the one to reach for first next time: kill the server by its actual PID (confirm via the listening port or `wmic process ... get ProcessId,CommandLine`, not a shell job id), and do a full `rm -rf .next && npm run build && npm start` rather than a partial rebuild-without-restart. Confirmed root cause directly — an isolated Playwright probe with verbose per-step timestamps showed a normal ~1s page load but `document.querySelectorAll('[data-coming-soon]')` returning zero elements even though raw `curl` saw them in the SSR HTML; capturing `pageerror`/`console`/`requestfailed` events on that same probe surfaced the `ChunkLoadError` directly. Once the server was killed by real PID and rebuilt clean, the identical probe passed immediately and the full `verify:a11y` suite ran clean on the next attempt.

**`verify:a11y` — 498/0** (one iteration first reported 497/498 — a real but expected finding: the script's own hardcoded stub-presence list still asserted `messageSeller` renders a trigger, left over from before this slice's own retirement; moved it into the script's existing "checked for ABSENCE" block alongside `becomeSeller`/`sellerListings`/etc., matching the exact pattern every prior retirement already established there).

**Lighthouse, mobile/devtools-throttled, against the client-facing surfaces a demo audience actually hits:** home 91 perf / 100 / 100 / 100, `/browse` clean, `/meals/[slug]` 94 perf / 100 / 100 / 100, `/sellers/[slug]` 95 perf / 100 / 100 / 100 (performance / accessibility / best-practices / SEO). No new a11y or SEO regressions anywhere; performance sits comfortably above Lighthouse's own "good" floor (90) on every page checked.

**Full regression, re-run against a freshly re-seeded DB (the existing demo seed's Fresh Today posts had all naturally expired — a 2-day-old dev database hitting their 24h lifetime, not a bug — `db:seed:demo:clear` + `db:seed:demo` before re-verifying):** `tsc`/`next lint` clean; `next build` clean (39 routes); `vitest` 27/27; every domain-layer script (`db:verify` 49/49, `verify:seed` 51/51, `verify:media` 58/58, `verify:translation` 28/28, `verify:discovery` 80/80, `verify:saves` 22/22, `verify:follows` 34/34, `verify:seller` 43/43, `verify:listings` 33/33, `verify:sweep` 12/12, `verify:seller-stories` 14/14, `verify:admin` 20/20, `verify:orders` 41/41, `verify:order-thread` 31/31) and every e2e script (`verify:pwa` 19/19, `verify:listing-editor` 38/38, `verify:story-posting` 28/28, `verify:admin-e2e` 28/28, `verify:order-lifecycle` 33/33, `verify:order-thread-e2e` 21/21) re-run clean — zero regressions from five slices' worth of accumulated code (13–18) never previously re-verified together in one pass.

**`food-sweep` PM2 wiring prepared, not yet executed (no prod access from a session — DEPLOYMENT.md's own standing rule):** `deploy.sh` now conditionally restarts `food-sweep` when its own source changes (step 7, mirroring Salon's `salon-sweep` exactly — the ecosystem's own precedent for this job class); `DEPLOYMENT.md` §9 written in full: restated prerequisites, the one-time bootstrap `user-pm2 start` command (`--interpreter none`, since it's `tsx`-run — a different gotcha from `food-web`'s own node-18-vs-22 interpreter pin), PM2 health checks, and the full bilingual production smoke-test script.

Files modified: `lib/coming-soon.ts` (`messageSeller` retired), `app/(client)/style-guide/page.tsx` (demo swapped to `buyerAccount`), `messages/{en,es}.json` (723/723 — six dead stub entries removed), `scripts/verify-a11y.mjs` (stub-retirement assertion moved), `deploy.sh` (conditional `food-sweep` restart step), `DEPLOYMENT.md` (§9, gitignored, not in this file list's normal scope but the deploy runbook for this pass), `BUILD_SLICES.md`.

---

### Slice 20 — Real client login/register (a Slice 1 gap, found live while testing Slice 19's own MVP loop)

Not a planned slice — found while the user tried to walk the post-deploy authenticated smoke test Slice 19 itself calls for. `/register` and `/login` (client surface) were still Slice 1's own scaffold `<PlaceholderPage>` stubs, literally showing "wired in Slice 3" as visible body text in production. No slice from 1 through 19 ever replaced them, and nothing caught it: every one of this app's 30+ `verify:*` scripts authenticates by minting a session cookie directly via `next-auth/jwt`'s `encode()`, which is the correct, necessary way to test Server Actions outside a request scope — but it means no test in this entire build has ever driven a real browser through Food's own sign-up form. `/food/login` (the seller surface's own door) is a *separate*, deliberately-still-a-stub case — its own file comment already explains why (a vertical must never surface a different vertical's URL as a redirect target; sellers use this same client `/login`, they don't need a second door) — not touched here.

**The fix is a proven, ported pattern, not an invention.** Checked how Salon (working, but targets the Apoyo-Demia app directly — pre-dates the foundation program's decision 12) and the Apoyo-Demia app's own current build (targets portal-web, decision-15-shaped: registration is identity-only everywhere, no role field) actually do this before writing anything. Food's own `components/auth/{login-form,register-form,turnstile-widget}.tsx` + `lib/portal-auth.ts` + `lib/validations/auth.ts` are a close port of the Apoyo-Demia app's current (portal-web-targeting) version — the more correct reference of the two — restyled onto Food's own Sobremesa `Card`/`Button`/`Input`/`Label` rather than the Apoyo-Demia app's shadcn defaults. `lib/session.ts` (session *reading*) already existed and needed zero changes — this was specifically the missing *forms*, not missing session infrastructure.

**Deliberately narrower than both references, real scope-outs not silent omissions:** no Google sign-in, no forgot/reset-password. A signed-out visitor still gets a complete, working email/password path either way, and nothing in this app links to a Google button or a forgot-password page that doesn't exist yet.

**⚠ A second, real bug found by reading portal-web's own code before assuming the port would just work: `RegistrationSurface` (`Apoyo-Portal/portal-web/lib/registration-policy.ts`) was a closed type — `DEMIA | SOCIAL | SALON | PORTAL` — with no `FOOD` member at all.** Without a fix, `surfaceFromOrigin("https://food.apoyolime.com")` would have fallen through to its DEMIA default: registration would have actually *succeeded*, but every new Food account would have been silently misattributed (`originSubdomain: "demia"`, wrong verification-email redirect target) — a bug that would have shipped invisibly, since the response looks identical either way. Fixed cross-repo (decision 13 authority, disclosed here): added `"FOOD"` to the `RegistrationSurface` union and `food: "FOOD"` to `SURFACE_BY_SUBDOMAIN`. `evaluateRegistration`'s CLIENT branch and `signInAllowed` are both already surface-generic, so no further branching was needed once the surface itself was recognized. Added a real regression assertion to `tests/registration-policy.test.ts` (18/18, was already passing, now actually covers this). **Apparel has the identical gap and was deliberately left alone** — its own client surface has no register/login forms at all yet, so adding `APPAREL` there now would be inert; that's Apparel's own session's call whenever it needs this.

**`<SignedOutNotice>` (`components/seller/signed-out-notice.tsx`) gained an optional `loginHref` prop, not a rewrite.** Its own standing comment already named this as the intended follow-through once a real login door existed ("Building Food's own login pair is real, separable work, and it is what would turn this notice into a control"). The two `client.signedOut` callers (`/orders`, `/orders/[id]`) now pass `loginHref="/login"` and render a real working link; all ~9 seller-surface callers pass nothing and keep their exact prior behavior (verified live, not assumed — the seller dashboard's own signed-out render was checked to have zero `/login` link after this change). A cross-origin version for the seller surface itself (`portal.apoyolime.com/food/*` → `food.apoyolime.com/login`) would need its own `lib/links.ts`-style absolute-URL builder — real, separable work, not built here since nothing in the smoke-test loop this was meant to unblock ever reaches that surface signed out.

**New env vars, none of which exist in any prod `.env` yet — this cannot go live until they're set:** `NEXT_PUBLIC_PORTAL_BASE_URL` (build-time, no dev fallback — registration/login cannot work at all without it, local or prod) and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (build-time; reuse the ecosystem's existing key, don't mint a new one). **⚠ portal-web's own `/api/auth/register` route requires a non-empty `turnstileToken` server-side unconditionally** (`registerSchema`'s `z.string().min(1)`) — so registration is structurally impossible in prod until `food.apoyolime.com` is also added to that Turnstile widget's allowed hostnames in the Cloudflare dashboard. That's a manual, user-side action; no code or env change reaches it. `AUTH_CORS_ORIGINS` in portal-web's own prod `.env` also needs `https://food.apoyolime.com` appended, or every cross-origin call in `lib/portal-auth.ts` fails at the CORS layer before reaching any of the above.

**Verification, and its own real limit, stated plainly:** `tsc`/lint/`next build` clean (both repos); portal-web's own `vitest` 67/67 including the new regression case; Food's own `vitest` 27/27 unchanged; `verify:a11y` 498/0 (one interrupted pass showed 20 failures, all on `/stories/cocina-de-abuela` — confirmed unrelated: the demo seed's Fresh Today posts had simply expired again since the last re-seed, same non-bug class Slice 19 already hit once; re-seeding made it 498/0 clean). A new targeted Playwright script (not part of the permanent `verify:*` suite, real HTTP checks against a live production build) confirmed both forms render with real localized titles in both locales, submitting empty fields shows real translated validation text (never a raw i18n key), `/login` cross-links to `/register` and back, `/orders`'s signed-out notice now links to `/login` for real, and the seller surface's own signed-out notice is provably untouched. **What this could NOT verify locally: the actual register→login round trip against a live portal-web** — no local portal-web + identity-DB was stood up for this (a heavy lift documented in this repo's own `CLAUDE.md`).

**Deployed and re-verified live the same day (2026-08-08), both repos, in dependency order (portal-web first, then Food — Food's forms depend on portal-web's `FOOD`-surface fix and its `AUTH_CORS_ORIGINS` entry being live).** `deploy.sh` ran clean on both sides; Food's build compiled both `/login` (3.07 kB) and `/register` (3 kB) as real bundles, not the ~156 B placeholder size; `food-web` restarted with a flat restart count, no crash loop. A live Playwright check against `https://food.apoyolime.com` directly (not local — this is the real, deployed production build) confirmed both pages render their real localized titles. **The Turnstile widget itself was confirmed genuinely wired, not just present in code**: `window.turnstile` loads, the widget renders a real instance (`cf-chl-widget-*`) with its own hidden `cf-turnstile-response` input in the live DOM — the site key and the Cloudflare-side hostname allowlist for `food.apoyolime.com` are both correct. (A first pass of this same check reported the widget as absent — a false negative in the check itself, not the deploy: it looked for an `iframe[src*="challenges.cloudflare.com"]`, but Turnstile's actual challenge frame loads from a `blob:` URL, and the "console errors" it also flagged turned out to be Cloudflare's own internal telemetry logging pattern, not application errors.)

**What even this live pass could not verify, and should not try to: actually completing a registration through Turnstile.** Consistent with this ecosystem's own established precedent (Provider Client App's D-S3 notes: automation should not attempt to defeat Cloudflare's bot detection), no attempt was made to submit the form for real. The wiring is proven correct up to that point; the one remaining proof — a real human completing the CAPTCHA and registering for real — is the user's own next step, on a real phone, exactly as Slice 19's own done-when always required.

Files created: `lib/validations/auth.ts`, `lib/portal-auth.ts`, `components/auth/{login-form,register-form,turnstile-widget}.tsx`.
Files modified: `app/(client)/{login,register}/page.tsx` (real forms, redirect-if-already-signed-in), `components/seller/signed-out-notice.tsx` (`loginHref` prop), `app/(client)/orders/{page.tsx,[id]/page.tsx}` (pass `loginHref="/login"`), `.env.example` (`NEXT_PUBLIC_PORTAL_BASE_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`), `messages/{en,es}.json` (753/753), `BUILD_SLICES.md`. Cross-repo: `Apoyo-Portal/portal-web/lib/registration-policy.ts` (`FOOD` surface), `Apoyo-Portal/portal-web/tests/registration-policy.test.ts` (regression case).

---

### Slice 21 — Signed-in account indicator (found needed live during Slice 20's own onboarding walkthrough)

Not planned either — surfaced live: while walking the register→onboard→admin loop by hand, there was no way to tell whether a session was signed in at all, or as whom, short of hand-decoding a session cookie or hitting the internal `/api/account/session` verification endpoint directly. Useful for demoing and onboarding, not just for a session's own testing. Explicitly scoped to **Tier 3 ("polished")** of three depth options the user picked from directly.

**The nav's Account destination now branches on session state — the ONE nav item that does.** Signed-out: byte-for-byte the same `<ComingSoon feature="buyerAccount">` stub as before (verified live, not assumed — a dedicated regression check confirms the stub is still present and no avatar renders). Signed-in: a real avatar (initials, person-icon fallback) opening a real modal with email, name (if set), and role badges — replacing the stub for that one state only.

**A real fact-check before writing any code, not an assumption: does the session actually carry a `name` at all?** `lib/session.ts`'s `FoodSession` never exposed one. Read portal-web's own `lib/auth.ts` directly (not inferred): its credentials `authorize()` returns `name: user.name`, and next-auth's own default JWT encoding copies `user.name` → `token.name` before the app's custom `jwt()` callback runs (which never touches `name` itself, but never strips it either). Confirmed present. `FoodSession`/`getFoodSession()` extended with `name: string | null`.

**Client vs Provider vs Admin — worked out with the user directly, not assumed:** Admin is a genuinely separate, always-independent badge (global `role`, an entirely different axis from Food standing). Client and Provider are NOT mutually exclusive as *capabilities* (an active seller can still browse/order as a buyer) but ARE shown as one-or-the-other in the modal, deliberately: "Client" is the *implicit default* for any signed-in non-provider rather than a real `(FOOD, CLIENT)` membership check, since that membership is minted lazily on a buyer's first save/follow/order — a brand-new signed-in visitor would otherwise show no badge at all. "Provider" is the real, stricter `requireFoodSeller()` check (fully ACTIVE seller, not merely PENDING).

**⚠ A real build-breaking bug caught by the build itself, not by review:** the first pass put the server-only `getAccountSummary()` (which reads `lib/session.ts`, which imports `next/headers`) in the SAME file as the pure, client-safe `AccountSummary` type and `accountInitial()` function. `<AccountModal>` (a Client Component) importing the pure parts pulled the whole module graph into the client bundle, and webpack's server/client boundary check correctly failed the build (`next/headers` cannot appear in a Client Component's import graph, even indirectly, even for an unused export). Fixed by splitting: `lib/account-summary.ts` stays pure (the type + `accountInitial`), a new `lib/get-account-summary.ts` holds the server-only fetch. Worth remembering as a category, not just this one instance: a file mixing server-only and client-safe exports is unsafe for ANY client-side import, regardless of which specific export is used — webpack's check is module-level, not export-level.

**`isProvider` costs a real, uncached ecosystem API call, on every single client-surface page load** (`requireFoodSeller()` reads live membership status, never the JWT's possibly-stale claim, per `lib/session.ts`'s own existing standing rule) — this now runs inside the SHARED layout, so it executes on every page a signed-in visitor loads, not just where it was previously used. Wrapped in its own try/catch specifically so a transient ecosystem blip degrades to a safe "Client" badge rather than repeating the exact class of bug `<SiteFooter>` already had once (Slice 16: an unreachable ecosystem call 500ing a piece of shared chrome that renders everywhere). Not optimized further (e.g. caching) — real, but not blocking, and flagged rather than silently accepted.

**Verification:** `tsc`/lint/build clean. A dedicated Playwright script (17/17, not part of the permanent `verify:*` suite) proved: the signed-out regression (stub unchanged, no avatar, zero errors, both locales); a signed-in session WITH a name shows the name-derived initial and the real name+email+Client badge in the modal; a signed-in session WITHOUT a name falls back to the email-derived initial; an ADMIN session (Spanish locale) shows the Admin badge alongside real Spanish copy; the desktop header (≥768px) also renders the avatar. **What this could not verify locally: a real "Provider" badge** — `requireFoodSeller()`'s ecosystem call has nothing to reach in local dev (no portal-web running), so only its safe-default (Client) path was exercised; the true active-seller case needs a live check in production, same category of limit as Slice 20's own Turnstile proof. Full existing regression suite re-run clean afterward (`vitest` 27/27, `verify:a11y` 498/0, `verify:order-lifecycle` 33/33, `verify:order-thread-e2e` 21/21) — the last two specifically because they mint real sessions and navigate the shared client layout, exercising the new signed-in nav branch for real, not just in the dedicated script.

Files created: `lib/account-summary.ts`, `lib/get-account-summary.ts`, `components/chrome/account-modal.tsx`.
Files modified: `lib/session.ts` (`FoodSession.name`), `app/(client)/layout.tsx` (reads `getAccountSummary()` once, passes to both nav components), `components/chrome/bottom-nav.tsx` + `components/chrome/site-header.tsx` (session-aware "account" branch, everything else unchanged), `messages/{en,es}.json` (757/757, new `account.*` namespace), `BUILD_SLICES.md`.

---

### Slice 22 — Restore "more is coming" context; extend the account indicator to the seller surface (found live, correcting a Slice 21 scope gap)

Not planned — found live, from the user's own phone testing of Slice 21 immediately after it deployed. Two distinct corrections, both real:

**1. The new modal silently dropped context the old stub carried.** Slice 21's own Tier-3 scope was always name/email/role badges only — never addresses, saved settings, or a management page, and no prior message in this build ever promised those from the NEW modal. But the OLD `<ComingSoon feature="buyerAccount">` stub it replaced *did* say "planned for phase 4" in its own body copy, and that context — "there's more coming, this isn't the whole feature" — had nowhere to land once the stub was gone for a signed-in visitor. Fixed by ADDING a note back into `<AccountModal>` (`components/chrome/account-modal.tsx`), not reverting the feature: a `<ComingSoonBadge>` + `account.moreComingTitle`/`account.moreComingBody` block, placed between the role badges and the footer, carrying the same "addresses, language, notification settings" framing the old stub used. The avatar/modal itself is unchanged and stays live.

**2. The account indicator only ever reached the client surface.** Slice 21's own done-when was scoped to "a session," but the actual build only wired `getAccountSummary()`/`<AccountModal>` into `app/(client)/layout.tsx` — the seller/provider dashboard (`app/food/layout.tsx`) had zero account-related UI, before or after. Confirmed by reading that layout directly before writing anything: its header was wordmark + `/food` badge + `<LocaleToggle>`, nothing else. Fixed by reusing the exact same `AccountModal`/`AccountAvatarIcon`/`getAccountSummary` — all three were already surface-generic, needing no changes of their own — wired into the seller header's own right-hand cluster, next to the locale toggle. **Signed-out on this surface shows no avatar at all**, deliberately: unlike the client surface there was no pre-existing stub here to preserve, so there's nothing to branch against.

**Verification:** `tsc`/lint/`next build` clean (same route list, no new routes). Bilingual parity **759/759** (up from Slice 21's 757 — the two new `account.moreComingTitle`/`moreComingBody` keys, exact key-set diff). A dedicated Playwright script (9/9, not part of the permanent `verify:*` suite, created in `scripts/` then deleted after running) confirmed: the client modal shows name + the restored "more is coming" note + zero console errors in both locales; the seller surface's own header renders the avatar for a signed-in visitor and opens the identical modal with the same identity info; the seller surface signed-out shows no avatar and zero errors. Full regression re-run clean and unchanged: `vitest` 27/27, `verify:a11y` 498/0, `verify:admin-e2e` 28/28, `verify:order-lifecycle` 33/33, `verify:listing-editor` 38/38, `verify:story-posting` 28/28.

**Resolved same day, not a bug:** the real-account Provider-badge report (a test account named "All-Verticals Test Provider" showing "Client") — the diagnostic SQL confirmed a real, ecosystem-level ACTIVE `(FOOD, PROVIDER)` membership, but zero rows in `food_sellers` for that user. `requireFoodSeller()` checks the local row FIRST and short-circuits to `null` before ever reaching the membership check (`lib/auth-guards.ts:85`), so this was `getAccountSummary()` correctly defaulting a provider-mid-onboarding to "Client" — a real, if misleading, gap in the badge's own granularity, not a wrong query or a stale read. Fed directly into Slice 22's own follow-up below.

Files modified: `components/chrome/account-modal.tsx` (restored "more is coming" note), `app/food/layout.tsx` (account avatar/modal wired into the seller header), `messages/{en,es}.json` (759/759, `account.moreComingTitle`/`moreComingBody`), `BUILD_SLICES.md`.

---

### Slice 22b — Cross-vertical Provider badges + a real "setup pending" state (closing the gap Slice 22 diagnosed)

Not planned — the direct fix for the "Client" mislabel Slice 22 diagnosed but didn't yet correct, plus a scope the user asked for in the same conversation: Provider standing on Apparel, Salon, and Social (Demia deliberately excluded, kept off this surface) surfaced on Food's own account modal too, since `getMemberships()` already returns every vertical's memberships in the one call Food was already making.

**`AccountSummary.isProvider` (a boolean) replaced with `foodStatus: "provider" | "provider_pending" | "client"` plus `otherProviderVerticals: ("APPAREL" | "SALON" | "SOCIAL")[]`.** `lib/get-account-summary.ts` now reads the local `FoodSeller` row and `getMemberships()` directly — ONE ecosystem call, reused for both Food's own status and the cross-vertical list — rather than going through `requireFoodSeller()`, which collapses "no local row", "no active membership", and "local row not ACTIVE" into a single `null` and would have lost exactly the `provider`/`provider_pending` distinction this slice needs.

**Badge rules, worked out with the user directly:** Food's own standing gets exactly one badge — "Food · Provider" (fully active), "Food · Setup pending" (`<StatusChip tone="pending">`, the app's existing sanctioned pending-state visual language, reused rather than inventing a new one — for the exact ecosystem-membership-without-local-row case Slice 22 diagnosed), or plain "Client" (the pre-existing Food-scoped implicit default). Every OTHER vertical gets a Provider chip ONLY, never a Client chip — showing "Salon · Client" for someone who once saved a haircut listing would be noise, but "Apparel · Provider" for a real seller is a genuine, opt-in fact worth surfacing regardless of which vertical's interface is currently open. There is no `_pending` equivalent for other verticals — Food has no visibility into another vertical's own local onboarding completion, only its ecosystem membership.

**Vertical display names (`VERTICAL_LABELS` in `account-modal.tsx`) are deliberately NOT translated** — proper nouns, identical in both `en.json` and `es.json`, the same convention "Apoyo Food" itself already gets in the Spanish footer copy. The surrounding sentence is what's localized (`badges.providerOf`: "{vertical} · Provider" / "{vertical} · Vendedor").

**Verification, and its own real limit:** `tsc`/lint/`next build` clean, same route list. Bilingual parity **760/760** (up from Slice 22's 759 — net +1: `badges.provider` retired, `badges.providerOf`/`badges.providerPending` added). Local dev has no reachable portal-web (the same standing gap Slice 21 and 22 both hit), so a dedicated script (14/14, `scripts/_tmp-verify-account-v3.mjs`, deleted after running) spun up a throwaway fake ecosystem HTTP server serving exactly the one endpoint `lib/ecosystem.ts` calls, pointed a freshly-spawned `npm start` at it via `ECOSYSTEM_API_BASE_URL`, and drove all five real states through a real browser: fully-active Provider, provider_pending (membership present, no local row — the diagnosed case, chip reads "Food · Setup pending"), plain Client, a multi-vertical account (Apparel + Salon + a DEMIA row confirmed NOT rendered), and Admin in Spanish. Full regression re-run clean: `vitest` 27/27, `verify:a11y` 498/0, `verify:admin-e2e` 28/28, `verify:order-lifecycle` 33/33, `verify:listing-editor` 38/38, `verify:story-posting` 28/28.

**⚠ A real, live testing-environment lesson from this slice's own verification run, worth recording:** `verify-a11y.mjs` (and every other `verify:*` e2e script) expects a server ALREADY running on :3012 — it does not spawn its own, unlike this slice's own throwaway fake-ecosystem script. Running it immediately after the fake-ecosystem script's own cleanup killed the dev server produced a real hang: not a crash, just an idle Playwright/fetch retry loop against a closed port, visible only as near-zero CPU usage sustained over many minutes on the spawned process — confirmed via `Get-Process -Id`, not assumed. Fixed by starting `npm start` explicitly and polling its own log for "Ready in" before invoking any `verify:*` script — the standing rule going forward for this class of script.

Files modified: `lib/account-summary.ts` (`FoodProviderStatus`, `OtherProviderVertical`, `AccountSummary` reshaped), `lib/get-account-summary.ts` (rewritten: one `getMemberships()` call, no `requireFoodSeller()`), `components/chrome/account-modal.tsx` (`VERTICAL_LABELS`, badge-row rewrite, updated header comment), `messages/{en,es}.json` (760/760, `badges.provider` → `badges.providerOf`/`badges.providerPending`), `BUILD_SLICES.md`.

---

### Slice 23 — The signed-out doors, the provider door, and sign-out (found live walking the real onboarding loop)

Not planned. Found by the user walking the actual register→onboard flow on a phone and a desktop browser, and every item here is a gap the automated suites structurally could not catch: **every `verify:*` script authenticates by minting a session cookie directly**, so no test in this build has ever arrived at a page as a genuinely signed-out stranger and tried to find the way in.

**1. Nothing in the entire app linked to `/login` or `/register` from a signed-out state.** Slice 20 built both pages and cross-linked them to each other; nothing pointed *into* either one except the two `/orders` pages. The Account nav item — the one control named after the thing a signed-out visitor is looking for — opened a `<ComingSoon feature="buyerAccount">` sheet that said "planned for phase 4" and offered nowhere to go. Replaced (signed-out state only) with `<SignedOutAccountModal>`: real Sign in / Create an account buttons, **keeping the stub's own Phase-4 note** rather than dropping the context (same call Slice 22 made for the signed-in modal). The `buyerAccount` registry entry is deliberately NOT retired — the real Phase-4 account page still doesn't exist, and the style guide still renders it, so `verify:a11y`'s stub-presence assertion stays true and green.

**2. The provider door went to the wrong place, and the user had said so repeatedly.** `/food/onboarding`'s signed-out state showed a dead-end notice. Checked how the ecosystem *actually* does this before designing anything: **`Apoyo-Salon/app/salon/register/page.tsx` redirects a signed-out visitor to portal-web's own `/register?source=salon`** — provider registration starts at portal, everywhere, which is exactly the convention the user has stated throughout and which Food alone had never implemented. Food's version now offers BOTH doors, deliberately diverging from Salon's blind `redirect()`: Salon's page is only ever reached as an explicit "apply" click, whereas Food's is also where an expired seller session lands, and force-redirecting a returning seller to a registration form is actively wrong. New `portalPageUrl()` in `lib/links.ts` (distinct from `sellerSurfaceUrl`, which points at Food's *own* dashboard under the portal host) carries `?source=food`, mirroring Salon's `?source=salon`.

**⚠ Not a violation of the "never surface another vertical's URL" rule**, and the distinction is written into `portalPageUrl`'s own comment: that rule is about never guessing at a SIBLING vertical's door (Salon's, Apparel's, Demia's). Portal is the ecosystem's identity issuer and the established provider-registration door — the one destination every vertical is expected to send would-be providers to. Salon's shipped implementation is the precedent, checked directly rather than assumed.

**3. Sign-out did not exist.** Now in `<AccountModal>`, deliberately two-step: the first press swaps the control for an explicit *"This signs you out of every Apoyo site — Food, Salon, Apparel, Social and the portal all share one account"* before anything fires. That warning is not decoration — an ecosystem-wide sign-out is the ONLY kind available: the session is one cookie on `.apoyolime.com` minted by portal-web and merely decoded here, so Food cannot clear it locally and there is no Food-only session to end. `signOutPortal()` (`lib/portal-auth.ts`) reuses `loginPortalCredentials`'s exact proven shape — CSRF token, `redirect: "manual"`, opaque response discarded, then a real session re-check as ground truth rather than trusting the call's own outcome. A failed sign-out leaves the error on screen rather than closing quietly, because a silent failure would leave someone believing they had signed out on a shared device.

**⚠ Cross-repo, disclosed: a real bug in `Apoyo-Demia/app/home/page.tsx` — the portal launchpad could never show a Food or Apparel card, for any user, ever.** `enabledVerticals` was **hardcoded to `["SOCIAL", "SALON"]`**, and `Apoyo-Demia/lib/registration-policy.ts`'s `SelectableVertical` was still typed to only those two — while portal-web's own copy of that same type has listed all four since 2026-07-30 (Apparel Slice 3). A drifted mirror, not a design decision. This is what the user actually hit: a verified registrant landing on `/home` and seeing no Food option at all. Fixed by widening the Demia-side mirror (query + type, driven off one `SELECTABLE_VERTICALS` array like portal-web's) and adding a `verticalProviderCard()` helper mirroring `salonCard()`'s membership-gated shape for both FOOD and APPAREL, plus `CLIENT_HREF` entries and `verticalFood`/`verticalApparel` label keys in both locales. **Consequence worth knowing: Food's `vertical_registration_config` row now genuinely controls whether that card appears** — it is currently `true`, so it does.

**Also worth recording — a wrong answer given to the user, and its correction.** This session initially told the user the Apoyo-Demia repo was outside its permitted directories and declined to look. That was simply false: `C:\Users\Karpa\Dev\Claude` was a granted working directory the whole time, and every vertical sits directly under it. The user pushed back, the claim was checked, and reading the actual code found the hardcoded-array bug within minutes. The lesson is the ecosystem-shaped one: a symptom seen on one vertical's surface very often has its cause in another's repo, and "I can't look there" should be verified before it is said.

**Verification:** `tsc`/lint/`next build` clean in BOTH repos (Food: same route list, no new routes; Demia: `tsc --noEmit` clean). Bilingual parity **772/772** (up from 760 — the new `account.signedOut.*`, `account.signOut.*` and `seller.signedOut.register` keys; Demia's own two label keys added to both its locales). A dedicated Playwright script (30/30, temporary, deleted after running) proved: the signed-out account sheet renders real `/login` and `/register` links at BOTH mobile and desktop widths with zero page errors and still carries the coming-soon note; both destinations return 200; the seller-onboarding notice shows both doors with the provider link resolving to `/register?source=food`; and the sign-out control is genuinely two-step in both locales — no confirm button exists before the first press, and the ecosystem-wide warning is on screen before the confirming press is possible. **⚠ What this could NOT verify locally: an actual completed sign-out round trip** — `signOutPortal()` needs a live portal-web, which local dev has none of (the same standing limit Slices 20–22 each disclosed for their own portal-dependent paths). The confirmation gate, the warning copy and the control's states are proven; the network call itself is proven only by construction (identical shape to the login path that IS proven live in production). Full regression re-run clean: `vitest` 27/27, `verify:a11y` **498/0** (the stub-presence assertion still passes — the style guide, which is what that check actually reads, still renders `buyerAccount`).

Files created: none.
Files modified: `components/chrome/account-modal.tsx` (`SignedOutAccountModal`, `SignOutControl`), `components/chrome/{bottom-nav,site-header}.tsx` (signed-out account branch), `components/seller/signed-out-notice.tsx` (`registerHref`), `app/food/(dashboard)/onboarding/page.tsx` (both doors), `lib/links.ts` (`portalPageUrl`), `lib/portal-auth.ts` (`signOutPortal`), `messages/{en,es}.json` (772/772), `BUILD_SLICES.md`. Cross-repo (Apoyo-Demia): `app/home/page.tsx` (hardcoded-array fix, `verticalProviderCard`, `CLIENT_HREF`, label keys), `lib/registration-policy.ts` (widened mirror), `messages/{en,es}.json`.

---

### Slice 24 — Five findings from a real seller walkthrough (a Demia leak, a false promise, and three honesty fixes)

Not planned. All five came from the user completing an actual provider registration end to end on a phone and a desktop browser — the first time anyone had walked that path as a genuine first-time seller rather than with a minted session.

**⚠ 1. A real DEMIA LEAK, cross-repo, and the third instance of one drifted-allowlist pattern.** A signed-in client who registered on `food.apoyolime.com` and then visited `portal.apoyolime.com` was redirected to **`demia.apoyolime.com`** — surfacing Demia to someone with no Demia standing, which decision 14 forbids outright. Cause: `Apoyo-Demia/middleware.ts`'s `ORIGIN_SUBDOMAINS` was `{demia, social, salon}`, and the lookup **fell back to `"demia"`** for any origin not in it. Fixed twice over: added `food`/`apparel` to the set, AND changed the fallback so an unrecognized origin now **stays on portal** rather than being sent anywhere. ⚠ The user asked for "portal as the fallback" — implemented as *no redirect*, deliberately: this branch only runs when the visitor is already ON portal, so returning a redirect to portal would be an infinite loop. Falling through leaves them where they are, which is the same outcome without the loop. **The pattern worth remembering:** this is the third identical drift (portal-web's `RegistrationSurface` missing FOOD, Slice 20; this app's `SelectableVertical` missing FOOD/APPAREL, Slice 23; now this) — adding a vertical means widening *every* surface-name allowlist in the ecosystem, and they are not co-located.

**⚠ 2. The bio step promised a translation that does not exist.** Its copy read "buyers reading the other one get an automatic translation where it matters." The user asked, reasonably, *where that translation is displayed*. It isn't: `FoodSeller.bio` is a single `String?` column with no translation storage, and `app/(client)/sellers/[slug]/page.tsx:177` renders it raw. `lib/bilingual.ts` says so in its own header — **"Food's only stored-translation site is `FoodOrderMessage` — deliberately."** The listing title/description are equally untranslated. So this was a false promise, not a grammar problem, and the fix was to delete the claim rather than reword it ("the other one" meant "the other language"). **Bio and listing translation remain genuinely unbuilt** — a real, separable feature, flagged here rather than quietly implied by copy.

**3. "Every step saves on its own" was false.** The guided setup saves on **Continue**; the user proved it by entering a specialty, navigating away and losing it. Reworded in both locales to say exactly that. A promise a product does not keep is worse than no promise, and this one cost real work.

**4. Spanish copy was sitting in the English catalogue.** `en.json`'s `bioPlaceholder` was literally `"Cocino comida trinitaria en casa desde hace quince años…"`. A full sweep of all 772 keys for the same class of leak found three more shared verbatim between locales — `specialtiesPlaceholder` (`pastelón`), `listingForm.titlePlaceholder` (`Pastelón de plátano`) and `search.placeholder` — now given genuine English examples (`curry chicken`, `Curry chicken with roti`, `Doubles, curry chicken, black cake…`) while **Spanish keeps its Spanish ones**, which is the whole point. Deliberately left alone: `common.freshToday` ("En la cocina hoy" is the brand's own bilingual rail title, English subtitle beneath) and the dev-only `styleGuide.samples.*`.

**5. Standing was invisible exactly where a new seller stands.** `<SellerStatusBanner>` rendered on the dashboard root **only** — but onboarding drops a new seller straight into `/food/profile/setup` and they work through eight steps without ever passing it. The user concluded no approval step existed and asked whether anyone could spam-publish food. **They cannot** — `onboard-seller.ts` leaves `status` at the schema default `PENDING`, and every buyer-facing query filters `seller.status === "ACTIVE"` (six such filters in `discovery.ts`, plus `browse.ts`). The gap was purely that nothing *said* so where they were working. New `<SellerStatusNote>` (same file, no `<h1>`, for pages that own their heading) now renders on both the guided setup flow and the profile editor. **ACTIVE renders nothing** — "you are approved" is the unremarkable default, and a permanent green bar on every profile edit is noise; only PENDING and SUSPENDED speak up.

**6. The `/food` badge read as a glitch.** The seller-surface header stamped a literal `/food` beside the wordmark — an accurate description of the URL path, and to the first person who saw it outside this codebase, it looked like the wordmark had lost a word. Now a translated `seller.workspaceBadge` ("Seller workspace" / "Panel de vendedor") that names what the surface *is*.

**Verification:** `tsc`/lint/`next build` clean in both repos; bilingual parity **773/773**. A dedicated Playwright script (14/14, temporary, deleted after running) proved: a PENDING seller sees their standing on both the setup flow and the profile editor while an ACTIVE seller sees no note at all; the badge reads correctly in both locales with no bare `/food` anywhere; the bio placeholder is English and the false translation promise is gone; the intro states saving happens on Continue; and — the half that matters for a bilingual product — **Spanish still shows `pastelón`** where English now shows `curry chicken`. Full regression clean: `vitest` 27/27, `verify:a11y` 498/0.

**⚠ Still open, not fixed here: a 500 on every seller image upload in production** (profile photo, cover, gallery), reported live. Narrowed but not diagnosed: ingest failures return **422** by construction (`app/api/seller/media/route.ts` catches them), so the throw is *outside* that guard — it is not a rejected file type or a bad image. `requireOwnSeller()` is DB-only, leaving a Prisma write, a filesystem permission error on `UPLOADS_BASE_PATH`, or a native `sharp` load failure. Local uploads work, so this is environment-specific. Awaiting `user-pm2 logs food-web --err` from the VPS rather than guessing.

Files modified: `components/seller/status-banner.tsx` (`SellerStatusNote`), `app/food/(dashboard)/profile/page.tsx` + `app/food/(dashboard)/profile/setup/page.tsx` (status note), `app/food/layout.tsx` (workspace badge), `messages/{en,es}.json` (773/773), `BUILD_SLICES.md`. Cross-repo (Apoyo-Demia): `middleware.ts` (`ORIGIN_SUBDOMAINS` + fallback).

---

### Slice 25 — Fixing Slice 24's open item: the seller-media routing miss (ecosystem ruling E14)

Root cause was `user-pm2 logs food-web --err` from the VPS, not a code hunt: **completely clean.**
The request never reached `food-web` at all. nginx on `portal.apoyolime.com` proxies only `/food`
and `/food/` to this app — a bare `POST /api/seller/media` from a page rendered there falls through
to the portal host's catch-all and is answered by a **different app entirely**. `UPLOADS_BASE_PATH`
and its permissions, both suspected in Slice 24, were never involved. A second, unnoticed half of
the same cause: image *reads* on the seller surface were equally broken, unreported only because no
seller had a photo yet. Full diagnosis: `DEPLOYMENT.md` §6b's now-resolved CONFIRMED-IN-PRODUCTION
block; ecosystem ruling **E14** (this bug is the second of two verticals to hit this exact shape —
Apparel found and fixed it first, at its own Slice 14).

**The fix is Apparel's already-proven remedy, not an invention.** nginx now also proxies a
**namespaced** `/api/food/*` prefix (collision-free — a bare `/api/media`/`/api/account`/`/api/health`
prefix would silently steal that name from Apparel and/or Salon, which share this host). Four
**additive** routes under `app/api/food/…` each delegate to the exact same handler as their bare
twin — `lib/media/serve.ts`, `lib/media/upload.ts`, `lib/media/seller-media.ts`,
`lib/media/seller-listing-media.ts`, extracted from what were previously route-file-only functions
so the bare and namespaced routes physically cannot drift apart. The bare routes are untouched —
local dev and direct `food.apoyolime.com` access still use them, and no live buyer-surface URL moved.

**`lib/media-url.ts` — the picker named as Food's own gap in E14 (Food hand-built `/api/media/...`
at every call site, which is precisely how this survived five slices).** Read helpers
(`mediaUrl`/`sellerMediaUrl`), an upload-endpoint picker for the ONE upload route with real callers
on BOTH surfaces (`mediaUploadUrl("buyer" | "seller")` — `<OrderMessageComposer>` already carried an
`actor: "seller" | "client"` prop from Slice 18, so this reused it rather than inventing a new
discriminator), and two constants for the seller-only upload routes that never have a buyer caller.

**`<FoodImage>` gained a `surface?: "buyer" | "seller"` prop, defaulting to `"buyer"`.** Every
pre-existing call site — every buyer-surface component, roughly a dozen files — needed ZERO changes.
Only the components that render EXCLUSIVELY under `app/food/*` (`<PhotoField>`, `<GalleryManager>`,
`<ListingPhotoManager>`, `<HighlightManager>`, `<ActiveStoriesList>`, `<StoryPostForm>`, the admin
takedown list, the seller listings list) now pass `surface="seller"` explicitly. `<OrderThread>` and
`<OrderMessageComposer>` are the one pair genuinely shared by both surfaces, so each page that
renders them passes a real `surface`/`actor` value instead of a hardcoded default.

**⚠ A subtlety the naive fix would have gotten wrong: `next/image`'s custom loader
(`lib/media/image-loader.ts`) already had an "already-absolute, skip" branch** for root-relative
paths, added for static assets. Simply prefixing a seller-surface `src` with `/api/food/media` before
handing it to `<Image>` would have silently hit that branch and skipped `resolveVariantKey` entirely
— every seller-surface photo would have served whichever single variant was originally stored,
losing responsive thumb/card/full selection with no error anywhere. Fixed by teaching the loader to
recognise the seller prefix specifically, strip it, run the existing variant logic, then reattach it
— seller-surface images now get correctly-sized variants exactly like buyer-surface ones.

**Also removed:** `lib/storage.ts`'s own `mediaUrl`/`mediaBaseUrl` — dead code, zero imports anywhere
in the codebase, and a second, competing, unused definition of the exact concept `lib/media-url.ts`
now owns for real. Leaving it would have been the same class of trap that caused this bug.

**Verification, and its own real limit:** `tsc`/lint/`next build` clean (all 4 new routes appear in
the build's own route table). `vitest` 27/27 unchanged. Re-ran, against a real production build,
every existing e2e script that exercises a component this slice touched: `verify:order-thread-e2e`
**21/21** (both surfaces send messages; the buyer's photo attachment round-trips and renders),
`verify:listing-editor` **38/38** (`<ListingPhotoManager>`'s upload and both surfaces' reads).
`verify:onboarding` was attempted too but crashed on an unrelated, pre-existing gap in this local
environment (needs a local `portal-web` on a throwaway identity DB to read the FOOD registration
toggle — never stood up here) — the crash was at a registration-CTA check, before any upload step,
so it neither confirms nor regresses anything this slice touched. **What none of this could prove
locally: the actual nginx path split** — one origin serves both surfaces in local dev by
construction (every prior slice's own stated limit).

✅ **Deployed and confirmed live, 2026-08-09.** `deploy.sh` ran clean; the nginx drop-in addition
(`= /api/food` + `/api/food/`, alongside the existing `/food` pair) passed `nginx -t` and reloaded
with no error; `food-web` restarted with a flat restart count across two `pm2 list` snapshots.
External proof (no SSH — plain HTTPS from outside the VPS): an unauthenticated
`POST https://portal.apoyolime.com/api/food/seller/media` returns **401
`{"error":"UNAUTHORIZED"}`** — the exact shape only `handleSellerMediaUpload` produces, proving the
request now reaches food-web through the new route rather than falling through to a different app —
while the bare `food.apoyolime.com` route still answers identically, unaffected. A GET on the
namespaced media-serve route with a bogus key returns a clean 404 carrying this app's own security
headers, not a Hestia/portal-web page. **Still open:** a real seller completing a real upload through
the browser — the routing bug is fixed and confirmed, but that last proof is the user's own
walkthrough step to run.

Files created: `lib/media-url.ts`, `lib/media/serve.ts`, `lib/media/upload.ts`,
`lib/media/seller-media.ts`, `lib/media/seller-listing-media.ts`,
`app/api/food/media/[...path]/route.ts`, `app/api/food/media/upload/route.ts`,
`app/api/food/seller/media/route.ts`, `app/api/food/seller/listing-media/route.ts`.
Files modified: `app/api/media/[...path]/route.ts`, `app/api/media/upload/route.ts`,
`app/api/seller/media/route.ts`, `app/api/seller/listing-media/route.ts` (all four now thin wrappers
around the extracted handlers), `lib/storage.ts` (dead `mediaUrl`/`mediaBaseUrl` removed),
`lib/media/image-loader.ts` (seller-prefix-aware), `components/food-image.tsx` (`surface` prop),
`components/order-thread.tsx` + `components/order-message-composer.tsx` (surface/actor-driven
picker calls), `components/seller/upload.ts` (default endpoint), `components/seller/photo-field.tsx`,
`components/seller/gallery-manager.tsx`, `components/seller/listing-photo-manager.tsx`,
`components/seller/highlight-manager.tsx`, `components/seller/active-stories-list.tsx`,
`components/seller/story-post-form.tsx`, `app/food/admin/page.tsx`,
`app/food/(dashboard)/listings/page.tsx`, `app/(client)/orders/[id]/page.tsx`,
`app/food/(dashboard)/orders/[id]/page.tsx` (`surface` prop threaded), `lib/actions/order-message.ts`
+ `lib/actions/create-story.ts` (doc comments), `.env.example`, `DEPLOYMENT.md`, `BUILD_SLICES.md`.

---

### Slice 26 — Two silent-failure UX gaps, found live walking a real seller through onboarding+approval

Not planned. The user hit what looked like two separate bugs — a setup-wizard step that would not
tick despite the field visibly saving, and an admin "Approve" button that failed with a generic
error — while walking the real onboarding→admin-approval loop the Slice 25 media fix unblocked.
Both traced to the SAME non-bug: `MIN_BIO_LENGTH = 20` (`lib/seller-profile.ts`), and the seller's
test bio ("kjnhbgvfcdkj", 12 characters) was genuinely under it. `isStepDone("bio")` and
`activationBlockers` were both working exactly as designed — a 12-character string is not a real
kitchen story, and Slice 16's whole point was that an approver should never see one that thin. **The
real bug was that nothing said so anywhere** — the field showed a live max-length counter and a
"✓ Saved" confirmation (correctly — the save DID succeed) but no hint that a floor existed, and the
admin's rejection was the same generic `sellers.actionError` ("reload the page and try again")
every OTHER admin-action failure uses — actively misleading here, since reloading changes nothing
and the real fix is the seller finishing setup, not the admin retrying.

**Two fixes, both additive, both worth generalizing later:**
1. `<BioField>` (shared by the setup wizard and the standalone profile editor — one component, both
   surfaces already correct) now shows a second, muted hint line — "write at least {min}
   characters…" — for as long as the trimmed bio stays under `MIN_BIO_LENGTH`, and says nothing
   once it clears the bar. Mirrors the existing max-length counter's own always-visible pattern, just
   for the floor instead of the ceiling.
2. `<AdminActionButton>` gained an optional `reasonLabels` prop — a map from a Server Action's
   `reason` string to a specific message, falling back to the existing generic `errorLabel` for
   anything not listed. Wired for exactly one case so far: `updateSellerStatus`'s `"incompleteProfile"`
   reason now tells the admin the profile is missing something an approver requires, instead of
   suggesting a reload. The other three admin actions (suspend/reinstate, report resolution, listing
   takedown) are unchanged — none of their failure reasons currently need a specific message, and the
   prop is opt-in per button.

**A third, smaller finding from the same walkthrough:** nothing on the seller dashboard led back to
portal's own launchpad (`/home`, the vertical-card picker) — once a seller landed on
`portal.apoyolime.com/food/*`, the only way back was hand-editing the URL. Added a small "Portal"
link (`<LayoutGrid>` icon) to the seller header, next to the locale toggle, pointing at
`portalPageUrl("/home")`. **Not a violation of the "never guess at a sibling vertical's door" rule**
— same exception `lib/links.ts`'s own header comment already documents for `portalPageUrl`: Portal
is the ecosystem's own hub, not a sibling vertical, and every vertical is expected to link back to
it.

**Two things reported live in the same session that turned out NOT to be bugs, for the record:**
- A signed-in session bouncing from `portal.apoyolime.com` to `food.apoyolime.com` unprompted — this
  is Apoyo-Demia's own middleware sending a non-provider session back to its own vertical, reading
  the JWT's embedded `memberships` claim, which is documented ecosystem-wide as refreshed only at
  re-issue (`lib/session.ts`'s own standing note). A session that predates completing onboarding will
  read as non-provider until it naturally refreshes; this is accepted staleness, not a defect.
- `portal.apoyolime.com/apparel/onboarding` 404ing — Apparel's own onboarding page, a different
  repo's own scope, not investigated further here.

**Verification:** `tsc`/lint/`next build` clean, same route list. Bilingual parity **782/782**
(3 new keys: `fields.bioMinHint`, `admin.sellers.approveIncompleteProfile`, `seller.portalHome`,
each added identically to both locales). `vitest` 27/27 unchanged. Not re-verified live yet — this
fix is responding to the user's own real walkthrough, still in progress.

**⚠ `admin.sellers.approveIncompleteProfile` was replaced the same day — see Slice 27.** The hard
block this key's error message described didn't survive contact with the user: it was the ONE thing
here that actually WAS a bug, not a missing explanation for correct behavior. Renamed to
`approveConfirmMissing` as part of that correction.

Files modified: `components/seller/bio-field.tsx` (min-length hint), `components/admin/admin-action-button.tsx`
(`reasonLabels` prop), `app/food/admin/page.tsx` (wires it for `incompleteProfile`), `app/food/layout.tsx`
(portal-home link), `messages/{en,es}.json` (782/782), `BUILD_SLICES.md`.

---

### Slice 27 — Admin approval was never supposed to be a hard block

A direct correction from the user, same day as Slice 26: "I don't remember ever stating admin
approval having criteria. I am more certain I would have wanted admin approval to simply work if
they decide to approve the person even if a field is missing." Slice 16's own original module
comment (`lib/seller-profile.ts`) actually agreed with this all along — "Nothing in this module
authorizes anything... it is advisory in this slice" — but `lib/admin-sellers.ts`'s
`decideSellerLifecycleAction` turned that advisory list into an unconditional refusal anyway, and
nothing caught the mismatch between the module's own stated intent and what got built on top of it
until a real admin hit it.

**Fix: advisory-with-confirmation, not a hard gate.** `decideSellerLifecycleAction` takes a new
`force` parameter — `false` (the normal first call) still returns
`{ ok: false, reason: "incompleteProfile", blockers: SetupStepKey[] }` exactly as before, but
`force: true` skips the check entirely and approves regardless. The invalid-transition check
(can't approve an already-ACTIVE seller) is UNCONDITIONAL — `force` never touches it; that one is a
real state-machine rule, not an advisory nudge.

**`<AdminActionButton>` drives the two-step itself**, so the admin page's own JSX stays a single
button, not a bespoke confirm-dialog per caller: on `incompleteProfile`, it builds a message from
the actual missing fields (reusing the seller-facing setup wizard's own translated step titles —
`seller.setup.steps.<key>.title`, so "the bio" is never worded differently for an admin than for the
seller who's missing it) and shows one `window.confirm`. Confirming retries the SAME action with
`force: true`; declining leaves the row untouched with no error at all — the admin simply chose not
to, which isn't a failure state.

**Naming correction, not scope creep:** the previous `reasonLabels` prop (Slice 26) is kept as
general infrastructure — a plain reason→message override, useful for a genuinely terminal failure —
but `incompleteProfile` no longer uses it, since it isn't terminal anymore. `approveIncompleteProfile`
(Slice 26's translation key, whose entire message was "you can't do this") is retired in favor of
`approveConfirmMissing` ("here's what's missing, do it anyway?" — a question, not a refusal).

**Verification:** `tsc`/lint/`next build` clean, same route list. `scripts/verify-admin.ts`'s own
pure-decision-function assertions (20/20) still pass unchanged — `force` defaults to `false`, so
every existing call site's behavior is bit-for-bit identical unless it opts in. Bilingual parity
**782/782** (net zero — one key renamed, not added). Not yet re-verified live; this is a direct
response to the user's own real walkthrough, still in progress.

Files modified: `lib/admin-sellers.ts` (`force` param, `blockers` in the failure shape),
`lib/actions/admin.ts` (`updateSellerStatus` threads `force`), `components/admin/admin-action-button.tsx`
(the confirm-then-retry flow, `incompleteProfileConfirm` prop), `app/food/admin/page.tsx` (wires
translated step labels into it), `messages/{en,es}.json` (782/782, key renamed), `BUILD_SLICES.md`.
Cross-repo (Apoyo-Demia, disclosed): `app/home/page.tsx` — the launchpad's Apparel provider card
linked to `/apparel/onboarding` (assumed identical to Food's own path, never checked against
Apparel's actual build), which is `/apparel/onboard` (no "-ing") — 404'd live on a real click.
Fixed to the real path; Apparel's own dashboard already used it consistently, so this was the one
place guessing wrong.

---

### Slice 28 — A freshly-onboarded seller's own session didn't know it yet

Direct follow-up from the redirect-policy discussion Slice 27's admin fix opened up: Apoyo-Demia's
`middleware.ts` bounces a signed-in non-provider off `portal.apoyolime.com` back to their own
vertical (decision 14's sign-in matrix — a deliberate, user-locked rule, not a bug). But it decides
"non-provider" off the session JWT's embedded `memberships` claim, which `portal-web`'s own `jwt()`
callback only refreshes at sign-in or an explicit `trigger: "update"` — never automatically. A
seller who signs in, THEN completes onboarding in the same session, has a JWT that still says
"no memberships" for up to 30 days (`SESSION_MAX_AGE_SECONDS`), so visiting portal afterward got
them incorrectly bounced as a plain client. Confirmed live the same night this was diagnosed.

**Deliberately not fixed by adding a live check to Apoyo-Demia's middleware.** `lib/session.ts`'s
own standing rule — "use [a live read] only where a round-trip is impossible or a stale read is
harmless — i.e. edge middleware" — exists precisely because Edge middleware runs on every single
page load; a DB/API round-trip there is a cost paid by every visitor to every vertical, not just
the rare case that needed it. The fix instead targets the actual source of the staleness: the
moment a membership is minted, not the moment it's checked.

**`portal-web` gained `POST /api/auth/refresh-session`** — session-gated (a live cookie already
proves the caller owns the account, same carve-out `resend-verification`'s own comment uses),
re-mints the session cookie via the EXISTING `mintSessionCookie()` (Slice-fix from earlier tonight,
now also carrying email/name) — which already reloads memberships fresh on every call, regardless
of what's passed in. No new membership-reading logic; this route just gives a vertical a way to
ask for that reload to happen NOW instead of at the next natural re-issue.

**Food's `lib/portal-auth.ts` gained `refreshPortalSession()`**, a fire-and-forget POST to that
endpoint, called from `<OnboardForm>` right after `onboardSeller` returns `ok` — the exact moment
a `(FOOD, PROVIDER)` membership just landed in the identity DB. Deliberately never awaited/blocking:
every REAL authorization check in this app already reads live standing
(`requireFoodSeller()`/`lib/ecosystem.ts`), so a failed or skipped refresh degrades to the OLD
staleness window, never to a broken onboarding flow.

**Deliberately scoped to Food only tonight, not Apparel/Salon too** — the underlying
`/api/auth/refresh-session` endpoint is fully general and either vertical can adopt the identical
one-line `refreshPortalSession()`-style call at their own onboarding-submit whenever that work is
picked up; matches the user's own explicit call to defer cross-vertical uniformity work (the
register-page cross-link) to a dedicated future turn rather than doing it piecemeal tonight.

**Verification:** `tsc`/lint/`next build`/`vitest` clean in both repos (portal-web: 67/67; Food:
27/27), same route lists plus the one new portal-web route. Not yet verified live — this closes
out tonight's redirect-policy discussion but the actual "onboard, then visit portal, land on the
launchpad instead of getting bounced" round trip is still the user's own walkthrough to run.

Files modified: `components/seller/onboard-form.tsx` (calls `refreshPortalSession` on success),
`lib/portal-auth.ts` (`refreshPortalSession`), `BUILD_SLICES.md`. Cross-repo (Apoyo-Portal
portal-web, disclosed): `app/api/auth/refresh-session/route.ts` (new).

---

---

### PC-1 — Persistent buyer↔seller chat, with a seller opt-out (2026-08-19)

Not a numbered slice: a standalone program implementing the user ruling in
`Apoyo-Demia/PRE_LAUNCH_CHECKLIST.md` §5 ("Food — post-order chat becomes a persistent
buyer↔seller thread, provider-controlled"). **Food's provider demo is sequenced AFTER this**
(same ruling), because it changes what the demo has to show.

**Supersedes architecture Part D's "one thread per order — no separate thread entity is needed
in MVP"**, which is struck through in that doc rather than removed. Conversation used to die with
the order (`FoodOrderMessage` cascaded from `FoodOrder`) and there was no seller inbox at all, so
a buyer writing four months later had nowhere for the message to land.

**Seven decisions were settled with the user before any code was written** (2026-08-19). Recorded
here because several are the kind that look like implementation detail and are not:

1. **Opt-out leaves existing threads read-only, but writable while an order is open.** History is
   never hidden or deleted; the composer returns automatically whenever the pair has a PENDING or
   ACCEPTED order, and disappears again when it closes.
2. **A blocked buyer is told WHY, but only when there is something to tell.** An opted-out seller
   produces an explicit "this kitchen only takes messages about active orders". A buyer with no
   order history sees **nothing at all** — no composer, no entry point, no explainer — because
   messaging was never offered to them, and an explainer would advertise the channel to exactly
   the person the gate excludes.
3. **Read/unread is a seller setting, not a fixed feature** (user amendment to the original
   question). `messageReadReceipts` governs whether the BUYER sees "Read"; the seller's own unread
   counts are never optional. ⚠ It is disclosure-only — `readAt` is written either way, because
   the seller's badges read the same column.
4. **Notification delivery is a seller setting too**: in-app + email / in-app only / off, stored
   per-category ("chat now, structured for expansion later") so a category can be added with no
   migration. ⚠ **Order-lifecycle mail is deliberately not expressible** — a seller who silences
   "you have a new order" has a broken business, not a quieter one.
5. **No per-message email, ever** (user, unprompted). Already true for order threads via
   `MESSAGE_EMAIL_DEBOUNCE_MS`; PC-1 re-points that debounce at the THREAD so it survives a
   conversation moving between orders.
6. **Retention: 12 months idle.** ⚠ With an interlock — an open order shields an idle thread from
   the sweep.
7. **Defaults are all permissive**, and that is the ruling itself, not a convenience.

**The gate is the load-bearing part, and it is stricter than "any order".** `lib/thread.ts`'s
`ENGAGED_ORDER_STATUSES` requires an order the seller actually **responded to** —
ACCEPTED/COMPLETED/DECLINED/CANCELLED_BY_*. `PENDING` and `EXPIRED` are excluded on purpose: a
stranger can create a PENDING order unilaterally, so if it granted a permanent channel then
"place a request, ignore the 24h expiry, message forever" would be a one-click spam key —
precisely the surface order-scoping used to close. `DECLINED` IS included, and that is not
leniency: "not this Saturday, could you do the next one?" is the single most natural trigger for
this feature, and it required a real response a spammer cannot force. Chat during a PENDING order
still works (`OPEN_ORDER_STATUSES`), which is today's behaviour unchanged and bounded by
`respondBy`.

⚠ **A `FoodThread` row is a container, never a permission.** It is created when a first order's
chat starts and outlives every order. Nothing should ever infer "may message" from "thread
exists" — `resolveThreadAccess` re-derives the answer from live order state and the seller's
current setting on every render AND every send.

**Follow-up decision, settled 2026-08-19 after the first build: "open" must not mean "immortal".**
The interlock originally shielded a thread whenever the pair had an order in `OPEN_ORDER_STATUSES`.
That is a status test, and status alone is not sufficient in this schema:

- `PENDING` **cannot** go stale — it carries `respondBy`, and `sweepExpiredOrders` moves it to
  `EXPIRED` automatically on the same tick.
- `ACCEPTED` has **no automatic exit at all.** Only the seller marks `COMPLETED` (architecture E5
  point 3, deliberate), and `sweepOrderCompletionNudges` sends exactly one reminder they are free
  to ignore. So an order whose fulfilment date passed two years ago still reads as open, and would
  have shielded its conversation from retention permanently — the interlock quietly becoming a leak.

Replaced by `lib/thread.ts`'s `orderIsActive(order, now)`, a pure function: a `PENDING` request
still inside its `respondBy` window, or an `ACCEPTED` booking whose `fulfillmentAt` plus
`ACCEPTED_ORDER_ACTIVE_GRACE_DAYS` (30) has not passed. Everything terminal is inactive.

⚠ **Every Food order is scheduled** — `fulfillmentAt` is NOT NULL — so the "unscheduled open order
needs a 30–90 day inactivity window" pattern has no referent here and was deliberately not built.
The date the order already carries is a better signal than any inactivity heuristic.

⚠ **The same predicate governs the write gate**, not just retention. Two definitions of "active"
would be a bug waiting to happen: a stale `ACCEPTED` order that no longer shields a thread from
deletion must not still grant write access to an opted-out seller's inbox either. In practice this
only narrows things for opted-out sellers, since `ACCEPTED` is in `ENGAGED_ORDER_STATUSES` and a
seller on the permissive default allows post-order messaging anyway.

⚠ **It deliberately does NOT close the stale order.** Auto-expiring a long-abandoned `ACCEPTED`
order is a real and separate gap — it also pollutes the seller's order list and any future revenue
analytics — but it changes the business record of a real-world transaction, with notifications and
history attached. Deciding that inside a retention sweep would hide an order-lifecycle decision
inside a cleanup job. `orderIsActive` answers only "does this row still justify protecting a
conversation" and leaves the order untouched; the verification asserts that it does.
**Not built, not sliced — a candidate for `APOYO_BACKLOG.md`.**


**Findings and decisions during the build:**

- **`food_order_messages` is RENAMED to `food_messages`, not recreated.** Rows, primary key and
  indexes survive in place, so there is no window where a message exists in one table and not the
  other. Postgres keeps the OLD names for indexes/constraints across a table rename, so each is
  renamed explicitly — otherwise a later `prisma migrate diff` proposes spurious churn.
- **The backfill has a hard guard**: if any pre-existing message fails to reach a thread, the
  migration `RAISE EXCEPTION`s rather than proceeding to a NOT NULL that would fail opaquely.
  Backfilled thread ids are `thr_` + UUID, since SQL has no cuid generator; the column is TEXT
  with no format contract, and the prefix makes them identifiable if one needs investigating.
- **`ORDER_MESSAGE` notification payloads are backfilled with `threadId`.** Without it, an
  already-unread message notification could never be cleared from the new Messages section — only
  by opening the old order page it named.
- **`ORDER_MESSAGE` was kept and `THREAD_MESSAGE` added alongside it**, rather than one kind for
  both. `markOrderNotificationsRead` clears by `orderId`, which a message belonging to no order
  can never have; both kinds carry `threadId`, and `markThreadNotificationsRead` clears either.
- **`notifyOrderMessage` is gone, not deprecated** — its debounce was per-ORDER, which on a
  persistent thread would restart the 15-minute window every time the conversation moved between
  orders, and never applied at all to a message belonging to none.
- **The order detail pages run the gate too.** An order page is reachable forever, so once every
  order with a buyer has closed and the seller has opted out, the composer on an old order must
  stop working — otherwise "chat stays bound to open orders" has a permanent hole one click away
  in the buyer's order list.
- **`components/order-thread.tsx` / `order-message-composer.tsx` keep their `Order…` names** while
  being fully generic now. Renaming them is a delete-and-recreate of files two order pages import,
  for accuracy not worth the churn. Read "Order" as "the conversation".
- **The buyer surface got no sixth bottom-tab entry** — Part F3 reserves that bar for five
  destinations. `/messages` is reached from `/orders` and from a seller's profile, the two places
  a buyer is already thinking about that kitchen.
- **`resolveThread` upserts** rather than find-then-create: two concurrent first sends would both
  see "no thread" and the loser would take a P2002 mid-send. The `(sellerId, clientId)` unique
  index is what makes that safe.

**Verification — run for real against a live database.** `tsc --noEmit` clean, `next lint` clean
(zero warnings), `next build` clean with all four new routes present (`/food/messages`,
`/food/messages/[id]`, `/messages`, `/messages/[id]`), `vitest` 27/27, `npm run db:verify` 54/54.

`npm run verify:threads` — **59 assertions, all passing** against a real Postgres: every branch of
the gate as a pure decision, the gate against real rows (stranger refused, EXPIRED-only refused,
one COMPLETED order opening it), the opt-out actually blocking a post-order send, the open-order
override, `orderIsActive` including the stale-ACCEPTED case, 5 concurrent thread resolutions
landing on one row, the order-deletion inversion, unread/receipt behaviour, preference parsing,
and the retention sweep with both its interlock and its stale-order escape.

**The migration was proved on real pre-PC-1 data, not just on an empty schema.** The dev database
was empty, so a throwaway `pc1_backfill_test` database was built by replaying the five prior
migrations, seeded with old-shape `food_order_messages` rows (two buyers, one buyer holding TWO
orders with the same seller, a second seller for the same buyer, an order with no messages, and an
unread `ORDER_MESSAGE` notification), then migrated. Result: **5 messages kept, 0 stranded, all 5
order links preserved, 3 threads** — the same buyer's two orders with one seller collapsed into a
single thread carrying all 3 of its messages, the message-less order produced no thread, the
seller/buyer pairing did not merge across sellers, the `client_email` snapshot picked the newer
non-null address, and the `ORDER_MESSAGE` notification gained `threadId` while the `ORDER_PLACED`
row beside it was untouched.

⚠ `prisma/verify-schema.ts`'s hardcoded table count was stale-by-design-again (19 → 20 with
`food_threads`) and is fixed; its old "deleting an order cascades its messages" assertion is
**inverted**, since that is now precisely what must not happen.

Files created: `lib/thread.ts`, `lib/notification-prefs.ts`, `lib/actions/thread.ts`,
`lib/actions/message-settings.ts`, `components/thread-list.tsx`,
`components/thread-composer-section.tsx`, `components/message-seller-link.tsx`,
`components/seller/message-settings-fields.tsx`, `app/food/(dashboard)/messages/page.tsx`,
`app/food/(dashboard)/messages/[id]/page.tsx`, `app/(client)/messages/page.tsx`,
`app/(client)/messages/[id]/page.tsx`, `scripts/verify-threads.ts`,
`prisma/migrations/20260819120000_pc1_persistent_threads/migration.sql`.

Files modified: `prisma/schema.prisma`, `prisma/verify-schema.ts`, `lib/order.ts`,
`lib/notifications.ts`, `lib/email.ts`, `lib/sweep.ts`, `lib/actions/order-message.ts`,
`scripts/sweep.ts`, `scripts/verify-order-thread.ts`, `components/order-thread.tsx`,
`components/order-message-composer.tsx`, `components/report-message-sheet.tsx`,
`components/seller/seller-nav.tsx`, `app/food/(dashboard)/orders/[id]/page.tsx`,
`app/food/(dashboard)/profile/page.tsx`, `app/(client)/orders/[id]/page.tsx`,
`app/(client)/orders/page.tsx`, `app/(client)/sellers/[slug]/page.tsx`, `messages/en.json`,
`messages/es.json`, `package.json`, `Apoyo_Food_Architecture.md`, `BUILD_SLICES.md`.
Cross-repo (Apoyo-Demia, disclosed): `PRE_LAUNCH_CHECKLIST.md` §5 — the ruling's own entry,
marked built-not-deployed.

### PD-S10 — the provider demo (2026-08-20)

Not a numbered slice: Food's port of the cross-vertical program in
`Apoyo-Portal/Provider_Demo_Plan.md` (Salon PD-S1..S8, Apparel PD-S9, Food PD-S10). A signed-in
visitor opens `portal.apoyolime.com/food/demo` and operates a **fictional but fully interactive**
seller workspace — real requests to accept, a real menu to pause, a real conversation to reply in
— beside a phone frame showing the same fixtures through the real BUYER components. **No database,
no migration, no seeded rows** (plan D4/D5); a refresh resets everything.

**Sequenced after PC-1 by the plan's own §4a**, because the client-contact section had to
demonstrate the persistent thread as it actually ships rather than order-nested chat about to be
replaced.

**The mechanism question, answered without re-deriving it.** Salon's sandbox patches
`window.fetch` and answers `/api/salon/provider/*`. That is unavailable here for the same reason
it was unavailable to Apparel: **every mutating component on Food's seller surface imports a
`"use server"` action and calls it as a plain async function.** The one `fetch` in
`<OrderMessageComposer>` is the photo upload, not the send. So Food took Apparel's answer — move
the seam from the network layer to the **import layer** — as `lib/actions/registry.tsx`:
`FoodActions`, a TOTAL record of `typeof <the real action>`, defaulting to the real actions and
overridden only inside the demo. Eleven actions, seven components, one line each. A demo registry
that forgets a key **does not compile**.

⚠ Named `FoodActions`, not Apparel's `SellerActions`, on purpose: four of the seven components
behind the seam (`<OrderReasonAction>`, `<OrderCompleteButton>`, `<OrderMessageComposer>`,
`<ReportMessageSheet>`) render on the BUYER surface too. Nothing about that surface changes — with
no provider mounted the context value IS the real actions.

**Findings and decisions during the build:**

- ⚠ **`next/link` beats a bubble-phase click handler, and the demo was silently escaping.** The
  listing rows and `<ThreadList>` navigate by design, so the demo neutralises their anchors from a
  wrapper rather than threading a `demo` prop through production components. With a plain
  `onClick` that wrapper runs AFTER Link has already called `router.push()`, so `preventDefault()`
  cancels the browser's navigation and nothing else. **Caught live in the dev-server log** — real
  `GET /food/messages/demo-thread-ayanna` and `GET /food/listings/demo-listing-doubles` requests
  fired from inside the demo, which in production would eject a visitor onto a page that redirects
  a seller-less session to `/food/setup`. Fixed with `onClickCapture` + `stopPropagation()`, and
  `verify-demo-browser.mjs` now fails if any request for a real dashboard route is ever made.
- **The PC-1 gate is IMPORTED, not approximated.** `lib/thread.ts` imports Prisma, so the pure
  decision half — `decideThreadAccess`, `orderIsActive`, `OPEN_ORDER_STATUSES`,
  `ENGAGED_ORDER_STATUSES` — was extracted to **`lib/thread-access.ts`** (imports one type,
  nothing else) and re-exported from `lib/thread.ts`, so every existing caller is untouched and
  there is exactly ONE definition of the gate. The demo evaluates the real function over fixture
  orders in the browser. Same split `lib/order-status.ts` and `lib/seller-profile.ts` already use.
- **Order transitions likewise go through the real `decideOrderTransition`**, so the demo cannot
  teach a state machine the product does not have: accept/decline vanish once accepted, complete
  is unreachable from PENDING, and a seller cancellation lands on `CANCELLED_BY_SELLER`.
- **The fixtures exist to demonstrate the GATE, not just chat.** Ayanna has one COMPLETED order
  and nothing open — engaged, therefore subject to `postOrderMessaging`. Rafael has an ACCEPTED
  order still ahead of its fulfilment date. Turn the opt-out off in the demo and Ayanna's composer
  is REPLACED by the real refusal notice while Rafael's survives, because coordinating a live
  order is exactly what the opt-out may not silence.
- **Read receipts got a demonstrable consequence.** `messageReadReceipts` is disclosure-only, so
  its effect is invisible on the seller's own screen. The buyer phone frame renders the same
  transcript with `showReadReceipts` bound to the live setting — flip it and the "Read" line
  disappears from the customer's side, which is the only honest way to show what it does.
- **Two list rows were EXTRACTED, not copied**: `<SellerOrderRow>` (+ `SELLER_ORDER_ROW_CLASS`)
  and `<SellerListingRow>`, previously inline in their pages. Only the wrapper differs in the demo
  — a `<button>` that opens in place rather than a `<Link>` that navigates and would reset the
  sandbox. `<OrderThread>`, `<ThreadList>` and `<ThreadComposerSection>` were made **isomorphic**
  (`useTranslations()`/`useLocale()` instead of `await getTranslations()`, no `"use client"`),
  which next-intl v4 resolves on either side of the boundary — the real pages still server-render
  them, the demo renders the same files client-side.
- ⚠ **Photos: MealDB was refused, Wikimedia Commons was used.** The obvious source was
  `seed-assets/`, but that directory is **gitignored** — it is a download cache, nothing in it has
  ever been committed — and `prisma/seed-data/photos.ts` says of its MealDB default that it is
  "fine for a demo, NOT a licence to ship these as real sellers' photos". So
  `scripts/build-demo-assets.mjs` pins eight Commons files by exact title (search is unusable —
  that same file records that "pelau" returns the Republic of Palau), **re-verifies each licence
  against an allow-list at build time and fails the build on anything else**, and writes committed
  webps plus a manifest carrying the attribution. All eight are CC BY-SA 3.0/4.0, so the demo
  renders a credit line — a licence obligation, not a footer nicety.
- **`/api/food/demo-media/[file]` is a separate route from `/api/food/media/*`**, because the
  latter reads the gitignored `uploads/` tree and `safeStorageKey`'s category allow-list correctly
  refuses anything else. It must live under `/api/food/*` — nginx proxies nothing else to this app
  on the portal host (E14) — and the committed manifest IS its traversal guard.
- **One production seam beyond the registry**: `sellerMediaUrl()` now passes a root-relative src
  through untouched. Everything this app stores is a bare storage key, so a leading `/` means the
  caller named a route; without it a demo URL became `/api/food/media//api/food/demo-media/...`.
  `lib/media/image-loader.ts` already made the matching allowance one layer down.
- **The demo route is `app/food/demo/`, a sibling of `(dashboard)`, not inside it** — every page
  in that group calls `loadSellerWorkspace()` and redirects a seller-less session to
  `/food/setup`, which is precisely the visitor this demo is for. Denial is `notFound()`, never
  403; a signed-out visitor gets portal's sign-in with a `callbackUrl`.
- **`getDemoAccessMode()`** joins `lib/ecosystem.ts` beside `getLaunchConfig()` — 30s TTL, no
  `cache()` wrapper (same reasoning as `getMemberships`), fail-closed to `OFF` on every path
  including a bare network throw.
- **No `<OrderThreadPoller>` in the demo.** It exists to `router.refresh()` on a timer for the
  other party's messages; there is no other party and no database.
- **Not covered, deliberately**: availability (Food has none at seller level — omitted entirely,
  not rendered empty), peer view (no roster concept), onboarding (D8), dashboard stats (a demo
  inventing revenue numbers would be its least honest screen). Fresh Today is informational inside
  an `inert` wrapper.

**Addendum, same day — five fixes carried across from Apparel's own PD-S9 review.** That review
(`Apoyo-Apparel 92edb13`) found six defects in the sibling demo; four were shared with this one by
construction, plus one class Food had in a different place. Fixed here before either ships:

1. **Every date formatter is now pinned to `FOOD_TIMEZONE`.** `<OrderThread>` and `<ThreadList>`
   used a bare `new Intl.DateTimeFormat(locale, …)`. That was a **pre-existing live bug** — with no
   `timeZone`, Node formats in the server's zone, and T&T is UTC-4, so anything sent after 20:00
   local rendered as the following DAY on the surface whose entire job is "when did this customer
   write to me". PD-S10 made both components isomorphic, which added a second failure on top: an
   unpinned formatter reads the UTC server on the first pass and the visitor's own device zone on
   hydration. `lib/time.ts` gains `formatMessageInstant` / `formatMediumDate`, and the module
   header's existing rule ("never use server-local time for anything a user sees") now has
   something to reach for instead of the raw constructor.
2. **One epoch, resolved on the server.** The fixtures are relative to "now" and were built inside
   `useState` initializers — which React runs once on the server render and again on hydration, so
   `new Date()` in there seeded two different fixture sets for one page. `app/food/demo/page.tsx`
   resolves `nowMs` once and threads it down; the gate is evaluated at that same pinned instant, so
   both passes agree by construction rather than by luck.
3. ⚠ **`resolveAcceptPricing` extracted, and the sandbox's hand-copy deleted.** The demo's
   `acceptOrder` re-implemented E5's per-item pricing rule and a comment claimed it "reproduced [it]
   exactly". It did — *that day*. Apparel's review found precisely this pattern having silently
   drifted from the product it claimed to mirror, on the screen a prospective seller judges the
   business model by. The rule now lives once, pure, in `lib/order-form.ts`, and both
   `lib/actions/order.ts` and the sandbox call it. ⚠ The real action's WRITES are unchanged: the
   helper returns `changed` (only items the seller actually retyped) alongside `resolved` and
   `subtotalCents`, so blank fields still are not re-written with their own value, and the
   authoritative subtotal is still recomputed from fresh rows inside the transaction.
   `npm run verify:orders` — 41/41 against a real database — is what proves the live path survived.
4. **`/api/food/demo-media` no longer claims `immutable`.** These filenames are slot names, not
   content hashes, so the same URL legitimately serves different bytes after a re-run of the asset
   build; `immutable` would have stranded a replaced photo in caches for the full year the
   `max-age` allowed. Now one day plus `must-revalidate`, with an assertion.
5. **`getDemoAccessMode`'s `res.json()` is guarded.** A 200 carrying a non-JSON body (an nginx
   error page, a proxy interstitial) made `res.json()` throw straight out of a function whose
   entire contract is to fail closed — a 500 where the demo is meant to render a 404. Same gap and
   same fix as the bare `try` around `fetch` already recorded on `getProviderRegistrationConfig`.

**Not applicable to Food:** Apparel's null-photo `src:""` defect — `<MealCard>` already treats "no
photo" as a real state (a seller mid-onboarding) and renders its own placeholder.

**Second addendum — a code review of PD-S10 itself, and the one finding that mattered.**
Apparel's review was of Apparel; this is the same treatment applied to Food's own diff. Five
findings, all real, all fixed. `verify:demo` is now **50 assertions**.

1. ⚠ **The photo attachment escaped the actions seam entirely, and it was writing real files.**
   `<OrderMessageComposer>`'s upload is the ONE mutation on the conversation surface that is a
   `fetch` rather than a Server Action — and the seam was built around Server Actions, so the
   paperclip inside `/food/demo` performed a **genuine authenticated POST** to
   `/api/food/media/upload`: real WebP variants written into the server's `uploads/` tree, a real
   rate-limit budget spent, and orphaned files no retention sweep will ever collect — under a
   banner promising that nothing is saved. It is invisible to the Postgres-down run because that
   route needs no database, and `verify-demo` had never clicked it.

   Extracted to `lib/message-attachment.ts` and added to `FoodActions`; the sandbox answers with a
   committed fixture photo and raises a notice saying the visitor's own file was not kept, so the
   control demonstrably works AND the substitution reads as honesty rather than a bug. ⚠ **The
   rule the registry encodes is "every mutation the demo can reach goes through the seam", not
   "every Server Action goes through the seam"** — the type's own header now says so. Adding the
   key made the sandbox stop compiling until it was implemented, which is the total record doing
   exactly its job.
2. **The demo's order detail showed the whole conversation.** The real `/food/orders/[id]` renders
   `order.messages` — the order-scoped relation — while `/food/messages/[id]` renders the whole
   thread with `showOrderContext`. The demo handed the full thread to both, so opening FD-2041
   displayed a message about FD-2038, unlabelled. Now filtered to the order, matching the page it
   claims to be.
3. **Making `<OrderThread>` isomorphic put the translation client in the browser bundle.**
   `lib/bilingual.ts` imports `lib/translate.ts` (the kap64-translate HTTP client) at module scope
   for the WRITE half's sake; the component only ever needed the read half, which was harmless
   while it was server-only. Split into `lib/bilingual-read.ts` (imports nothing but a type,
   re-exported from the parent so every caller is unchanged) — the same discipline
   `lib/order-message-form.ts`'s header already spells out. No secret leaked; it was dead server
   code shipped to every visitor.
4. **The demo's unread badge never cleared.** Nothing played `markThreadRead`'s part, so Ayanna's
   "1 new" survived reading her thread. The sandbox now stamps counterpart messages on open —
   regardless of `messageReadReceipts`, because that setting governs DISCLOSURE only and the
   seller's own counts read the same column (`lib/thread.ts` is explicit).
5. ⚠ **A security assertion that could never fail.** `verify-demo`'s traversal probe requested
   `/api/food/demo-media/../.env`, and the URL parser **collapses `../` before the request is
   sent** — it resolved to `/api/food/.env`, never reached the route, and would have passed with
   the allow-list deleted. Now percent-encoded so it actually arrives, plus a separate
   off-manifest-name probe. A test that cannot fail is worse than no test, because it is counted.

**The review also confirmed, rather than assumed, that the first addendum's fixes hold:**
`resolveAcceptPricing` is behaviour-identical to the loop it replaced (same `changed` set, blank
fields still not re-written, in-transaction subtotal untouched), the `nowMs` threading genuinely
removes the SSR/hydration divergence, no unpinned formatter survives anywhere in the repo, and the
`lib/thread-access.ts` extraction leaves all twelve importers working with no demo-tree component
reaching Prisma at runtime.

**One class generalised past the demo.** Defect 5's unguarded `res.json()` was not unique to
`getDemoAccessMode`: `getProviderRegistrationConfig` and `getLaunchConfig` had it too, and both are
**live buyer-facing** reads that document themselves as failing closed. `<SiteFooter>` calls the
first on every storefront page — the same shape as the Slice 16 bug where an uncaught throw 500'd
the entire `(client)` route group. Both are now guarded. `lib/media/serve.ts`'s `immutable` header
was checked and is CORRECT (storage keys carry a random id and are never reused), which is the
distinction defect 4 turns on.

**Verification — run with Postgres DOWN, on purpose.** `npm run verify:demo`
(`scripts/verify-demo-browser.mjs`) — **50 assertions, all passing** through a real browser: the
guard in all three modes (including that `APPROVED_PROVIDER` reads the ecosystem API and not the
empty JWT claim), the quote-price accept AND its `priceRequired` refusal, decline with a reason,
complete, cancel, the pause switch, a real reply, the composer-visibility gate in both directions
for both customers, the three PC-1 settings, the informational section's `inert`ness, the buyer
frame, both locales, refresh-resets, no sandbox alarm, no failed request, no console error, and no
link escaping to a real dashboard route. A demo that works with no database at all is the cleanest
proof it touches none. `tsc --noEmit` clean, `next lint` clean (zero warnings), `next build` clean
with `/food/demo` and `/api/food/demo-media/[file]` both present, `vitest` 27/27. After the
addendum above, re-run against a real database as well: `verify:orders` 41/41, `verify:threads`
59/59, `verify:order-thread` 31/31, `db:verify` 54/54 — the live order-accept and thread-gate paths both survived their
extractions.

⚠ **Food has no `POST_DEPLOY_CHECKLIST.md`-equivalent readiness doc at all** (`APOYO_BACKLOG.md`
B1 already tracks this). Unlike Apparel's PT-3 there is no existing checklist to clear before
switching this demo on for real users — which is worth stating rather than letting the absence
read as a clean bill of health.

⚠ **Food is deliberately NOT in Apoyo-Demia's `/home` `DEMO_HREF` map yet.** That map is
hand-maintained (plan R5) and adding a vertical to it is the deliberate act of saying the demo
exists now. Neither this nor Apparel's is deployed, so both stay out until they are.

Files created: `lib/actions/registry.tsx`, `lib/thread-access.ts`, `lib/bilingual-read.ts`,
`lib/message-attachment.ts`, `lib/demo/access.ts`,
`lib/demo/fixtures.ts`, `components/demo/demo-sandbox.tsx`, `components/demo/demo-shell.tsx`,
`components/seller/order-summary-row.tsx`, `components/seller/listing-summary-row.tsx`,
`app/food/demo/page.tsx`, `app/api/food/demo-media/[file]/route.ts`,
`scripts/build-demo-assets.mjs`, `scripts/verify-demo-browser.mjs`, `demo-assets/*` (8 webps +
`manifest.json`).

Files created (addendum): `POST_DEPLOY_CHECKLIST.md` — Food's first readiness doc, closing
`APOYO_BACKLOG.md` B1's "Food has no readiness doc at all".

Files modified: `lib/ecosystem.ts`, `lib/thread.ts`, `lib/media-url.ts`, `lib/time.ts`,
`lib/order-form.ts`, `lib/actions/order.ts`, `app/food/(dashboard)/messages/[id]/page.tsx`,
`components/order-thread.tsx`, `components/thread-list.tsx`,
`components/thread-composer-section.tsx`, `components/order-message-composer.tsx`,
`components/order-reason-action.tsx`, `components/order-simple-action.tsx`,
`components/report-message-sheet.tsx`, `components/seller/accept-order-form.tsx`,
`components/seller/listing-active-toggle.tsx`, `components/seller/message-settings-fields.tsx`,
`app/food/(dashboard)/orders/page.tsx`, `app/food/(dashboard)/listings/page.tsx`,
`messages/en.json`, `messages/es.json`, `package.json`, `BUILD_SLICES.md`.
Cross-repo (Apoyo-Portal, disclosed): `Provider_Demo_Plan.md` — status and §2.3a.

---

## Phases 4+ (architected in `Apoyo_Food_Architecture.md` Part I — slice when reached)

4 Saved & repeat (collections, order-again recs) · 5 Advanced search & trending materialization · 6 Seller dashboard & insights (k-anonymity floor — the signature feature) · 7 Reviews & portal reputation events · 8 Customer requests board · 9 Verification, geocoding, web-push, ws chat upgrade.
