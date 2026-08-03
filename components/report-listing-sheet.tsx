"use client";

import * as React from "react";
import { Flag, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetTrigger,
} from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { reportListing } from "@/lib/actions/report-listing";

const REASONS = ["INAPPROPRIATE", "SUSPECTED_SCAM", "FOOD_SAFETY_CONCERN", "OTHER"] as const;

/**
 * Slice 16's buyer-facing report trigger — a plain text link on the listing
 * page rather than a prominent button, matching how a "report" affordance
 * reads on most marketplaces: available, not featured. No sign-in
 * requirement (`reportListing`'s own comment): a browsing-but-anonymous
 * buyer is exactly who first notices a bad listing.
 */
export function ReportListingSheet({ listingId }: { listingId: string }) {
  const t = useTranslations("client.meal.report");
  const [reason, setReason] = React.useState<string>("INAPPROPRIATE");
  const [message, setMessage] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    const result = await reportListing(listingId, reason, message);
    setSubmitting(false);
    if (result.ok) setSubmitted(true);
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          // Reset for next time, after the close animation would have run.
          setTimeout(() => {
            setSubmitted(false);
            setReason("INAPPROPRIATE");
            setMessage("");
          }, 200);
        }
      }}
    >
      <BottomSheetTrigger asChild>
        <button
          type="button"
          className="tap-target inline-flex w-fit items-center gap-1.5 rounded-control px-2 text-caption text-ink-muted transition-colors duration-200 ease-soft hover:text-ink"
        >
          <Flag aria-hidden className="h-3.5 w-3.5" />
          {t("trigger")}
        </button>
      </BottomSheetTrigger>

      <BottomSheetContent title={t("title")} description={t("description")}>
        {submitted ? (
          <p className="rounded-card bg-green-soft px-4 py-3 text-label text-ink">{t("thanks")}</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label htmlFor="report-reason" className="text-label font-medium text-ink">
                {t("reasonLabel")}
              </label>
              <Select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((value) => (
                  <option key={value} value={value}>
                    {t(`reason.${value}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="report-message" className="text-label font-medium text-ink">
                {t("messageLabel")}
              </label>
              <Textarea
                id="report-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("messagePlaceholder")}
              />
            </div>
            <BottomSheetFooter>
              <Button onClick={handleSubmit} disabled={submitting} className="w-full">
                {submitting ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
                {submitting ? t("submitting") : t("submit")}
              </Button>
            </BottomSheetFooter>
          </>
        )}
      </BottomSheetContent>
    </BottomSheet>
  );
}
