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
