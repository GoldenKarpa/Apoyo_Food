import { getTranslations } from "next-intl/server";

import { PlaceholderPage } from "@/components/scaffold/placeholder-page";

export default async function FoodAdminPage() {
  const t = await getTranslations("seller.admin");
  return <PlaceholderPage title={t("title")} body={t("body")} />;
}
