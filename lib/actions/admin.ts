"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin, ensureFoodProviderMembership } from "@/lib/auth-guards";
import { decideSellerLifecycleAction, type SellerLifecycleAction } from "@/lib/admin-sellers";
import { uniqueCategorySlug } from "@/lib/slug";
import { MAX_CATEGORY_NAME_LENGTH } from "@/lib/category-form";
import type { SellerFormState } from "@/lib/actions/seller-form-state";

/**
 * Slice 16's admin writes. Every action re-checks `requireAdmin()` itself — a
 * Server Action is a public POST endpoint, and the layout gate only controls
 * what a non-admin SEES (`lib/auth-guards.ts`'s own payload-guard warning).
 */

type ActionResult = { ok: true } | { ok: false; reason: string };

// ── Seller lifecycle ─────────────────────────────────────────────────────────

export type { SellerLifecycleAction as SellerAction } from "@/lib/admin-sellers";

/**
 * ⚠ `approve` re-confirms `(FOOD, PROVIDER)` membership before flipping the
 * row, the same correctness requirement Apparel's Slice 16 named for itself.
 * Food's own onboarding already mints this membership at submit time (Slice
 * 13) and `loadSellerWorkspace` self-heals it on every dashboard render — but
 * a seller who never opens the dashboard again after submitting could reach
 * this queue with the mint still missing, and `requireFoodSeller()` checks
 * BOTH the row's status AND an ACTIVE membership. Approving without this call
 * would flip the row to ACTIVE while leaving the seller unable to actually
 * use the workspace they were just approved for.
 */
export async function updateSellerStatus(sellerId: string, action: SellerLifecycleAction): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, reason: "unauthorized" };

  const seller = await prisma.foodSeller.findUnique({
    where: { id: sellerId },
    include: { photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  if (!seller) return { ok: false, reason: "noSellerAdmin" };

  const decision = decideSellerLifecycleAction(seller, action);
  if (!decision.ok) return { ok: false, reason: decision.reason };

  if (action === "approve") {
    await ensureFoodProviderMembership(seller.userId);
  }

  await prisma.foodSeller.update({ where: { id: sellerId }, data: { status: decision.status } });

  revalidatePath("/food/admin");
  return { ok: true };
}

// ── Listing takedown ─────────────────────────────────────────────────────────

/**
 * Standalone admin takedown — no report required. Sets `takenDownAt`, a
 * SEPARATE gate from the seller's own `active` pause switch (`lib/discovery.ts`
 * requires both clear). Never deletes: `FoodOrderItem.listing` is
 * `onDelete: Restrict` (Part D), and a takedown is a visibility change, not a
 * request to destroy evidence.
 */
export async function takedownListing(listingId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, reason: "unauthorized" };

  const listing = await prisma.foodListing.findUnique({ where: { id: listingId }, select: { id: true, slug: true } });
  if (!listing) return { ok: false, reason: "noListing" };

  await prisma.foodListing.update({ where: { id: listingId }, data: { takenDownAt: new Date() } });

  revalidatePath("/food/admin");
  revalidatePath("/food/listings");
  revalidatePath(`/food/listings/${listingId}`);
  revalidatePath(`/meals/${listing.slug}`);
  return { ok: true };
}

// ── Report queue ─────────────────────────────────────────────────────────────

export type ReportResolution = "dismiss" | "takedown";

export async function resolveReport(reportId: string, resolution: ReportResolution): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, reason: "unauthorized" };

  const report = await prisma.foodReport.findUnique({
    where: { id: reportId },
    select: { id: true, listingId: true, status: true },
  });
  if (!report) return { ok: false, reason: "noReport" };
  if (report.status !== "OPEN") return { ok: false, reason: "invalidTransition" };

  await prisma.$transaction([
    prisma.foodReport.update({
      where: { id: reportId },
      data: { status: resolution === "takedown" ? "RESOLVED" : "DISMISSED", resolvedAt: new Date() },
    }),
    ...(resolution === "takedown" && report.listingId
      ? [prisma.foodListing.update({ where: { id: report.listingId }, data: { takenDownAt: new Date() } })]
      : []),
  ]);

  revalidatePath("/food/admin");
  if (resolution === "takedown" && report.listingId) {
    revalidatePath("/food/listings");
    revalidatePath(`/food/listings/${report.listingId}`);
  }
  return { ok: true };
}

// ── Category manager ─────────────────────────────────────────────────────────

// Return `SellerFormState`, not the plain `ActionResult` the actions above
// use — these two are driven by `useActionState` in `<CategoryForm>`
// (`components/admin/category-form.tsx`), matching Food's own established
// form idiom (`<FieldForm>` and every Slice 14/15 form) rather than a bare
// `<form action={...}>` with no inline error feedback.

function validateCategoryNames(nameEn: string, nameEs: string): SellerFormState | null {
  if (nameEn.trim().length === 0 || nameEn.trim().length > MAX_CATEGORY_NAME_LENGTH) {
    return { status: "error", error: "categoryNameEn" };
  }
  if (nameEs.trim().length === 0 || nameEs.trim().length > MAX_CATEGORY_NAME_LENGTH) {
    return { status: "error", error: "categoryNameEs" };
  }
  return null;
}

export async function createCategory(_prev: SellerFormState, formData: FormData): Promise<SellerFormState> {
  const admin = await requireAdmin();
  if (!admin) return { status: "error", error: "unknown" };

  const nameEn = String(formData.get("nameEn") ?? "").trim();
  const nameEs = String(formData.get("nameEs") ?? "").trim();
  const seasonal = formData.get("seasonal") === "on";

  const invalid = validateCategoryNames(nameEn, nameEs);
  if (invalid) return invalid;

  let createdId: string | null = null;
  // Same check-then-write retry as `uniqueListingSlug`'s callers — two
  // categories named identically in the same instant can both be handed the
  // same free slug.
  for (let attempt = 0; attempt < 4 && !createdId; attempt += 1) {
    const slug = await uniqueCategorySlug(nameEn);
    try {
      const created = await prisma.foodCategory.create({
        data: { slug, nameEn, nameEs, seasonal },
        select: { id: true },
      });
      createdId = created.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  if (!createdId) return { status: "error", error: "categorySlug" };

  revalidatePath("/food/admin");
  revalidatePath("/");
  return { status: "ok" };
}

export async function updateCategory(
  categoryId: string,
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState> {
  const admin = await requireAdmin();
  if (!admin) return { status: "error", error: "unknown" };

  const existing = await prisma.foodCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!existing) return { status: "error", error: "noCategory" };

  const nameEn = String(formData.get("nameEn") ?? "").trim();
  const nameEs = String(formData.get("nameEs") ?? "").trim();
  const seasonal = formData.get("seasonal") === "on";

  const invalid = validateCategoryNames(nameEn, nameEs);
  if (invalid) return invalid;

  await prisma.foodCategory.update({ where: { id: categoryId }, data: { nameEn, nameEs, seasonal } });

  revalidatePath("/food/admin");
  revalidatePath("/");
  return { status: "ok" };
}
