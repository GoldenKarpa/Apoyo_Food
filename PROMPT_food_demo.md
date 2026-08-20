# Session prompt — Food: the provider demo (PD-S10)

Paste the block below as the opening message of a new conversation. Written to be run **from the
`Apoyo-Portal` workspace**, same convention as `PROMPT_offer_signal.md` and
`PROMPT_apparel_demo.md` — the prompt names its target repo explicitly. Everything it needs was
true as of 2026-08-20.

---

Apoyo Food — build the provider demo (PD-S10 in `Apoyo-Portal/Provider_Demo_Plan.md`).

⚠ **All code for this lands in `C:\Users\Karpa\Dev\Claude\Apoyo-Food`**, not in this workspace.
Read that repo's files directly; do not assume the working directory is the target.

Read `Provider_Demo_Plan.md` in full (this workspace) — §0's locked decisions are not up for
debate, §2 is the architecture, §3's Food row is the coverage contract, §6 is the risk register.
Then read `Apoyo-Food/CLAUDE.md`, `Apoyo_Food_Architecture.md`, and `BUILD_SLICES.md`'s § PC-1
notes in full — PC-1 is what this demo is built against and its own findings (what the gate
requires, what a thread row does and doesn't authorize, the settings shape) are load-bearing here.

**PT-1 is cleared.** The plan's own §4a listed Food's persistent buyer↔seller chat as PD-S10's
hard dependency — the client-contact section could not demo a thing that didn't exist. That
shipped as PC-1 (`Apoyo-Food/BUILD_SLICES.md` § PC-1), typechecked, built, and verified against a
real database 2026-08-19: `scripts/verify-threads.ts` 59/59, `db:verify` 54/54, and the
table-rename migration itself proved on seeded pre-PC-1 data (not just an empty schema). **Not
deployed — irrelevant here.** The demo is UI-only fixtures against no database at all (D5); it
never touches whether PC-1's migration has reached the VPS.

**Salon's demo (PD-S1..PD-S8) is built and is the reference implementation — read the actual
code, not just the plan.** In `Apoyo-Salon`: `app/salon/demo/page.tsx` (route + guard
composition), `lib/demo/access.ts` (`resolveDemoAccess()` — `notFound()` never `403`, membership
read from the ecosystem API not the JWT), `lib/demo/fixtures.ts` (in-memory fixture data, one
function per section), `components/demo/demo-sandbox.tsx` (the `window.fetch`-patching provider —
read its own header comment in full), `components/demo/demo-shell.tsx` (one route, sections
switched client-side, state survives navigation, real provider components not copies),
`scripts/verify-demo.mjs`.

---

## ⚠ The mechanism question — check Apparel's answer before re-deriving it

Salon's sandbox works by patching `window.fetch` and answering `/api/salon/provider/*` calls from
in-memory state — possible only because Salon's provider components mutate via `fetch(...)`.

**Food does not do this, and neither does Apparel.** Confirmed directly (2026-08-20): every
mutating component under Food's `components/seller/` and the PC-1 conversation components
(`OrderMessageComposer`, the settings switches in `message-settings-fields.tsx`, …) imports a
`"use server"` Server Action directly (`acceptOrder`, `sendOrderMessage`, `sendThreadMessage`,
`setPostOrderMessaging`, …) and calls it as a plain async function. There is no
`fetch("/api/...")` in Food's provider-facing mutation path — the one `fetch` call in
`order-message-composer.tsx` is the photo-attachment upload, a separate concern from the message
send itself, which goes through the Server Action.

**Apparel hit this identical mismatch building PD-S9** (`Apoyo-Apparel/PROMPT_apparel_demo.md` —
read its "one thing that will not port mechanically" section in full) and was mid-investigation
of it as of this prompt's writing: patch `fetch` and match on the framework's own Server Action
request signature, versus a small actions-registry indirection seam (~13 call sites, one import
change each) that the real code always uses by default and the demo swaps at the top. **Check
`Apoyo-Apparel`'s actual state before starting** — if PD-S9 landed a working mechanism, Food's
architecture is close enough to Apparel's (direct Server Action calls, not fetch) that the same
approach should port with far less new investigation than Apparel itself needed. If Apparel is
still unresolved or still in flight, Food's session is free to make the call independently — don't
block on Apparel finishing, just don't re-derive from zero what may already be answered next door.

⚠ One thing Food's shape adds that Apparel's didn't have to consider: **PC-1's own gate.**
`resolveThreadAccess` is a live, session-independent function of order state and a seller setting
— whichever mechanism is chosen, the demo's fixture seller needs a stable in-memory equivalent of
"has an engaged order with this fixture buyer" and "has an open order", or the composer will
either never appear or always appear regardless of what the demo is meant to be showing (see
Coverage, below, on what state the fixtures need to represent).

---

## Coverage (Provider_Demo_Plan.md §3, Food row — do not add or drop sections)

| Group | Coverage |
|---|---|
| Inbound work | **Orders — interactive.** Accept (with quote-price adjustment where relevant), decline, complete, cancel — `lib/order-status.ts`'s `decideOrderTransition` is the real transition table; the demo's fixture orders must obey it, not a simplified subset. |
| Catalogue | **Listings — interactive.** |
| Availability | Not applicable to Food (no `FoodAvailabilityWindow` equivalent to a Salon "Hours" concept at the seller-settings level — availability lives on individual listings) — omit the section entirely, don't render an empty one. |
| Client contact | **Persistent thread — interactive, lighter weight than inbound work/catalogue** (PC-1's own ruling, carried into this program's §3 note). One fixture conversation the seller can reply in, PLUS the two seller settings that actually exist now: the post-order opt-out (`postOrderMessaging`) and notification delivery (`chat` category — in-app+email / in-app only / off). Read receipts (`messageReadReceipts`) is fair game too if it fits without crowding the section — it's a real, shipped setting, not aspirational. |
| Peer view | Not applicable — Food has no team/roster concept. |
| Marketing | **Stories — informational.** Rendered with fixtures, controls inert, short caption — same posture as Salon's Portfolio/Promotions and Apparel's Stories. |
| Account | **Display-name-mode callout only** — same reduced treatment as every other vertical in this program. |
| Onboarding | **Not covered**, per D8. `/food/apply` already exists and needs no demo. |

**Client perspective panel (D6, §2.4):** a phone frame beside the seller view, rendering the real
buyer-facing components against the same fixtures — never a screenshot. Food's buyer surface is
`app/(client)/`. `<SellerCard>`/`<MealCard>` are the listing-side equivalents of Salon's
`<ProviderCard>`; for the thread section, render the fixture conversation through the buyer's own
`<OrderThread>` (the same component the seller side uses — PC-1 built it surface-generic on
purpose, `surface="buyer"` vs `"seller"`) so the demo visitor sees their own message and the
seller's reply from both sides of the phone frame, exactly as PC-1's real UI does today.

## Structural constraints (mirroring Salon's own, confirmed applicable to Food)

- **The demo route must NOT live inside `app/food/(dashboard)/`.** Individual dashboard pages
  call `loadSellerWorkspace()` and `redirect("/food/setup")` for a session with no `FoodSeller`
  row — exactly what a demo visitor doesn't have. The `(dashboard)` layout itself doesn't
  hard-redirect (it only conditionally renders `<SellerNav>`), but every page under it does its
  own check, so the group as a whole is still the wrong host. Follow Salon's precedent: a sibling
  route (`app/food/demo/`) with its own shell, own `resolveDemoAccess()` call (ported from
  `lib/demo/access.ts` almost verbatim — vertical-agnostic apart from the session type), no shared
  layout with the real dashboard.
- **Denial is `notFound()`, never `403`**, except a signed-out visitor, who gets a login redirect.
- **Food has no demo-toggle reader yet** — confirmed, `lib/ecosystem.ts` has no `Demo`/`getDemoAccessMode` in it today, unlike `getLaunchConfig()` which already exists there as the pattern to mirror (60s TTL cache, in-flight dedup, same file). Port it the way Salon's PD-S1 commit
  (`cbc2a7c`) did: a cached read against portal-web's **already-live**
  `/api/ecosystem/v1/config/demo` (the shared toggle infra — table, endpoint, admin control — is
  built; only the per-vertical reader is Food's own work), fail-closed to `OFF` on any read error.
- **Do NOT add Food to Apoyo-Demia's `/home` `DEMO_HREF` map until the route is actually live**
  (`app/home/page.tsx`). That map is hand-maintained per R5 — adding a vertical to it is "the
  deliberate act of saying that demo exists now." Last step, done only once everything else here
  is proven working.
- **No database, no migration, no `DEMO` visibility class, nothing persists** (D4/D5) — a refresh
  resets the whole sandbox. Unrelated to and shares nothing with the Demia/Social demo (pool
  accounts, session handoff, `DemoSession` table) — don't reach for any of that, and don't reach
  for PC-1's real `FoodThread`/`FoodMessage` tables either; the demo's conversation is fixture
  state, not a row.
- Bilingual from the start (R3) — Food is bilingual everywhere else (seller surface defaults
  `es`); the demo's own copy and fixture text need both locales from the first commit.

## Verification

Follow Salon's `scripts/verify-demo.mjs` shape (Apparel's `verify-demo` work, if landed by the
time this runs, may also be worth checking for anything specific to the direct-Server-Action
mechanism): drive every interactive control through a real browser, assert the sandbox answered,
fail loudly on anything unhandled rather than letting a control look broken silently. Additionally
assert the thread section's composer visibility actually reflects the fixture gate state (§ "the
mechanism question" above) rather than being unconditionally present — a demo that always shows a
composer regardless of the opt-out setting would misrepresent the real feature it exists to show.

## Out of scope

Payments, the Demia/Social demo's machinery, any change to `resolveDemoAccess()`'s locked-decision
shape (§0), any change to PC-1's real behavior (the thread model, the gate, the settings — this
demo consumes fixtures shaped like them, it doesn't touch the real tables or actions), Apparel's
or Salon's demos (already shipped / in progress elsewhere).

## One thing worth naming, not fixing here

Food has no `POST_DEPLOY_CHECKLIST.md`-equivalent readiness doc at all — `APOYO_BACKLOG.md` B1
already tracks this ("Food has no readiness doc at all. Decide: widen the checklist, or a gate per
vertical."). Unlike Apparel's PT-3, there is no existing checklist to point at here, so there is no
equivalent gate to clear before switching Food's demo on for real users — which is itself worth
surfacing to the user rather than silently assuming Food is launch-ready because no checklist says
otherwise. Don't build the checklist as part of this slice; just don't let its absence read as a
clean bill of health.
