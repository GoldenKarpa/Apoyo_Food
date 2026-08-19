# Session prompt — Food: persistent buyer↔seller chat

Paste the block below as the opening message of a new conversation. It is written to be run
**from the `Apoyo-Portal` workspace**, which is how these sessions are normally started — the
prompt names its target repo explicitly rather than assuming the working directory. Everything
it needs was settled on 2026-08-19; the open questions at the end are genuinely open, not
rhetorical.

---

Apoyo Food — make the order chat a persistent buyer↔seller thread, with a seller opt-out.

⚠ **All code for this lands in `C:\Users\Karpa\Dev\Claude\Apoyo-Food`**, not in this
workspace. Read that repo's files directly; do not assume the working directory is the target.

Read `PRE_LAUNCH_CHECKLIST.md` §5 (in `Dev\Claude\Apoyo-Demia`) for the ruling this
implements, and this repo's `CLAUDE.md` + `Apoyo_Food_Architecture.md` before changing
anything. Food never issues sessions — portal-web is the sole issuer; this app only decodes
(`lib/session.ts`). Migrations are hand-written (no local database).

**What exists today.** `FoodOrderMessage` is keyed to `orderId` with `onDelete: Cascade` from
`FoodOrder`, and renders inside `app/food/(dashboard)/orders/[id]/page.tsx` as `OrderThread` +
`OrderMessageComposer` + `OrderThreadPoller`. There is no seller Messages section and no
buyer inbox. Conversation therefore dies with the order, and a buyer who writes months later
has nowhere for it to land.

**What is wanted.**

1. **A persistent thread per (seller, buyer) pair** that resumes across orders, so a buyer can
   ask about upcoming options or negotiate a custom order without a live order open.

2. **⚠ Creating a thread still requires at least one order between that pair, past or present.**
   This is the load-bearing constraint, not a nicety. Order-scoping is what currently prevents
   unsolicited contact; removing it without a replacement opens a spam surface. Apparel needed
   an explicit `ApparelContactEvent` reveal step for exactly this reason — Food gets the same
   protection for free from "you have ordered from this seller at least once."

3. **A seller setting to opt OUT of post-order conversation**, keeping chat bound to open orders
   only. ⚠ **Defaults to allowed.** It is an escape hatch for a seller who finds it noisy, not a
   feature they must discover and switch on. Most likely a column on `FoodSeller`.

4. **A Messages section in the seller dashboard.** Without one, a persistent thread has no home
   and item 1 is pointless.

5. **A retention story.** The current `onDelete: Cascade` is the only cleanup that exists today;
   a thread that outlives orders needs its own answer. `scripts/sweep.ts` is the existing worker
   if a sweep is the right shape.

**Migration of existing data.** Existing `FoodOrderMessage` rows must end up on the right
thread, not be stranded or dropped. Hand-written migration, per `CLAUDE.md`.

**Out of scope.** Payments. Buyer-side inbox design beyond what item 1 requires. Anything in
Apparel or Salon.

**Sequencing.** Food's provider demo (a separate program — see `APOYO_MASTER_TASKS.md`) is
deliberately waiting on this, because it changes what the demo has to show. Client contact
will be covered in that demo but at lighter weight than the in-depth sections (inbound work,
catalogue, availability), so this work does not need demo affordances built into it.

**Verify it.** This repo's convention is a committed `verify-*` script per feature
(`scripts/verify-order-thread.ts` and `verify-order-thread-e2e.mjs` are the closest existing
pair). Extend or add one; assert at minimum that the gate holds — no thread without a prior
order — and that the seller opt-out actually blocks a post-order message.

**Questions to settle with me before building:**

1. When a seller opts out, what happens to threads that already exist — hidden, read-only, or
   still writable for orders that are currently open?
2. Should the buyer see *why* they cannot message (an explicit "this seller only takes messages
   about active orders") or should the composer simply not appear?
3. Does the persistent thread need unread badges and notifications on the seller side from day
   one, or is the Messages section enough to start?
4. Retention: keep threads indefinitely, or expire after some period of inactivity?
