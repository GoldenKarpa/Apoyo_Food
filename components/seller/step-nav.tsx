import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";

/**
 * The footer for wizard steps that have NO form to submit — the photo, cover
 * and gallery steps, where the save already happened the moment the upload
 * landed.
 *
 * ⚠ One button, whose LABEL changes rather than two buttons pointing at the
 * same URL. On a media step, "Continue" and "Skip" would be the identical
 * navigation, and offering both would be a choice with no difference — the kind
 * of thing that makes a user hunt for the distinction. So: "Continue" once
 * something is uploaded, "Skip for now" while nothing is, and the same href
 * either way. Skipping stays a first-class outcome (architecture F2), it is
 * just told the truth about.
 */
export async function StepNav({ nextHref, done }: { nextHref: string; done: boolean }) {
  const t = await getTranslations("seller.setup");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant={done ? "primary" : "ghost"} asChild>
        <Link href={nextHref}>{done ? t("continue") : t("skip")}</Link>
      </Button>
    </div>
  );
}
