# Apoyo Food — post-deploy checklist (created 2026-08-20)

**Why this file exists.** `APOYO_BACKLOG.md` B1 recorded that *"Food has no readiness doc at
all"* — Apparel had `POST_DEPLOY_CHECKLIST.md`, Demia/Social/Salon/Portal had
`PRE_LAUNCH_CHECKLIST.md`, and Food had nothing. That absence was being read as a clean bill of
health, which it never was. This closes that gap for Food specifically; the wider "widen the
checklist or one per vertical" question in B1 is answered here as **one per vertical**, matching
Apparel's existing precedent.

> ⚠ **Nothing here is a code change.** Every item is either a deploy that has not run or a human
> walkthrough that no local script can stand in for. Where a fix *is* needed, it gets its own
> entry in `Dev\Claude\VPS_PENDING_WORK.md` rather than being buried in a tick-box.

⚠ **Production has no real Food users yet.** Every check below is safe to perform with real test
data, including creating and deleting real rows. If that stops being true, revisit this line
before working the list.

---

## Part A — Outstanding deploys (do these first, in this order)

These are tracked in full, with commands and blast radius, in `Dev\Claude\VPS_PENDING_WORK.md`.
Listed here only so the ordering is visible from inside this repo.

| # | Item | Queue id | Status |
|---|---|---|---|
| A1 | **PC-1 — persistent buyer↔seller chat.** ⚠ Carries a **table rename** (`food_order_messages` → `food_messages`) plus a backfill onto new `food_threads` rows. Forward-only: `pg_dump` before running is the rollback path. | **D23** | ☐ |
| A2 | **PD-S10 — the seller demo.** No migration of its own; it rides on top of A1 because both live on `main`. Adds `/food/demo` and `/api/food/demo-media/[file]`. | **D22** | ☐ |
| A3 | 308 bridge promotion (`/food/onboarding` → `/food/setup`). Independent of A1/A2. | D5 | ☐ |
| A4 | Vertical-uniformity Stage 1. ⚠ May already be live as a side effect of the 2026-08-15 deploy — **verify production HEAD before treating it as outstanding**. | D6 | ☐ |

⚠ **A1 and A2 are one `git pull` in practice.** Deploying `main` for the demo lands PC-1's
migration whether or not you meant to. Read D23 before running either.

---

## Part B — Verify what is already live but never walked through

Deployed and process-healthy is not the same as working. None of these can be proven by a local
script, a typecheck, or `pm2 list` — they need real nginx, real portal-web session wiring, and a
real browser.

| # | Check | Why it cannot be proven locally | Done |
|---|---|---|---|
| B1 | **Sign in at portal, land on `portal.apoyolime.com/food`, and reach the dashboard.** | Food never issues a session — it only decodes portal-web's cookie. A mismatched `AUTH_SECRET` reads as *signed out* with **no error anywhere**, and `next start` forces `NODE_ENV=production`, which changes the cookie NAME. Only a real cross-host sign-in exercises this. | ☐ |
| B2 | **A seller uploads a listing photo from `portal.apoyolime.com/food/listings/…` and sees it render.** | The seller surface is path-nested on the portal host, where only `/food/*` and `/api/food/*` are proxied. A bare `/api/media/...` falls through to a different app entirely and fails **with nothing in Food's own log**. This is `lib/media-url.ts`'s whole reason for existing, and it cannot fail in dev, where one origin serves both surfaces. | ☐ |
| B3 | **Place a real order as a buyer on `food.apoyolime.com`, accept it as the seller on portal.** | Two origins, two cookies, one order. `Slice 25` confirmed the media routes externally but recorded *"a real seller completing a real upload through the browser"* as still outstanding — the same gap applies to the order round trip. | ☐ |
| B4 | **Confirm the order-lifecycle email actually arrives** (order placed → seller; accepted → buyer). | SMTP is real (Resend, sharing Salon's key). A wrong `SMTP_FROM` or an unverified domain fails at the provider, not in the app. | ☐ |
| B5 | **Confirm `food-sweep` is `online` under `user-pm2` and has logged at least one pass.** | A sweeper that never started looks exactly like a sweeper with nothing to do. ⚠ After A1 it also owns thread retention, so a silently-dead sweeper means conversations are never purged. | ☐ |
| B6 | ⚠ **Translation: send a Spanish message and confirm an English translation appears beneath it.** | `kap64-translate` is **VPS-only and confirmed unreachable from local dev**, so the service-down path is the *default* state on a dev machine — this feature has never once been exercised end to end here. Architecture B1 calls it *"mission-critical for Food, not a nicety"*. ⚠ Salon has a **confirmed open bug** of exactly this shape (`VPS_PENDING_WORK.md` **V5** — `TRANSLATE_SERVICE_URL` unreachable from `salon-web`); assume Food has it too until this is ticked. | ☐ |

---

## Part C — Gates on showing the seller demo to real people

The demo is invisible until an admin moves `DemoAccessConfig` off `OFF` (`VPS_PENDING_WORK.md`
**V9**). Everything in this part must be true *before* that flip, not after.

| # | Gate | Why | Done |
|---|---|---|---|
| C1 | **A2 deployed, and `portal.apoyolime.com/food/demo` returns `404` while the toggle is still `OFF`.** | Fail-closed is the whole design (D2). A 403, a redirect, or a 200 here means the guard is not doing its job. | ☐ |
| C2 | **`curl -I https://portal.apoyolime.com/api/food/demo-media/doubles.webp` → `200 image/webp`.** | Every demo photo depends on `/api/food/*` being proxied on the portal host. It is (4 locations, live since 2026-08-09) — but `VPS_DIRECTORY_MAP.md` carried a stale "2 locations" claim until 2026-08-20, so confirm rather than trust. | ☐ |
| C3 | ⚠ **B1 and B3 ticked** — the real sign-in and the real order round trip. | In `VERIFIED_EMAIL` mode the demo exists to help someone decide **which vertical to apply for**. If they sample Food, decide to apply, and land on a broken door, the demo has converted interest into a dead end — worse than not offering it. This is the same reasoning that makes PT-3 gate Apparel's demo. | ☐ |
| C4 | **`/food/apply` reachable and functional.** | The demo's whole conversion path. ⚠ That URL is **not this app** — US-S1 carved it out to portal-web via a dedicated nginx block. If it serves Food's own 404, the nginx drop-in is missing and the bug is not in this repo. | ☐ |
| C5 | **Walk the demo once in production, in both languages.** | `npm run verify:demo` (48 assertions, run with Postgres down) proves the sandbox. It cannot prove nginx routing, the real portal session, or that the photos survived the deploy. | ☐ |

---

## Part D — Known gaps, deliberately not gates

Recorded so they are not rediscovered as surprises. None of these blocks anything above.

- **No auto-close for a long-abandoned `ACCEPTED` order.** Only the seller marks an order
  complete (architecture E5 point 3, deliberate), so an order whose fulfilment date passed long
  ago sits `ACCEPTED` forever, polluting the seller's list and any future revenue analytics.
  PC-1's `orderIsActive` stops it shielding a conversation from retention, but deliberately does
  **not** close it — that is an order-lifecycle decision, not a cleanup job's business. Tracked as
  `APOYO_BACKLOG.md` **B29**, and likely not Food-only.
- **Food has no project `CLAUDE.md` and no memory directory** — `APOYO_BACKLOG.md` **B2**. Every
  session on this repo starts cold.
- **Food's PWA is live but the portal host serves a Demia manifest** — the cross-vertical PWA
  slice is deferred (`APOYO_BACKLOG.md` **B6**); do not raise it unprompted.
- **Reviews, verification badges and geocoding are Phase 7–9**, architected and deliberately not
  built. Their absence is scope, not debt.
