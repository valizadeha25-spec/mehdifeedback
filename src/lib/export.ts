import { ExportRecord, exportRecordSchema, SubscriptionDraft } from "@/lib/schemas";

export function formatBillingCycle(draft: SubscriptionDraft) {
  if (!draft.billingIntervalCount || !draft.billingIntervalUnit) {
    return null;
  }

  return `${draft.billingIntervalCount} / ${draft.billingIntervalUnit}`;
}

export function toExportRecord(draft: SubscriptionDraft): ExportRecord {
  return exportRecordSchema.parse({
    name: draft.name,
    type: draft.type,
    amount: draft.amount,
    startDate: draft.startDate,
    billingCycle: formatBillingCycle(draft),
    profile: draft.profile,
    category: draft.category,
    paymentMethod: draft.paymentMethod,
    reminderDays: draft.reminderDays,
    website: draft.website,
    notes: draft.notes,
  });
}

export function toExportPayload(drafts: SubscriptionDraft[]) {
  return drafts.map(toExportRecord);
}
