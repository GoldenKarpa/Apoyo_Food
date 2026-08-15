import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, type RegionKey } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uniqueSellerSlug } from "@/lib/slug";
import { MAX_SPECIALTIES, MAX_SPECIALTY_LENGTH } from "@/lib/seller-profile";
import { authenticatePortalCaller } from "@/lib/ecosystem-inbound";

// AS-S6 — contract §8, `POST /api/ecosystem/v1/providers/onboarding-commit`.
//
// Portal calls this once, after an admin has accepted a provider application and
// the applicant has clicked the confirmation link. Food materialises its own
// seller record from the payload.
//
// ⚠ THE SELLER IS CREATED **ACTIVE**, not PENDING — and this is the one place in
// Food that does that. `onboardSeller` deliberately leaves status to the schema
// default because a self-registered cook has not been reviewed by anyone. A
// Portal-originated seller has: an admin read their application and their
// identity document before this call could happen, so re-queueing them behind
// Food's own Slice 16 approval queue would make one decision cost two waits,
// which is precisely what the onboarding rework removes
// (`Provider_Onboarding_Workflow.md` §1). Active is not the same as public —
// LC-1's `visibilityClass` defaults to REAL, so they stay hidden until Food's
// launch switch flips.
//
// ⚠ NO IDENTITY DOCUMENT ARRIVES HERE, EVER (contract §8 ruling 2). Portal is
// the sole system-of-record for it.
//
// Idempotency is keyed on `userId`, matching the contract and the table's own
// unique constraint. Portal retries with backoff, so redelivery is normal.

const payloadSchema = z.object({
  userId: z.string().min(1),
  vertical: z.string(),
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  locale: z.string().optional(),
  profilePhotoUrl: z.string().url().nullable().optional(),
  onboardingData: z.record(z.string(), z.unknown()).default({}),
});

/** The eight shared ecosystem region keys, which are Food's own `RegionKey`. */
const REGION_KEYS = new Set<string>([
  "north_west",
  "east_west_corridor",
  "central",
  "south_central",
  "south_west",
  "north_east",
  "south_east",
  "tobago",
]);

/**
 * §3.2's Food question — "specialties / food type", asked so an admin can see
 * what mix is accumulating in the marketplace. It maps straight onto this app's
 * own `specialties String[]`, so unlike Salon's categories it is worth keeping:
 * the seller arrives at setup with it already filled in.
 *
 * Re-validated here rather than trusted. Portal checks it against the shared
 * field registry, but a §8 endpoint is a service-token surface, and "the caller
 * already validated" is not a property this app can verify.
 */
function parseSpecialties(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.length <= MAX_SPECIALTY_LENGTH)
    .slice(0, MAX_SPECIALTIES);
}

export async function POST(req: NextRequest) {
  if (!authenticatePortalCaller(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }
  const payload = parsed.data;

  // §8: "must reject a `vertical` value that isn't its own."
  if (payload.vertical !== "FOOD") {
    return NextResponse.json({ error: "Wrong vertical for this app" }, { status: 422 });
  }

  const existing = await prisma.foodSeller.findUnique({
    where: { userId: payload.userId },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ providerId: existing.id, alreadyExisted: true }, { status: 200 });
  }

  const region = payload.onboardingData.region;
  // Seeding one area is safe: "at least one area" is an activation-time rule
  // here, not a row-creation rule (see `FoodSeller.areas`), and the seller can
  // change or extend it during setup.
  const areas: RegionKey[] =
    typeof region === "string" && REGION_KEYS.has(region) ? [region as RegionKey] : [];
  const bio = typeof payload.onboardingData.bio === "string" ? payload.onboardingData.bio : null;
  const specialties = parseSpecialties(payload.onboardingData.specialties);

  // Same retry shape as `onboardSeller`: `uniqueSellerSlug` is a check-then-write,
  // so two creations of the same display name can be handed the same free slug.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const slug = await uniqueSellerSlug(payload.displayName);
    try {
      const seller = await prisma.foodSeller.create({
        data: {
          userId: payload.userId,
          slug,
          displayName: payload.displayName,
          email: payload.email,
          bio,
          areas,
          specialties,
          // See the header — reviewed once, by Portal's admin.
          status: "ACTIVE",
        },
        select: { id: true },
      });
      return NextResponse.json({ providerId: seller.id }, { status: 201 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = (e.meta?.target as string[] | undefined) ?? [];
        // A `user_id` collision means a concurrent redelivery already created the
        // row — the idempotent outcome, not a slug clash to retry.
        if (target.includes("user_id") || target.includes("userId")) {
          const raced = await prisma.foodSeller.findUnique({
            where: { userId: payload.userId },
            select: { id: true },
          });
          if (raced) {
            return NextResponse.json(
              { providerId: raced.id, alreadyExisted: true },
              { status: 200 }
            );
          }
        }
        continue; // slug clash — pick the next free suffix
      }
      console.error("[onboarding-commit] food seller create failed:", e);
      return NextResponse.json({ error: "Commit failed" }, { status: 500 });
    }
  }

  // Every slug attempt collided. A 500 (not a 4xx) is deliberate: Portal treats
  // 4xx as permanent and stops retrying, and this is exactly the transient
  // contention a retry would clear.
  return NextResponse.json({ error: "Could not allocate a shop address" }, { status: 500 });
}
