import { getTranslations } from "next-intl/server";

import { PlaceholderPage } from "@/components/scaffold/placeholder-page";

export default async function AccountPage() {
  const t = await getTranslations("client.account");
  return <PlaceholderPage title={t("title")} body={t("body")} />;
}
