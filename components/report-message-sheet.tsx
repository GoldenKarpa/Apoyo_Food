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
import { reportOrderMessage } from "@/lib/actions/order-message";

const REASONS = ["INAPPROPRIATE", "SUSPECTED_SCAM", "FOOD_SAFETY_CONCERN", "OTHER"] as const;

/**
 * A message's own report trigger (Slice 18 bullet: "reporting hook (report
 * content -> the Slice 16 admin flag list)") — same shape as
 * `<ReportListingSheet>`, scoped to one message instead of one listing. A
 * small flag icon on the bubble itself rather than a labelled button: this is
 * a rarely-used escape hatch on a surface (the thread) that is otherwise all
 * conversation, and Slice 16's own precedent for report triggers is "available,
 * not featured".
 */
export function ReportMessageSheet({ messageId }: { messageId: string }) {
  const t = useTranslations("orderThread.report");
  const [reason, setReason] = React.useState<string>("INAPPROPRIATE");
  const [message, setMessage] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    const result = await reportOrderMessage(messageId, reason, message);
    setSubmitting(false);
    if (result.ok) setSubmitted(true);
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
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
          aria-label={t("trigger")}
          className="tap-target absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-pill bg-card text-ink-muted opacity-0 shadow-soft transition-opacity duration-200 ease-soft hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Flag aria-hidden className="h-3.5 w-3.5" />
        </button>
      </BottomSheetTrigger>

      <BottomSheetContent title={t("title")} description={t("description")}>
        {submitted ? (
          <p className="rounded-card bg-green-soft px-4 py-3 text-label text-ink">{t("thanks")}</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label htmlFor="report-message-reason" className="text-label font-medium text-ink">
                {t("reasonLabel")}
              </label>
              <Select id="report-message-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((value) => (
                  <option key={value} value={value}>
                    {t(`reason.${value}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="report-message-details" className="text-label font-medium text-ink">
                {t("messageLabel")}
              </label>
              <Textarea
                id="report-message-details"
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
