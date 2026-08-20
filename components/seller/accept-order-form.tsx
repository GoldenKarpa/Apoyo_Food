"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFoodActions } from "@/lib/actions/registry";
import { SELLER_FORM_IDLE, type SellerFormState } from "@/lib/actions/seller-form-state";
import { centsToTtdInput } from "@/lib/listing-form";

export interface AcceptOrderItem {
  id: string;
  titleSnapshot: string;
  priceCentsSnapshot: number | null;
  quantity: number;
}

/**
 * The seller's Accept action (Slice 17, architecture E5: "adjust quote-item
 * prices -> Accept (locks agreed price...)"). One price field per item,
 * pre-filled when a snapshot already exists (FIXED/STARTING_AT — still
 * editable, for substitutions) and REQUIRED when it doesn't (QUOTE) —
 * `acceptOrder` enforces the same rule server-side (`priceRequired`), this is
 * only the form-level fast path.
 */
export function AcceptOrderForm({ orderId, items }: { orderId: string; items: AcceptOrderItem[] }) {
  const t = useTranslations("seller.orders");
  const tErrors = useTranslations("seller");
  const router = useRouter();
  // PD-S10 — the real actions in the product, the sandbox's in the demo.
  const actions = useFoodActions();

  const [prices, setPrices] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.id, item.priceCentsSnapshot !== null ? centsToTtdInput(item.priceCentsSnapshot) : ""])),
  );
  const [pending, startTransition] = React.useTransition();
  const [state, setState] = React.useState<SellerFormState>(SELLER_FORM_IDLE);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    for (const item of items) formData.set(`price-${item.id}`, prices[item.id] ?? "");

    startTransition(async () => {
      const result = await actions.acceptOrder(orderId, SELLER_FORM_IDLE, formData);
      setState(result);
      if (result.status === "ok") router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-2">
          <Label htmlFor={`accept-price-${item.id}`}>
            {t("priceLabelFor", { title: item.titleSnapshot, quantity: item.quantity })}
          </Label>
          <Input
            id={`accept-price-${item.id}`}
            inputMode="decimal"
            placeholder={t("pricePlaceholder")}
            value={prices[item.id] ?? ""}
            onChange={(e) => setPrices((current) => ({ ...current, [item.id]: e.target.value }))}
          />
        </div>
      ))}

      <Button type="submit" disabled={pending}>
        {pending ? t("accepting") : t("accept")}
      </Button>
      {state.status === "error" && <p className="text-caption text-error">{tErrors(`errors.${state.error}`)}</p>}
    </form>
  );
}
