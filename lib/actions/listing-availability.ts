"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireOwnListing } from "@/lib/listing";
import { validateWindowInput, MAX_WINDOWS_PER_LISTING } from "@/lib/availability-window-form";
import type { SellerFormState } from "@/lib/actions/seller-form-state";

/**
 * `FoodAvailabilityWindow` CRUD — per-window, not a whole-array replace.
 *
 * ⚠ Per-window rather than resubmitting the whole set: each row independently
 * satisfies `food_availability_windows_fields_by_type` (Slice 2's CHECK), and
 * `validateWindowInput` mirrors that constraint field for field. Validating and
 * writing one window at a time keeps that mirroring exact — a batch replace
 * would need to re-derive the same per-row rule anyway, with more surface for
 * the two to drift apart.
 *
 * "Multiple windows per listing" (the brief's own words) is why this is
 * add-one/remove-one rather than edit-in-place: a seller building "weekdays"
 * and "weekend pre-order" as two windows adds each once and never revisits it,
 * which is the common case Slice 8's own seed models throughout the catalogue.
 */

function revalidateListingSurfaces(listingId: string, slug: string): void {
  revalidatePath("/food/listings");
  revalidatePath(`/food/listings/${listingId}`);
  revalidatePath(`/meals/${slug}`);
}

export async function addAvailabilityWindow(
  listingId: string,
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState> {
  const ctx = await requireOwnListing(listingId);
  if (!ctx) return { status: "error", error: "noListing" };

  const count = await prisma.foodAvailabilityWindow.count({ where: { listingId } });
  if (count >= MAX_WINDOWS_PER_LISTING) return { status: "error", error: "windowLimit" };

  const result = validateWindowInput({
    type: String(formData.get("type") ?? ""),
    days: formData.getAll("days").map((d) => Number(d)),
    startsOn: String(formData.get("startsOn") ?? ""),
    endsOn: String(formData.get("endsOn") ?? ""),
    leadTimeDays: String(formData.get("leadTimeDays") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  if (!result.ok) {
    const errorKey =
      result.error === "type"
        ? "windowType"
        : result.error === "days"
          ? "windowDays"
          : result.error === "dates"
            ? "windowDates"
            : result.error === "dateOrder"
              ? "windowDateOrder"
              : result.error === "leadTime"
                ? "windowLeadTime"
                : "windowNote";
    return { status: "error", error: errorKey };
  }

  await prisma.foodAvailabilityWindow.create({
    data: { listingId, ...result.window },
  });

  const row = await prisma.foodListing.findUniqueOrThrow({
    where: { id: listingId },
    select: { slug: true },
  });
  revalidateListingSurfaces(listingId, row.slug);
  return { status: "ok" };
}

export async function removeAvailabilityWindow(listingId: string, windowId: string): Promise<SellerFormState> {
  const ctx = await requireOwnListing(listingId);
  if (!ctx) return { status: "error", error: "noListing" };

  const window = await prisma.foodAvailabilityWindow.findFirst({
    where: { id: windowId, listingId },
    select: { id: true },
  });
  if (!window) return { status: "error", error: "unknown" };

  await prisma.foodAvailabilityWindow.delete({ where: { id: window.id } });

  const row = await prisma.foodListing.findUniqueOrThrow({
    where: { id: listingId },
    select: { slug: true },
  });
  revalidateListingSurfaces(listingId, row.slug);
  return { status: "ok" };
}
