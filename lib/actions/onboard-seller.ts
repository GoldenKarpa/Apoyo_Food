"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getFoodSession } from "@/lib/session";
import { ensureFoodProviderMembership } from "@/lib/auth-guards";
import { uniqueSellerSlug } from "@/lib/slug";
import { MAX_DISPLAY_NAME_LENGTH, MIN_DISPLAY_NAME_LENGTH } from "@/lib/seller-profile";
import type { SellerFormState } from "@/lib/actions/seller-form-state";

/**
 * Seller registration — the one action that brings a `FoodSeller` into
 * existence, together with its `(FOOD, PROVIDER)` ecosystem standing.
 *
 * ── Why this, and not Portal's provider-registration surface ──
 * Architecture F2 describes onboarding as "provider registration (Portal
 * surface, decision 14)". Decision 15 then retired every registration-time
 * provider path in the identity app, and B1 records the consequence: the
 * `vertical_registration_config` row gates **CTA visibility only**, and "real
 * gating happens at Food's own onboarding-submit". This function IS that gate.
 *
 * What it actually gates, stated plainly so a later slice does not assume more:
 * any authenticated ecosystem account may become a Food seller, and does so as
 * `PENDING` — invisible to every buyer surface (`lib/discovery.ts`'s
 * `DISCOVERABLE` requires an ACTIVE seller, and `/sellers/[slug]` 404s
 * otherwise) until an admin approves it in Slice 16. The toggle is deliberately
 * NOT consulted here: decision 15 says it is not a security control, and
 * consulting it would quietly make it one again.
 *
 * ── Write order: seller row FIRST, membership SECOND ──
 * The obvious order is the wrong one. Minting standing first and then failing
 * the row write leaves `(FOOD, PROVIDER)` with no seller record — the
 * ghost-provider state decision 15 exists to prevent, invisible to every
 * surface that reads the local table. This way round, a failure leaves a
 * `PENDING` row with no standing, which grants access to nothing, is retried on
 * the next dashboard render, and is repaired by re-submitting. (Apparel reached
 * the same conclusion in its own Slice 13; recorded here because the reasoning
 * is what transfers, not the ordering.)
 *
 * ⚠ Consequence for Slice 16, inherited verbatim: approval must confirm the
 * membership exists before flipping a seller to ACTIVE. An ACTIVE row whose
 * mint never landed is the one combination that locks a seller out of their own
 * dashboard — `requireFoodSeller` demands both.
 */

const onboardSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(MIN_DISPLAY_NAME_LENGTH)
    .max(MAX_DISPLAY_NAME_LENGTH),
});

export async function onboardSeller(
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState> {
  const session = await getFoodSession();
  if (!session) return { status: "error", error: "signedOut" };

  const parsed = onboardSchema.safeParse({ displayName: formData.get("displayName") });
  if (!parsed.success) return { status: "error", error: "displayName" };
  const { displayName } = parsed.data;

  // Idempotent by design. Re-submitting (a double tap, a retried request, a
  // seller returning to /food/onboarding by hand) must never mint a second
  // kitchen — `userId` is unique on the table, so the second row could not
  // exist anyway; this makes the outcome a success rather than a P2002.
  const existing = await prisma.foodSeller.findUnique({ where: { userId: session.userId } });
  if (existing) {
    // Repair path for the failure mode described above: the row landed, the
    // mint did not. Nothing about it is specific to a retry — it is simply free
    // to re-assert here.
    await ensureFoodProviderMembership(session.userId);
    revalidatePath("/food");
    return { status: "ok" };
  }

  let created = false;
  // Retries exist for the check-then-write race in `uniqueSellerSlug`, not for
  // general flakiness: two kitchens registering the same name in the same
  // instant can both be handed the same free slug, and the loser sees P2002.
  for (let attempt = 0; attempt < 4 && !created; attempt += 1) {
    const slug = await uniqueSellerSlug(displayName);
    try {
      await prisma.foodSeller.create({
        data: {
          userId: session.userId,
          slug,
          displayName,
          // `status` is left to the schema default (PENDING) rather than
          // written explicitly — one place decides what a new seller is.
        },
      });
      created = true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = (e.meta?.target as string[] | undefined) ?? [];
        // A `userId` collision means a concurrent request already created this
        // seller's row — that is success, not a slug clash to retry.
        if (target.includes("user_id") || target.includes("userId")) {
          created = true;
          break;
        }
        continue; // slug clash — pick the next free suffix
      }
      throw e;
    }
  }

  if (!created) return { status: "error", error: "slug" };

  // Non-fatal on purpose: see the write-order note above. The seller reaches a
  // working PENDING dashboard either way, and the dashboard re-asserts standing
  // on every render until it lands.
  await ensureFoodProviderMembership(session.userId);

  revalidatePath("/food");
  return { status: "ok" };
}
