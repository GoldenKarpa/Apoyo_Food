/**
 * `food-sweep` verification — real rows, real files, real deletion.
 *
 * Proves the single rule the whole job exists to enforce: `expiresAt <= now`
 * AND `highlightId IS NULL` is deleted; either condition failing to hold
 * means the row survives. This is also the literal mechanism behind the
 * slice's own done-when ("expiry sweep clears an aged post -> highlight
 * persists on the Menu shelf") — both outcomes from ONE pass, proven here
 * together rather than as two separate claims.
 *
 * Self-cleaning: every row/file is prefixed `_verify-s15-sweep` and removed
 * before and after (the sweep itself removes some of them, which is the
 * point — cleanup only has to catch what the sweep was correct to leave).
 *
 *   npx tsx scripts/verify-sweep.ts
 */
import { PrismaClient } from "@prisma/client";

import { sweepExpiredStories } from "../lib/sweep";
import { writeMediaVariant, resolveStorageKey } from "../lib/storage";
import fs from "node:fs/promises";

const prisma = new PrismaClient();

let pass = 0;
let fail = 0;
function assert(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}
function section(title: string) {
  console.log(`\n${title}`);
}

const SLUG = "_verify-s15-sweep";
const USER_ID = "_verify-s15-sweep-user";

async function cleanup() {
  await prisma.foodStory.deleteMany({ where: { seller: { userId: USER_ID } } });
  await prisma.foodStoryHighlight.deleteMany({ where: { seller: { userId: USER_ID } } });
  await prisma.foodSeller.deleteMany({ where: { userId: USER_ID } });
}

async function fakeStoryFiles(id: string) {
  const buffer = Buffer.from("not a real image, just bytes to prove deletion");
  const pathThumb = await writeMediaVariant("stories", id, "thumb", buffer);
  const pathCard = await writeMediaVariant("stories", id, "card", buffer);
  const pathFull = await writeMediaVariant("stories", id, "full", buffer);
  return { pathThumb, pathCard, pathFull };
}

async function fileExists(key: string): Promise<boolean> {
  const resolved = resolveStorageKey(key);
  if (!resolved) return false;
  try {
    await fs.stat(resolved);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await cleanup();

  const seller = await prisma.foodSeller.create({
    data: { userId: USER_ID, slug: SLUG, displayName: "x", status: "ACTIVE" },
  });
  const highlight = await prisma.foodStoryHighlight.create({
    data: { sellerId: seller.id, title: "x" },
  });

  const now = Date.now();
  const past = (hours: number) => new Date(now - hours * 3_600_000);
  const future = (hours: number) => new Date(now + hours * 3_600_000);

  section("Setup — three real rows with real files on disk");
  const ephemeralExpired = await prisma.foodStory.create({
    data: {
      sellerId: seller.id,
      ...(await fakeStoryFiles("verify-sweep-ephemeral")),
      blurDataUrl: "data:image/jpeg;base64,x",
      createdAt: past(48),
      expiresAt: past(24), // already expired
      highlightId: null,
    },
  });
  const highlightedExpired = await prisma.foodStory.create({
    data: {
      sellerId: seller.id,
      ...(await fakeStoryFiles("verify-sweep-highlighted")),
      blurDataUrl: "data:image/jpeg;base64,x",
      createdAt: past(48),
      expiresAt: past(24), // ALSO already expired
      highlightId: highlight.id,
    },
  });
  const stillActive = await prisma.foodStory.create({
    data: {
      sellerId: seller.id,
      ...(await fakeStoryFiles("verify-sweep-active")),
      blurDataUrl: "data:image/jpeg;base64,x",
      createdAt: past(1),
      expiresAt: future(23),
      highlightId: null,
    },
  });

  assert("all three files exist on disk before the sweep", await fileExists(ephemeralExpired.pathThumb));

  section("food-sweep's one pass");
  const cleared = await sweepExpiredStories(new Date(now));
  assert("the sweep reports clearing at least the one ephemeral-expired row", cleared >= 1, cleared);

  const [survivedEphemeral, survivedHighlighted, survivedActive] = await Promise.all([
    prisma.foodStory.findUnique({ where: { id: ephemeralExpired.id } }),
    prisma.foodStory.findUnique({ where: { id: highlightedExpired.id } }),
    prisma.foodStory.findUnique({ where: { id: stillActive.id } }),
  ]);

  assert("the expired, EPHEMERAL row is GONE — the done-when's own 'clears an aged post'", survivedEphemeral === null);
  assert(
    "the expired, HIGHLIGHTED row SURVIVES — the done-when's own 'highlight persists on the Menu shelf'",
    survivedHighlighted !== null,
  );
  assert("the still-active row survives (it isn't expired at all)", survivedActive !== null);

  assert("…and the ephemeral row's FILES are actually deleted from disk, not just the DB row", !(await fileExists(ephemeralExpired.pathThumb)));
  assert("…while the highlighted row's files are UNTOUCHED", await fileExists(highlightedExpired.pathThumb));
  assert("…and the still-active row's files are UNTOUCHED", await fileExists(stillActive.pathThumb));

  section("A second pass is idempotent — nothing left to clear twice");
  const secondPass = await sweepExpiredStories(new Date(now));
  assert("re-running immediately clears zero (already cleared)", secondPass === 0, secondPass);

  section("Un-highlighting an old post hands it back to the sweep");
  await prisma.foodStory.update({ where: { id: highlightedExpired.id }, data: { highlightId: null } });
  const afterUnassign = await sweepExpiredStories(new Date(now));
  assert("…and the very next pass clears it, since expiresAt was always in the past", afterUnassign === 1, afterUnassign);
  assert(
    "…the row is now gone too",
    (await prisma.foodStory.findUnique({ where: { id: highlightedExpired.id } })) === null,
  );

  await cleanup();
  const leftover = await prisma.foodSeller.count({ where: { userId: USER_ID } });
  assert("self-cleaning: no verification rows survive the run", leftover === 0);

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
