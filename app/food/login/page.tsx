import { getTranslations } from "next-intl/server";

import { PlaceholderPage } from "@/components/scaffold/placeholder-page";

export default async function SellerLoginPage() {
  const t = await getTranslations("seller.login");
  return <PlaceholderPage title={t("title")} body={t("body")} />;
}
