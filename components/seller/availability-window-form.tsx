"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { WeekdayPicker } from "@/components/seller/weekday-picker";
import { addAvailabilityWindow } from "@/lib/actions/listing-availability";
import { SELLER_FORM_IDLE, type SellerFormState } from "@/lib/actions/seller-form-state";
import { AVAILABILITY_TYPES } from "@/lib/availability-window-form";

/**
 * The "add a window" sub-form.
 *
 * ⚠ NOT built on `<FieldForm>` (Slice 13's shared save-with-feedback
 * component), on purpose — the post-submit behaviour genuinely differs.
 * `<FieldForm>` is an EDIT pattern: save this, keep showing what was saved.
 * This is an ADD-ANOTHER pattern: on success the form should clear and be
 * ready for the next window, not sit there displaying the one just created
 * (which now has its own row in the list below). Same precedent as
 * `<OnboardForm>` — a bespoke component for a form whose post-submit UX
 * `<FieldForm>` doesn't encode.
 *
 * Every field the CHECK constraint cares about is shown, but which ones are
 * ENABLED changes with `type` — a seller picking PREORDER never sees a day
 * picker they'd have to leave empty, because `lib/availability-window-form.ts`
 * would reject it as extra fields.
 */
export function AvailabilityWindowForm({ listingId }: { listingId: string }) {
  const t = useTranslations("seller.availabilityForm");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<SellerFormState>(SELLER_FORM_IDLE);

  const [type, setType] = useState<string>("RECURRING_WEEKLY");
  const [days, setDays] = useState<number[]>([]);
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [note, setNote] = useState("");

  function reset() {
    setDays([]);
    setStartsOn("");
    setEndsOn("");
    setLeadTimeDays("");
    setNote("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("type", type);
    for (const day of days) formData.append("days", String(day));
    formData.set("startsOn", startsOn);
    formData.set("endsOn", endsOn);
    formData.set("leadTimeDays", leadTimeDays);
    formData.set("note", note);

    startTransition(async () => {
      const result = await addAvailabilityWindow(listingId, SELLER_FORM_IDLE, formData);
      setState(result);
      if (result.status === "ok") {
        reset();
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-card border border-dashed border-hairline bg-sunken p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="window-type">{t("typeLabel")}</Label>
        <Select id="window-type" value={type} onChange={(e) => setType(e.target.value)} className="max-w-xs">
          {AVAILABILITY_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`types.${value}`)}
            </option>
          ))}
        </Select>
      </div>

      {type === "RECURRING_WEEKLY" && (
        <WeekdayPicker selected={days} onToggle={(day) => setDays((c) => (c.includes(day) ? c.filter((d) => d !== day) : [...c, day]))} />
      )}

      {type === "DATE_RANGE" && (
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="window-starts">{t("startsLabel")}</Label>
            <Input id="window-starts" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="window-ends">{t("endsLabel")}</Label>
            <Input id="window-ends" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="window-lead">
          {type === "PREORDER" ? t("leadLabelRequired") : t("leadLabelOptional")}
        </Label>
        <Input
          id="window-lead"
          type="number"
          min={1}
          max={60}
          inputMode="numeric"
          value={leadTimeDays}
          onChange={(e) => setLeadTimeDays(e.target.value)}
          className="max-w-[120px]"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="window-note">{t("noteLabel")}</Label>
        <Input
          id="window-note"
          value={note}
          maxLength={140}
          placeholder={t("notePlaceholder")}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-label text-error">
          {t(`errors.${state.error}`)}
        </p>
      )}

      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? t("adding") : t("add")}
        </Button>
      </div>
    </form>
  );
}
