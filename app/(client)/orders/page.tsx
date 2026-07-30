import { getTranslations } from "next-intl/server";

import { PlaceholderPage } from "@/components/scaffold/placeholder-page";

export default async function OrdersPage() {
  const t = await getTranslations("client.orders");
  return <PlaceholderPage title={t("title")} body={t("body")} />;
}
