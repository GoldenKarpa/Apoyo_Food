/**
 * `food-sweep` — the scheduled runner. Job logic lives in `lib/sweep.ts`,
 * shared with anything that needs to trigger a pass directly (a verification
 * script, a future manual `--once` debug run); this file is only the loop.
 *
 * Mirrors Salon's `scripts/sweep.ts` shape (the ecosystem's own precedent for
 * this exact job class) rather than inventing a new one: a persistent
 * `setInterval` sidecar ticking on a fixed cadence, running once immediately
 * on startup so a fresh deploy doesn't sit idle waiting for the first tick,
 * and swallowing a failed tick rather than letting it take the process down —
 * the next tick five minutes later picks up wherever this one left off.
 *
 * ⚠ **PM2 wiring is Slice 19's job, not this one** — the brief is explicit
 * ("runs locally via npm script for now"). Two gotchas recorded here for
 * whoever wires it, so they don't have to rediscover them (BUILD_SLICES.md
 * conventions block, both already hit elsewhere in this app):
 *   - `--interpreter none` — this is a `tsx`-run script; PM2's default
 *     interpreter assumes plain `node` and cannot execute it directly.
 *   - Slice 6's OWN finding applies here too: pin the interpreter explicitly
 *     (`--interpreter <path-to-node-22>`) rather than trusting PM2's `node`
 *     resolution from `PATH` — that is what silently ran `next start` under
 *     Node 18 instead of the checkout's own Node 22 and produced a
 *     `SyntaxError` that looked like a page bug, not a process-config one.
 *
 *   npx tsx scripts/sweep.ts             persistent sidecar (ticks every 5 min)
 *   npx tsx scripts/sweep.ts --once      one pass and exit (verification, a
 *                                        future PM2-cron-restart deployment)
 */
import {
  sweepExpiredStories,
  sweepExpiredOrders,
  sweepOrderCompletionNudges,
  sweepIdleThreads,
} from "../lib/sweep";
import { prisma } from "../lib/prisma";

const TICK_MS = 5 * 60_000;

async function tick(): Promise<void> {
  // ⚠ Each job's failure is caught independently — a broken story sweep must
  // never suppress the order-expiry pass sitting right below it, and vice
  // versa. A single try/catch around all four would have exactly that
  // coupling.
  try {
    const cleared = await sweepExpiredStories();
    console.log(`[food-sweep] stories: cleared ${cleared} expired, ephemeral (non-highlighted) post(s)`);
  } catch (err) {
    console.error("[food-sweep] stories tick failed", err);
  }

  try {
    const expired = await sweepExpiredOrders();
    console.log(`[food-sweep] orders: expired ${expired} unanswered PENDING request(s)`);
  } catch (err) {
    console.error("[food-sweep] order-expiry tick failed", err);
  }

  try {
    const nudged = await sweepOrderCompletionNudges();
    console.log(`[food-sweep] orders: nudged ${nudged} seller(s) toward marking a fulfilled order COMPLETED`);
  } catch (err) {
    console.error("[food-sweep] completion-nudge tick failed", err);
  }

  // PC-1 — thread retention. Runs on the same 5-minute tick as everything else
  // rather than on its own daily schedule: the job is a no-op on almost every
  // pass (its cutoff is 12 months), and a second scheduler would be more moving
  // parts than the work justifies. Its own try/catch, per the note above.
  try {
    const purged = await sweepIdleThreads();
    if (purged > 0) console.log(`[food-sweep] threads: purged ${purged} conversation(s) idle past retention`);
  } catch (err) {
    console.error("[food-sweep] thread-retention tick failed", err);
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");

  if (once) {
    await tick();
    await prisma.$disconnect();
    return;
  }

  console.log("[food-sweep] runner starting — running once immediately, then every 5 min");
  await tick();
  setInterval(tick, TICK_MS);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
