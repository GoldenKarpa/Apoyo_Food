"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireOwnSeller } from "@/lib/seller";
import { isRegionKey } from "@/lib/regions";
import {
  isFulfillmentMode,
  isSellerLanguage,
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_SELLER_AREAS,
  MAX_SPECIALTIES,
  MAX_SPECIALTY_LENGTH,
  MIN_DISPLAY_NAME_LENGTH,
} from "@/lib/seller-profile";
import type { SellerFormState } from "@/lib/actions/seller-form-state";

/**
 * The profile editor's writes — one action per field group, shared by the
 * guided setup wizard and the always-available editor at `/food/profile`.
 *
 * ⚠ **One implementation, two surfaces.** The wizard is a presentation of these
 * actions, not a second code path: a step saves through exactly the same
 * function the editor calls, so "resume the wizard" and "edit later" cannot
 * drift into validating differently. That is also why every action writes
 * immediately rather than accumulating a draft — architecture F2's
 * "skippable-and-resumable, never force completeness before value" is only true
 * if leaving mid-flow has already saved what was entered.
 *
 * ⚠ **Ownership comes from the session, never from the form.** Every action
 * calls `requireOwnSeller()`, which resolves the row by `userId` from the
 * decoded JWT. There is no seller-id parameter anywhere in this file, so
 * "update someone else's kitchen" is not a request that can be expressed.
 *
 * ⚠ **`status` is never written here.** A seller editing their bio must not
 * knock themselves back to PENDING, and a SUSPENDED seller must not be able to
 * clear a suspension by re-running setup. Only Slice 16's approval queue moves
 * that column. (Apparel's own Slice 13 records the same rule after excluding
 * `status` from its upsert's update branch.)
 *
 * ⚠ **No address field exists, here or anywhere** (architecture Part G, the
 * highest-stakes privacy rule in this product): a profile exposes AREA only,
 * because pickup means a customer visiting someone's home kitchen. The exact
 * location is exchanged in an accepted order's thread, which Slice 18 builds.
 * If a future slice is tempted to add "street address" to this form, that is
 * the rule it would be breaking.
 */

/** Both surfaces re-render off the same paths after any write. */
function revalidateSellerSurfaces(slug: string): void {
  revalidatePath("/food");
  revalidatePath("/food/profile");
  revalidatePath("/food/profile/setup");
  // The public profile reads the same row (Slice 11).
  revalidatePath(`/sellers/${slug}`);
}

export async function updateSellerBio(
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState> {
  const ctx = await requireOwnSeller();
  if (!ctx) return { status: "error", error: "noSeller" };

  const parsed = z.string().trim().max(MAX_BIO_LENGTH).safeParse(formData.get("bio") ?? "");
  if (!parsed.success) return { status: "error", error: "bio" };

  await prisma.foodSeller.update({
    where: { id: ctx.seller.id },
    // Empty clears the field rather than storing "" — `isStepDone` and every
    // read treats null as "not written", and two representations of the same
    // absence is how a completion model starts lying.
    data: { bio: parsed.data.length > 0 ? parsed.data : null },
  });
  revalidateSellerSurfaces(ctx.seller.slug);
  return { status: "ok" };
}

export async function updateSellerAreas(
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState> {
  const ctx = await requireOwnSeller();
  if (!ctx) return { status: "error", error: "noSeller" };

  const raw = formData.getAll("areas").map(String).filter(Boolean);
  const areas = Array.from(new Set(raw)).filter(isRegionKey);
  // Re-checked server-side even though `<RegionMap max={3}>` already refuses a
  // fourth: the client cap is an affordance, and the DB's own
  // `food_sellers_areas_max_three` CHECK would reject this as an unhandled
  // 500 rather than a form error (Slice 2: a CHECK violation arrives with no
  // usable `.code` at all).
  if (areas.length !== raw.length || areas.length > MAX_SELLER_AREAS) {
    return { status: "error", error: "areas" };
  }

  await prisma.foodSeller.update({ where: { id: ctx.seller.id }, data: { areas } });
  revalidateSellerSurfaces(ctx.seller.slug);
  return { status: "ok" };
}

export async function updateSellerLanguages(
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState> {
  const ctx = await requireOwnSeller();
  if (!ctx) return { status: "error", error: "noSeller" };

  const raw = formData.getAll("languages").map(String).filter(Boolean);
  const languages = Array.from(new Set(raw)).filter(isSellerLanguage);
  if (languages.length !== new Set(raw).size) return { status: "error", error: "languages" };

  await prisma.foodSeller.update({ where: { id: ctx.seller.id }, data: { languages } });
  revalidateSellerSurfaces(ctx.seller.slug);
  return { status: "ok" };
}

export async function updateSellerSpecialties(
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState> {
  const ctx = await requireOwnSeller();
  if (!ctx) return { status: "error", error: "noSeller" };

  const specialties = Array.from(
    new Set(
      formData
        .getAll("specialties")
        .map((v) => String(v).trim())
        .filter(Boolean),
    ),
  );
  if (
    specialties.length > MAX_SPECIALTIES ||
    specialties.some((s) => s.length > MAX_SPECIALTY_LENGTH)
  ) {
    return { status: "error", error: "specialties" };
  }

  await prisma.foodSeller.update({ where: { id: ctx.seller.id }, data: { specialties } });
  revalidateSellerSurfaces(ctx.seller.slug);
  return { status: "ok" };
}

export async function updateSellerFulfillment(
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState> {
  const ctx = await requireOwnSeller();
  if (!ctx) return { status: "error", error: "noSeller" };

  const raw = formData.getAll("fulfillmentModes").map(String).filter(Boolean);
  const modes = Array.from(new Set(raw)).filter(isFulfillmentMode);
  if (modes.length !== new Set(raw).size) return { status: "error", error: "fulfillment" };

  await prisma.foodSeller.update({
    where: { id: ctx.seller.id },
    data: { fulfillmentModes: modes },
  });
  revalidateSellerSurfaces(ctx.seller.slug);
  return { status: "ok" };
}

/**
 * Renaming the kitchen. ⚠ The SLUG IS NOT REGENERATED — `/sellers/<slug>` is a
 * buyer-facing URL a cook pastes into WhatsApp, and rotating it would silently
 * break every link they have already shared (see lib/slug.ts). Only Slice 16's
 * admin surface should ever be given the power to move a slug, and only
 * deliberately.
 */
export async function updateSellerDisplayName(
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState> {
  const ctx = await requireOwnSeller();
  if (!ctx) return { status: "error", error: "noSeller" };

  const parsed = z
    .string()
    .trim()
    .min(MIN_DISPLAY_NAME_LENGTH)
    .max(MAX_DISPLAY_NAME_LENGTH)
    .safeParse(formData.get("displayName"));
  if (!parsed.success) return { status: "error", error: "displayName" };

  await prisma.foodSeller.update({
    where: { id: ctx.seller.id },
    data: { displayName: parsed.data },
  });
  revalidateSellerSurfaces(ctx.seller.slug);
  return { status: "ok" };
}
