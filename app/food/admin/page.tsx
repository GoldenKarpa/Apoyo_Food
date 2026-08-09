import { getTranslations } from "next-intl/server";

import { AdminActionButton } from "@/components/admin/admin-action-button";
import { CategoryForm } from "@/components/admin/category-form";
import { FoodImage } from "@/components/food-image";
import { adminMayLoadData } from "@/lib/auth-guards";
import { getOrderingEnabled } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Food administration" };
export const dynamic = "force-dynamic";

/**
 * Slice 16 — the admin surface: seller approval queue, listing takedown,
 * report/flag intake, and the category manager. One page with sections,
 * mirroring Apparel's own admin page shape (itself mirroring Salon's,
 * UAS-S3's worked example) rather than splitting into many sub-routes —
 * decision 8's "clear and useful beats beautiful" bar, and this is genuinely
 * a small amount of data (Slice 8 seeds 13 sellers).
 *
 * ⚠ `adminMayLoadData()` is called ABOVE every query below, not just once at
 * the top — the layout gate controls what is *displayed*, not what
 * *executes* (a page under a denying layout still runs its queries and ships
 * the rows in the RSC payload; this was a real, live leak in Portal). This
 * page returns `null` immediately when it's false, so nothing after it ever
 * runs.
 */
export default async function FoodAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  if (!(await adminMayLoadData())) return null;

  const { q } = await searchParams;
  const searchTerm = q?.trim() ?? "";

  const [t, tv, orderingEnabled, pendingSellers, activeSellers, suspendedSellers, openReports, categories, searchResults] =
    await Promise.all([
      getTranslations("seller.admin"),
      getTranslations("seller.admin.vocab"),
      getOrderingEnabled(),
      prisma.foodSeller.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
      prisma.foodSeller.findMany({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } }),
      prisma.foodSeller.findMany({ where: { status: "SUSPENDED" }, orderBy: { createdAt: "asc" } }),
      prisma.foodReport.findMany({
        where: { status: "OPEN" },
        include: {
          listing: { select: { id: true, title: true, takenDownAt: true } },
          seller: { select: { displayName: true, slug: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.foodCategory.findMany({ orderBy: { sortOrder: "asc" } }),
      searchTerm
        ? prisma.foodListing.findMany({
            where: { takenDownAt: null, title: { contains: searchTerm, mode: "insensitive" } },
            include: {
              seller: { select: { displayName: true, slug: true } },
              photos: { orderBy: { sortOrder: "asc" }, take: 1 },
            },
            take: 20,
            orderBy: { createdAt: "desc" },
          })
        : [],
    ]);

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>{t("title")}</h1>

      <section className="admin-section">
        <h2>{t("ordering.heading")}</h2>
        <div className="admin-card">
          <div className="admin-card-row">
            <div>
              <p style={{ fontWeight: 600 }}>
                {t("ordering.status")}{" "}
                <span className={orderingEnabled ? "admin-badge admin-badge-live" : "admin-badge admin-badge-open"}>
                  {orderingEnabled ? t("ordering.enabledLabel") : t("ordering.disabledLabel")}
                </span>
              </p>
              <p className="admin-muted">{t("ordering.description")}</p>
            </div>
            {orderingEnabled ? (
              <AdminActionButton
                label={t("ordering.pause")}
                variant="danger"
                confirmMessage={t("ordering.pauseConfirm")}
                errorLabel={t("ordering.actionError")}
                spec={{ kind: "ordering", enabled: false }}
              />
            ) : (
              <AdminActionButton
                label={t("ordering.enable")}
                variant="primary"
                errorLabel={t("ordering.actionError")}
                spec={{ kind: "ordering", enabled: true }}
              />
            )}
          </div>
        </div>
      </section>

      <section className="admin-section">
        <h2>{t("sellers.pendingHeading", { count: pendingSellers.length })}</h2>
        {pendingSellers.length === 0 ? (
          <p className="admin-empty">{t("sellers.pendingEmpty")}</p>
        ) : (
          pendingSellers.map((seller) => (
            <div key={seller.id} className="admin-card">
              <div className="admin-card-row">
                <div>
                  <p style={{ fontWeight: 600 }}>{seller.displayName}</p>
                  <p className="admin-muted">{seller.areas.map((a) => tv(`region.${a}`)).join(", ") || t("sellers.noAreas")}</p>
                </div>
                <div className="admin-actions">
                  <AdminActionButton
                    label={t("sellers.approve")}
                    variant="primary"
                    errorLabel={t("sellers.actionError")}
                    spec={{ kind: "seller", sellerId: seller.id, sellerAction: "approve" }}
                  />
                  <AdminActionButton
                    label={t("sellers.suspend")}
                    variant="danger"
                    confirmMessage={t("sellers.suspendConfirm", { name: seller.displayName })}
                    errorLabel={t("sellers.actionError")}
                    spec={{ kind: "seller", sellerId: seller.id, sellerAction: "suspend" }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="admin-section">
        <h2>{t("sellers.activeHeading", { count: activeSellers.length })}</h2>
        {activeSellers.length === 0 ? (
          <p className="admin-empty">{t("sellers.activeEmpty")}</p>
        ) : (
          activeSellers.map((seller) => (
            <div key={seller.id} className="admin-card">
              <div className="admin-card-row">
                <span>{seller.displayName}</span>
                <AdminActionButton
                  label={t("sellers.suspend")}
                  variant="danger"
                  confirmMessage={t("sellers.suspendConfirm", { name: seller.displayName })}
                  errorLabel={t("sellers.actionError")}
                  spec={{ kind: "seller", sellerId: seller.id, sellerAction: "suspend" }}
                />
              </div>
            </div>
          ))
        )}
      </section>

      <section className="admin-section">
        <h2>{t("sellers.suspendedHeading", { count: suspendedSellers.length })}</h2>
        {suspendedSellers.length === 0 ? (
          <p className="admin-empty">{t("sellers.suspendedEmpty")}</p>
        ) : (
          suspendedSellers.map((seller) => (
            <div key={seller.id} className="admin-card">
              <div className="admin-card-row">
                <span>{seller.displayName}</span>
                <AdminActionButton
                  label={t("sellers.reinstate")}
                  variant="primary"
                  errorLabel={t("sellers.actionError")}
                  spec={{ kind: "seller", sellerId: seller.id, sellerAction: "reinstate" }}
                />
              </div>
            </div>
          ))
        )}
      </section>

      <section className="admin-section">
        <h2>{t("reports.heading", { count: openReports.length })}</h2>
        {openReports.length === 0 ? (
          <p className="admin-empty">{t("reports.empty")}</p>
        ) : (
          openReports.map((report) => (
            <div key={report.id} className="admin-card">
              <div className="admin-card-row">
                <div>
                  <p style={{ fontWeight: 600 }}>
                    {report.listing ? report.listing.title : t("reports.listingGone")}
                    {report.listing?.takenDownAt ? (
                      <span className="admin-badge admin-badge-open" style={{ marginLeft: "0.5rem" }}>
                        {t("takedown.badge")}
                      </span>
                    ) : null}
                  </p>
                  <p className="admin-muted">
                    {t("reports.byLine", { seller: report.seller.displayName, reason: tv(`reportReason.${report.reason}`) })}
                  </p>
                  {report.message && <p className="admin-muted">&ldquo;{report.message}&rdquo;</p>}
                </div>
                <div className="admin-actions">
                  <AdminActionButton
                    label={t("reports.takedown")}
                    variant="danger"
                    confirmMessage={t("reports.takedownConfirm")}
                    errorLabel={t("reports.actionError")}
                    spec={{ kind: "report", reportId: report.id, resolution: "takedown" }}
                  />
                  <AdminActionButton
                    label={t("reports.dismiss")}
                    errorLabel={t("reports.actionError")}
                    spec={{ kind: "report", reportId: report.id, resolution: "dismiss" }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="admin-section">
        <h2>{t("takedown.heading")}</h2>
        <form action="/food/admin" method="GET" style={{ marginBottom: "1rem" }}>
          <input
            type="text"
            name="q"
            defaultValue={searchTerm}
            placeholder={t("takedown.searchPlaceholder")}
            className="admin-input"
            style={{ width: "100%", maxWidth: "24rem" }}
          />
        </form>
        {searchTerm && searchResults.length === 0 && <p className="admin-empty">{t("takedown.noResults")}</p>}
        {searchResults.map((listing) => {
          const photo = listing.photos[0];
          return (
            <div key={listing.id} className="admin-card">
              <div className="admin-card-row">
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  {photo && (
                    <div style={{ width: "3rem", flexShrink: 0 }}>
                      <FoodImage
                        src={photo.pathThumb}
                        alt=""
                        aspect="thumb"
                        blurDataUrl={photo.blurDataUrl}
                        sizes="48px"
                        surface="seller"
                      />
                    </div>
                  )}
                  <div>
                    <p style={{ fontWeight: 600 }}>{listing.title}</p>
                    <p className="admin-muted">{listing.seller.displayName}</p>
                  </div>
                </div>
                <AdminActionButton
                  label={t("takedown.remove")}
                  variant="danger"
                  confirmMessage={t("takedown.removeConfirm")}
                  errorLabel={t("takedown.actionError")}
                  spec={{ kind: "takedown", listingId: listing.id }}
                />
              </div>
            </div>
          );
        })}
      </section>

      <section className="admin-section">
        <h2>{t("categories.heading", { count: categories.length })}</h2>
        {categories.map((category) => (
          <div key={category.id} className="admin-card">
            <CategoryForm category={category} />
          </div>
        ))}
        <div className="admin-card">
          <p className="admin-muted" style={{ marginBottom: "0.5rem" }}>
            {t("categories.addHeading")}
          </p>
          <CategoryForm />
        </div>
      </section>
    </div>
  );
}
