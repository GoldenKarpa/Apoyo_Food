import { getTranslations } from "next-intl/server";

import { PlaceholderPage } from "@/components/scaffold/placeholder-page";

// Supplies its own <main>: `app/food/layout.tsx` stopped padding its children
// at Slice 13, so the dashboard's nav bar could be full-bleed. Slice 16 replaces
// this page with the shared Apoyo admin shell.
export default async function FoodAdminPage() {
  const t = await getTranslations("seller.admin");
  return (
    <main className="screen-pad flex flex-1 flex-col gap-6 py-8">
      <PlaceholderPage title={t("title")} body={t("body")} />
    </main>
  );
}
