import { getTranslations } from "next-intl/server";

import { PlaceholderPage } from "@/components/scaffold/placeholder-page";

export default async function SellerDirectoryPage() {
  const t = await getTranslations("client.sellers");
  return <PlaceholderPage title={t("title")} body={t("body")} />;
}
