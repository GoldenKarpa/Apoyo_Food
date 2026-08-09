import { getTranslations } from "next-intl/server";
import type { SellerStatus } from "@prisma/client";

import { StatusChip, type StatusTone } from "@/components/ui/chip";

/**
 * The seller's standing, stated in plain language at the top of the workspace.
 *
 * ⚠ Food's `SellerStatus` is `PENDING | ACTIVE | SUSPENDED` — there is no
 * `APPROVED` value (Slice 3's note; Apparel's enum differs, and copying its
 * wording would produce a status that does not exist here).
 *
 * PENDING is the state this slice actually ships people into, and the copy has
 * a job: Slice 16's approval queue does not exist yet, so a seller waiting here
 * has no way to know whether they are stuck or simply early. Saying so is the
 * difference between a queue and a dead end.
 *
 * Tones come from Part F3 via `<StatusChip>`: pending is the one sanctioned home
 * of `gold-vivid` (ink on it measures 6.55:1, the only vivid that clears AA at
 * normal text size).
 */
const TONES: Record<SellerStatus, StatusTone> = {
  PENDING: "pending",
  ACTIVE: "accepted",
  SUSPENDED: "declined",
};

export async function SellerStatusBanner({
  status,
  displayName,
}: {
  status: SellerStatus;
  displayName: string;
}) {
  const t = await getTranslations("seller.status");
  const key = status.toLowerCase() as Lowercase<SellerStatus>;

  return (
    <section className="rounded-card border border-hairline bg-card p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-h1 font-semibold text-ink">{displayName}</h1>
        <StatusChip tone={TONES[status]}>{t(`${key}.label`)}</StatusChip>
      </div>
      <p className="mt-3 max-w-prose text-body text-ink">{t(`${key}.body`)}</p>
    </section>
  );
}

/**
 * The same standing, without the `<h1>` — for pages that already own their own
 * heading (the profile editor and the guided setup flow).
 *
 * ⚠ Added 2026-08-08 because standing was stated on the dashboard root ONLY,
 * and a brand-new seller does not linger there: onboarding drops them straight
 * into `/food/profile/setup` and they work through eight steps without ever
 * passing the one page that said "you are pending review". Reported live by a
 * first-time seller who reasonably concluded no approval step existed at all —
 * a genuinely alarming read, since it looks like anyone could publish food
 * unreviewed. (They cannot: every buyer-facing query filters on
 * `seller.status === "ACTIVE"`.) The gap was that nothing SAID so where they
 * were actually standing.
 *
 * ACTIVE renders nothing: "you are approved and live" is the unremarkable
 * default, and a persistent green bar on every profile edit is noise. Only the
 * states that carry a consequence — PENDING and SUSPENDED — speak up.
 */
export async function SellerStatusNote({ status }: { status: SellerStatus }) {
  if (status === "ACTIVE") return null;

  const t = await getTranslations("seller.status");
  const key = status.toLowerCase() as Lowercase<SellerStatus>;

  return (
    <section className="flex flex-col gap-2 rounded-card border border-hairline bg-sunken p-4">
      <StatusChip tone={TONES[status]} className="self-start">
        {t(`${key}.label`)}
      </StatusChip>
      {/* Full `ink`, never `ink-muted`, on `sunken` — the Slice 1 finding
          (ink-muted measures 4.37:1 there). */}
      <p className="max-w-prose text-label text-ink">{t(`${key}.body`)}</p>
    </section>
  );
}
