import { getTranslations } from "next-intl/server";

import { PlaceholderPage } from "@/components/scaffold/placeholder-page";

export default async function SellerDashboardPage() {
  const t = await getTranslations("seller.dashboard");
  return <PlaceholderPage title={t("title")} body={t("body")} />;
}
