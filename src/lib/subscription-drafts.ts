import { NormalizedInvoiceSource } from "@/lib/gmail";
import { ProviderConfig } from "@/lib/providers";
import { SubscriptionDraft } from "@/lib/schemas";
import { ExtractionResult } from "@/lib/extractor";

function uniqueSortedDates(invoiceDates: Array<string | null | undefined>) {
  return Array.from(
    new Set(invoiceDates.filter((invoiceDate): invoiceDate is string => Boolean(invoiceDate))),
  ).sort((left, right) => left.localeCompare(right));
}

function inferBillingInterval(invoiceDates: string[]) {
  if (invoiceDates.length < 2) {
    return { billingIntervalCount: null, billingIntervalUnit: null };
  }

  const timestamps = invoiceDates
    .map((invoiceDate) => new Date(invoiceDate).getTime())
    .filter((timestamp) => Number.isFinite(timestamp));

  if (timestamps.length < 2) {
    return { billingIntervalCount: null, billingIntervalUnit: null };
  }

  const gaps = timestamps.slice(1).map((timestamp, index) => {
    const delta = Math.round((timestamp - timestamps[index]) / (1000 * 60 * 60 * 24));
    return delta;
  });

  const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;

  if (averageGap >= 360 && averageGap <= 370) {
    return { billingIntervalCount: 1, billingIntervalUnit: "year" as const };
  }

  if (averageGap >= 84 && averageGap <= 96) {
    return { billingIntervalCount: 3, billingIntervalUnit: "month" as const };
  }

  if (averageGap >= 27 && averageGap <= 32) {
    return { billingIntervalCount: 1, billingIntervalUnit: "month" as const };
  }

  if (averageGap >= 6 && averageGap <= 8) {
    return { billingIntervalCount: 1, billingIntervalUnit: "week" as const };
  }

  return { billingIntervalCount: null, billingIntervalUnit: null };
}

function getConfidence(flags: string[], draft: Omit<SubscriptionDraft, "confidence">) {
  if (
    flags.some((flag) => ["amount_missing", "billing_cycle_needs_review"].includes(flag)) &&
    draft.amount === null
  ) {
    return "low" as const;
  }

  if (
    draft.amount !== null &&
    draft.lastBilledDate &&
    draft.billingIntervalCount !== null &&
    flags.every((flag) => !["amount_missing", "billing_cycle_needs_review"].includes(flag))
  ) {
    return "high" as const;
  }

  if (draft.amount !== null || draft.lastBilledDate) {
    return "medium" as const;
  }

  return "low" as const;
}

export function buildSubscriptionDraft({
  provider,
  sources,
  extraction,
}: {
  provider: ProviderConfig;
  sources: NormalizedInvoiceSource[];
  extraction: ExtractionResult;
}) {
  const flags = new Set(extraction.flags);
  const invoiceDates = uniqueSortedDates(sources.map((source) => source.invoiceDate));
  const inferredInterval = inferBillingInterval(invoiceDates);
  const startDate = extraction.output.startDate ?? invoiceDates[0] ?? null;
  const lastBilledDate =
    extraction.output.lastBilledDate ?? invoiceDates[invoiceDates.length - 1] ?? null;
  const billingIntervalCount =
    extraction.output.billingIntervalCount ?? inferredInterval.billingIntervalCount;
  const billingIntervalUnit =
    extraction.output.billingIntervalUnit ?? inferredInterval.billingIntervalUnit;

  if (!extraction.output.startDate && startDate) {
    flags.add("first_seen_in_lookback");
  }

  if (extraction.flags.includes("heuristic_extraction")) {
    flags.add("review_llm_fallback");
  }

  if (!extraction.output.paymentMethod) {
    flags.add("payment_method_missing");
  }

  if (extraction.output.amount === null) {
    flags.add("amount_missing");
  }

  if (!billingIntervalCount || !billingIntervalUnit) {
    flags.add("billing_cycle_needs_review");
  }

  if (
    extraction.output.statusSignal &&
    extraction.output.statusSignal !== "active" &&
    extraction.output.statusSignal !== "unknown"
  ) {
    flags.add(`status_${extraction.output.statusSignal}`);
    flags.add("status_needs_review");
  }

  flags.add("profile_inferred");
  flags.add("reminder_days_inferred");

  const draftWithoutConfidence = {
    providerId: provider.id,
    name: extraction.output.name ?? provider.name,
    type: extraction.output.type ?? "paid",
    amount: extraction.output.amount ?? null,
    currency: extraction.output.currency ?? null,
    startDate,
    lastBilledDate,
    billingIntervalCount,
    billingIntervalUnit,
    profile: "Personal",
    category: provider.category,
    paymentMethod: extraction.output.paymentMethod ?? null,
    reminderDays: 3,
    website: provider.website,
    notes: extraction.output.notes ?? "",
    flags: Array.from(flags).sort(),
    evidence: {
      messageIds: Array.from(new Set(sources.map((source) => source.messageId))),
      attachmentIds: Array.from(
        new Set(
          sources
            .map((source) => source.attachmentId)
            .filter((attachmentId): attachmentId is string => Boolean(attachmentId)),
        ),
      ),
      invoiceDates,
      sourceKinds: Array.from(new Set(sources.map((source) => source.sourceKind))),
      senderGroups: Array.from(new Set(sources.map((source) => source.senderGroup))),
      messages: Array.from(
        new Map(
          sources.map((source) => [
            source.messageId,
            {
              messageId: source.messageId,
              subject: source.subject,
              sender: source.sender,
              invoiceDate: source.invoiceDate,
              gmailUrl: source.gmailUrl,
            },
          ]),
        ).values(),
      ),
    },
  };

  return {
    ...draftWithoutConfidence,
    confidence: getConfidence(draftWithoutConfidence.flags, draftWithoutConfidence),
  } satisfies SubscriptionDraft;
}
