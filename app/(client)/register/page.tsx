import { getTranslations } from "next-intl/server";

import { PlaceholderPage } from "@/components/scaffold/placeholder-page";

export default async function RegisterPage() {
  const t = await getTranslations("client.register");
  return <PlaceholderPage title={t("title")} body={t("body")} />;
}
