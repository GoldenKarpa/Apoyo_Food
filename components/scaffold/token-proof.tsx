import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCentsTtd } from "@/lib/money";

/**
 * ⚠ SCAFFOLDING WITH A SCHEDULED DEATH — Slice 7 deletes this file along with
 * `surface-banner.tsx`.
 *
 * Its job is to make Slice 1's done-when ("the corrected accent hexes are
 * present in the emitted CSS bundle") checkable by eye as well as by grep, and
 * to force every token class to actually be *used* somewhere — Tailwind
 * silently drops classes it can't resolve, so a green build proves nothing on
 * its own. Every swatch below is rendered with the same utility a real
 * component would use.
 */

const SURFACES = [
  ["cream-bg", "#F4EEE1", "bg-cream-bg"],
  ["card", "#FCF8EF", "bg-card"],
  ["sunken", "#EBE3D3", "bg-sunken"],
  ["hairline", "#E2D8C4", "bg-hairline"],
] as const;

// The corrected, text-safe accents. Each is shown AS TEXT on the card surface,
// which is the usage the WCAG amendment exists for.
const ACCENTS_TEXT = [
  ["green", "#536D46", "text-green"],
  ["teal", "#3D6D68", "text-teal"],
  ["gold", "#895C1A", "text-gold"],
  ["terracotta", "#9A4C36", "text-terracotta"],
  ["error", "#A54A3A", "text-error"],
] as const;

// The retained Emergent originals — fill only, ink on top, never as text.
const ACCENTS_VIVID = [
  ["green-vivid", "#5E7B4F", "bg-green-vivid"],
  ["teal-vivid", "#4E8C86", "bg-teal-vivid"],
  ["gold-vivid", "#DDA24A", "bg-gold-vivid"],
  ["terracotta-vivid", "#C0654A", "bg-terracotta-vivid"],
] as const;

const ACCENTS_SOFT = [
  ["green-soft", "#E4EADC", "bg-green-soft"],
  ["teal-soft", "#DCE8E5", "bg-teal-soft"],
  ["gold-soft", "#F5E6C9", "bg-gold-soft"],
  ["terracotta-soft", "#F0DAD1", "bg-terracotta-soft"],
] as const;

const TYPE_SCALE = [
  ["display", "text-display", "28/34"],
  ["h1", "text-h1", "22/28"],
  ["h2", "text-h2", "18/24"],
  ["body", "text-body", "16/24"],
  ["label", "text-label", "14/20"],
  ["caption", "text-caption", "12/16"],
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-h2 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export async function TokenProof() {
  const t = await getTranslations("scaffold");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("tokensHeading")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        <Section title={t("surfaces")}>
          <div className="flex flex-wrap gap-3">
            {SURFACES.map(([name, hex, cls]) => (
              <div
                key={name}
                className={`${cls} flex min-w-32 flex-col rounded-image border border-hairline px-3 py-2`}
              >
                <span className="text-label font-medium text-ink">{name}</span>
                <span className="text-caption text-ink">{hex}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title={t("accentsText")}>
          <div className="flex flex-wrap gap-4">
            {ACCENTS_TEXT.map(([name, hex, cls]) => (
              <div key={name} className="flex min-w-36 flex-col">
                <span className={`${cls} text-body font-semibold`}>{name}</span>
                <span className={`${cls} text-caption`}>{hex}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title={t("accentsVivid")}>
          {/* Rendered at 22px semibold ON PURPOSE, not for emphasis: ink on
              green-vivid / teal-vivid / terracotta-vivid measures 3.10–3.80:1,
              which clears WCAG's 3.0 LARGE-text bar but not the 4.5 normal-text
              bar. 22px semibold is above the 18.66px-bold large-text threshold,
              so this swatch demonstrates the rule rather than breaking it.
              gold-vivid (6.55:1) is the exception and is safe at any size —
              which is exactly why Part F3 makes it the status-chip fill. */}
          <div className="flex flex-wrap gap-3">
            {ACCENTS_VIVID.map(([name, hex, cls]) => (
              <span
                key={name}
                className={`${cls} rounded-pill px-4 py-1.5 text-h1 font-semibold text-ink`}
              >
                {name} · {hex}
              </span>
            ))}
          </div>
          <p className="text-caption text-ink-muted">{t("vividNote")}</p>
        </Section>

        <Section title={t("accentsSoft")}>
          <div className="flex flex-wrap gap-3">
            {ACCENTS_SOFT.map(([name, hex, cls]) => (
              <span key={name} className={`${cls} rounded-pill px-4 py-1.5 text-label text-ink`}>
                {name} · {hex}
              </span>
            ))}
          </div>
        </Section>

        <Section title={t("typeScale")}>
          <div className="flex flex-col gap-1">
            {TYPE_SCALE.map(([name, cls, size]) => (
              <p key={name} className={cls}>
                <span className="font-display">{name}</span>{" "}
                <span className="text-ink-muted">— {size}</span>
              </p>
            ))}
            <p className="font-hand text-h1 text-teal">{t("handExample")}</p>
          </div>
        </Section>

        <Section title={t("priceExample")}>
          {/* Terracotta price text everywhere — Part F3's fixed accent role, and
              the family tie back to Apparel's clay. Rendered through
              lib/money.ts so the mockups' € can never enter. */}
          <p className="text-h1 font-semibold text-terracotta">{formatCentsTtd(125000)}</p>
        </Section>

        <Section title={t("shapes")}>
          <div className="flex flex-wrap items-center gap-3">
            <Button>primary</Button>
            <Button variant="secondary">secondary</Button>
            <Button variant="outline">outline</Button>
            <Button variant="ghost">ghost</Button>
            <Button variant="destructive">destructive</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input placeholder="input · rounded-control 14px" className="max-w-xs" />
            <div className="aspect-thumb w-16 rounded-image bg-green-soft" />
            <div className="aspect-meal w-32 rounded-image bg-gold-soft" />
            <div className="aspect-cover w-40 rounded-image bg-teal-soft" />
          </div>
        </Section>
      </CardContent>
    </Card>
  );
}
