import { z } from "zod";

export const billingIntervalUnitSchema = z.enum(["day", "week", "month", "year"]);
export const confidenceSchema = z.enum(["high", "medium", "low"]);
export const sourceKindSchema = z.enum(["html", "text", "pdf"]);
export const subscriptionTypeSchema = z.enum(["paid", "trial"]);

export const evidenceMessageSchema = z.object({
  messageId: z.string(),
  subject: z.string().nullable(),
  sender: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  gmailUrl: z.string(),
});

export const invoiceEvidenceSchema = z.object({
  messageIds: z.array(z.string()),
  attachmentIds: z.array(z.string()),
  invoiceDates: z.array(z.string()),
  sourceKinds: z.array(sourceKindSchema),
  senderGroups: z.array(z.string()),
  messages: z.array(evidenceMessageSchema),
});

export const subscriptionDraftSchema = z.object({
  providerId: z.string(),
  name: z.string().nullable(),
  type: subscriptionTypeSchema.nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  startDate: z.string().nullable(),
  lastBilledDate: z.string().nullable(),
  billingIntervalCount: z.number().int().positive().nullable(),
  billingIntervalUnit: billingIntervalUnitSchema.nullable(),
  profile: z.string().nullable(),
  category: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  reminderDays: z.number().int().nonnegative().nullable(),
  website: z.string().nullable(),
  notes: z.string().nullable(),
  confidence: confidenceSchema,
  flags: z.array(z.string()),
  evidence: invoiceEvidenceSchema,
});

export const extractionOutputSchema = z.object({
  classification: z.enum(["subscription", "one_off_invoice", "unrelated"]),
  classificationReason: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  type: subscriptionTypeSchema.nullable().optional(),
  amount: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  lastBilledDate: z.string().nullable().optional(),
  billingIntervalCount: z.number().int().positive().nullable().optional(),
  billingIntervalUnit: billingIntervalUnitSchema.nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  latestEmailSummary: z.string().nullable().optional(),
  statusSignal: z.enum(["active", "cancelled", "paused", "refunded", "unknown"]).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const providerExtractionInputSchema = z.object({
  providerId: z.string(),
  texts: z.array(
    z.object({
      text: z.string(),
      invoiceDate: z.string().nullable(),
      messageId: z.string(),
      attachmentId: z.string().nullable(),
      sourceKind: sourceKindSchema,
      subject: z.string().nullable(),
      sender: z.string().nullable(),
      gmailUrl: z.string(),
      senderDomain: z.string(),
      senderGroup: z.string(),
      senderGroupLabel: z.string(),
    }),
  ),
});

export const exportRecordSchema = z.object({
  name: z.string().nullable(),
  type: subscriptionTypeSchema.nullable(),
  amount: z.number().nullable(),
  startDate: z.string().nullable(),
  billingCycle: z.string().nullable(),
  profile: z.string().nullable(),
  category: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  reminderDays: z.number().int().nonnegative().nullable(),
  website: z.string().nullable(),
  notes: z.string().nullable(),
});

export type BillingIntervalUnit = z.infer<typeof billingIntervalUnitSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type EvidenceMessage = z.infer<typeof evidenceMessageSchema>;
export type ExportRecord = z.infer<typeof exportRecordSchema>;
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
export type InvoiceEvidence = z.infer<typeof invoiceEvidenceSchema>;
export type ProviderExtractionInput = z.infer<typeof providerExtractionInputSchema>;
export type SourceKind = z.infer<typeof sourceKindSchema>;
export type SubscriptionDraft = z.infer<typeof subscriptionDraftSchema>;
