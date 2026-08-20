"use server";

import { redirect } from "next/navigation";

import { getFoodSession } from "@/lib/session";
import { resolveThread, resolveThreadAccess } from "@/lib/thread";

/**
 * PC-1 — "message this kitchen" from a seller's profile, the entry point that
 * makes a thread resumable with no order open.
 *
 * ⚠ **The gate runs HERE, not only where the button is rendered.** A profile
 * page is public, its HTML is cacheable, and a server action is callable
 * directly — so a buyer with no order history who invokes this must be refused
 * by this function, not by the absence of a button. That refusal is what keeps
 * "you have ordered from this seller at least once" a real constraint rather
 * than a UI convention.
 *
 * Refuses silently (returns, no redirect) rather than throwing: there is no
 * error surface on a profile page for this, and the honest outcome of "you may
 * not open this" is that nothing happens.
 */
export async function startThreadWithSeller(sellerId: string): Promise<void> {
  const session = await getFoodSession();
  if (!session) return;

  const access = await resolveThreadAccess(sellerId, session.userId);
  if (!access.canWrite) return;

  const thread = await resolveThread(sellerId, session.userId, session.email);
  redirect(`/messages/${thread.id}`);
}
