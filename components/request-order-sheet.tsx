"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { FulfillmentMode } from "@prisma/client";

import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetTrigger,
} from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createOrderRequest } from "@/lib/actions/order";
import { CLIENT_FORM_IDLE, type ClientFormState } from "@/lib/actions/client-form-state";
import {
  MAX_CUSTOMER_NOTE_LENGTH,
  MAX_FULFILLMENT_AREA_LENGTH,
  MAX_ITEM_NOTE_LENGTH,
  MAX_QUANTITY,
  MIN_QUANTITY,
} from "@/lib/order-form";

/**
 * The sticky "Request order" CTA's sheet (Slice 17, architecture E5/F1) —
 * replaces the Phase-1 `<ComingSoon feature="requestOrder">` stub wholesale,
 * exactly as that stub said it would be.
 *
 * ⚠ **Three states behind ONE always-visible trigger**, not three components:
 * Part F3 names the trigger's own copy ("Solicitar pedido" / "Request
 * order") and gives no indication it should ever change label, so the button
 * stays constant and only the SHEET CONTENT branches:
 *   1. `!orderingEnabled` — the admin "Coming Soon" launch gate
 *      (`FoodPlatformSetting`, this slice's own Custom Edit) is off. Neither a
 *      registry `<ComingSoon>` stub (the feature IS built) nor a sign-in
 *      question (irrelevant while paused) — its own small notice.
 *   2. `!authenticated` — the sign-in gate (architecture E5 step 1). Mirrors
 *      `<SignedOutNotice>`'s standing rule EXACTLY: states the situation and
 *      stops, no redirect and no guessed login URL (the ecosystem rule from
 *      Apparel's Slice 10, `components/seller/signed-out-notice.tsx`'s own
 *      comment) — Food still has no login door of its own.
 *   3. Otherwise, the real request form. `createOrderRequest` re-checks BOTH
 *      gates server-side regardless of which branch rendered — a direct POST
 *      while the UI hides the form must fail exactly like the UI says it will.
 */
export function RequestOrderSheet({
  listingId,
  fulfillmentModes,
  minDateIso,
  orderingEnabled,
  authenticated,
}: {
  listingId: string;
  fulfillmentModes: FulfillmentMode[];
  /** Today's date in the fixed zone (`lib/availability.ts`'s `localDay`) — the date input's `min`. */
  minDateIso: string;
  orderingEnabled: boolean;
  authenticated: boolean;
}) {
  const t = useTranslations("client.orderForm");
  const tSignedOut = useTranslations("client.signedOut");
  const tFulfillment = useTranslations("fulfillmentModes");
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [quantity, setQuantity] = React.useState("1");
  const [itemNote, setItemNote] = React.useState("");
  const [fulfillmentMode, setFulfillmentMode] = React.useState<string>(fulfillmentModes[0] ?? "");
  const [dateIso, setDateIso] = React.useState("");
  const [time, setTime] = React.useState("");
  const [fulfillmentAreaOrNote, setFulfillmentAreaOrNote] = React.useState("");
  const [customerNote, setCustomerNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [state, setState] = React.useState<ClientFormState>(CLIENT_FORM_IDLE);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("listingId", listingId);
    formData.set("quantity", quantity);
    formData.set("itemNote", itemNote);
    formData.set("fulfillmentMode", fulfillmentMode);
    formData.set("dateIso", dateIso);
    formData.set("time", time);
    formData.set("fulfillmentAreaOrNote", fulfillmentAreaOrNote);
    formData.set("customerNote", customerNote);

    startTransition(async () => {
      const result = await createOrderRequest(CLIENT_FORM_IDLE, formData);
      setState(result);
      if (result.status === "ok") {
        router.push(`/orders/${result.orderId}`);
      }
    });
  }

  return (
    <BottomSheet open={open} onOpenChange={setOpen}>
      <BottomSheetTrigger asChild>
        <Button
          variant="primary"
          size="lg"
          className="w-full md:w-auto md:px-8"
          data-testid="request-order-trigger"
        >
          {t("cta")}
        </Button>
      </BottomSheetTrigger>

      <BottomSheetContent title={t("title")}>
        {!orderingEnabled ? (
          <p className="rounded-card bg-sunken p-4 text-body text-ink">{t("pausedBody")}</p>
        ) : !authenticated ? (
          <div className="rounded-card bg-sunken p-4">
            <h2 className="text-h3 font-semibold text-ink">{tSignedOut("title")}</h2>
            <p className="mt-2 text-body text-ink">{tSignedOut("body")}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="order-quantity">{t("quantityLabel")}</Label>
              <Input
                id="order-quantity"
                type="number"
                inputMode="numeric"
                min={MIN_QUANTITY}
                max={MAX_QUANTITY}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="order-item-note">{t("itemNoteLabel")}</Label>
              <Textarea
                id="order-item-note"
                value={itemNote}
                maxLength={MAX_ITEM_NOTE_LENGTH}
                placeholder={t("itemNotePlaceholder")}
                onChange={(e) => setItemNote(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="order-fulfillment-mode">{t("fulfillmentModeLabel")}</Label>
              <Select
                id="order-fulfillment-mode"
                required
                value={fulfillmentMode}
                onChange={(e) => setFulfillmentMode(e.target.value)}
              >
                {fulfillmentModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {tFulfillment(mode)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="order-date">{t("dateLabel")}</Label>
                <Input
                  id="order-date"
                  type="date"
                  required
                  min={minDateIso}
                  value={dateIso}
                  onChange={(e) => setDateIso(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="order-time">{t("timeLabel")}</Label>
                <Input
                  id="order-time"
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="order-area">{t("areaLabel")}</Label>
              <Input
                id="order-area"
                value={fulfillmentAreaOrNote}
                maxLength={MAX_FULFILLMENT_AREA_LENGTH}
                placeholder={t("areaPlaceholder")}
                onChange={(e) => setFulfillmentAreaOrNote(e.target.value)}
              />
              <p className="text-caption text-ink-muted">{t("areaHint")}</p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="order-customer-note">{t("customerNoteLabel")}</Label>
              <Textarea
                id="order-customer-note"
                value={customerNote}
                maxLength={MAX_CUSTOMER_NOTE_LENGTH}
                placeholder={t("customerNotePlaceholder")}
                onChange={(e) => setCustomerNote(e.target.value)}
              />
            </div>

            <BottomSheetFooter>
              <Button type="submit" size="lg" disabled={pending} className="w-full">
                {pending ? t("submitting") : t("submit")}
              </Button>
              {state.status === "error" && (
                <p role="alert" className="text-center text-label text-error">
                  {state.error === "leadTime" && state.minLeadDays !== undefined
                    ? t("errors.leadTime", { days: state.minLeadDays })
                    : t(`errors.${state.error}`)}
                </p>
              )}
            </BottomSheetFooter>
          </form>
        )}
      </BottomSheetContent>
    </BottomSheet>
  );
}
