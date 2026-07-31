/**
 * Deterministic RNG for the demo seed.
 *
 * ⚠ **A single `Math.random()` anywhere in `prisma/seed-data/` silently breaks
 * the seed's idempotency property**, and it breaks it in the worst way: the run
 * still succeeds, the row counts still match, and only a content hash taken
 * across two runs would ever show it. Every generated value in this tree must
 * be a pure function of the fixed seed below.
 *
 * mulberry32 — 32-bit, no dependencies, well-distributed enough for choosing
 * follower counts and shuffling a photo pool.
 */

export const SEED_VALUE = 0x466f6f64; // "Food"

export function makeRng(seed: number = SEED_VALUE) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = ReturnType<typeof makeRng>;

/**
 * A **per-entity** RNG stream, seeded from a label.
 *
 * ⚠ This exists because of a real defect, and the defect is worth understanding
 * before anyone "simplifies" it back to one shared stream.
 *
 * The seeder originally threaded a single `Rng` through the whole run. That is
 * deterministic only if every run makes the *same sequence* of draws — and it
 * does not: photos are ingested on CREATE only, so a re-run skips the
 * `amateur`/`wantsSecond`/degrade draws entirely and every downstream consumer
 * silently receives different numbers. The follow/save phase then generated a
 * different scatter than the first run had, and collided on a primary key it
 * had derived from a loop index.
 *
 * Deriving a stream from a stable label instead makes each entity's numbers a
 * pure function of *that entity's identity*, so they cannot be shifted by what
 * some earlier entity did or skipped. Order-independent and presence-independent.
 */
export function rngFor(label: string): Rng {
  let hash = 0x811c9dc5;
  for (let i = 0; i < label.length; i += 1) {
    hash ^= label.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return makeRng((hash ^ SEED_VALUE) >>> 0);
}

/** Integer in [min, max], inclusive. */
export function intBetween(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** Fisher-Yates on a copy, so the caller's array is never reordered. */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A stable pseudo-identity for a demo buyer.
 *
 * `FoodFollow.userId` / `FoodSave.userId` / `FoodStoryView.userId` are opaque
 * identity-store ids with no cross-DB relation (Part D), so the seed can mint
 * its own without touching the identity database — which it must never do.
 * The `seed-user-` prefix is what makes these removable in one command
 * alongside everything else this file's data creates.
 */
export function demoUserId(index: number): string {
  return `seed-user-${String(index).padStart(3, "0")}`;
}
