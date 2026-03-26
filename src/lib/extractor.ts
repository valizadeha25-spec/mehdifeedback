import OpenAI from "openai";

import type { ExtractionDebugTrace } from "@/lib/debug-store";
import { getOpenAiModel } from "@/lib/env";
import { NormalizedInvoiceSource } from "@/lib/gmail";
import { ProviderConfig } from "@/lib/providers";
import { extractionOutputSchema, ExtractionOutput } from "@/lib/schemas";
import {
  hasRecurringLanguage,
  hasSubscriptionLifecycleLanguage,
  hasTransactionLanguage,
  isMarketingBody,
  isOneOffPurchase,
} from "@/lib/subscription-signals";

export type ExtractionResult = {
  output: ExtractionOutput;
  flags: string[];
  debug: ExtractionDebugTrace;
};

function normalizeDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function detectType(text: string) {
  return /free trial|trial period|trial ends/i.test(text) ? "trial" : "paid";
}

function detectStatusSignal(text: string) {
  if (/cancelled|has been canceled|has been cancelled|will end on|won't renew|will not renew/i.test(text)) {
    return "cancelled" as const;
  }

  if (/paused|pause your subscription|subscription paused/i.test(text)) {
    return "paused" as const;
  }

  if (/refund issued|refunded|refund processed/i.test(text)) {
    return "refunded" as const;
  }

  if (/active|renewed|thanks for subscribing|payment received|invoice/i.test(text)) {
    return "active" as const;
  }

  return "unknown" as const;
}

function detectBillingInterval(text: string) {
  if (/annual|annually|yearly|per year/i.test(text)) {
    return { billingIntervalCount: 1, billingIntervalUnit: "year" as const };
  }

  if (/quarterly|every 3 months|per quarter/i.test(text)) {
    return { billingIntervalCount: 3, billingIntervalUnit: "month" as const };
  }

  if (/weekly|per week/i.test(text)) {
    return { billingIntervalCount: 1, billingIntervalUnit: "week" as const };
  }

  if (/monthly|per month/i.test(text)) {
    return { billingIntervalCount: 1, billingIntervalUnit: "month" as const };
  }

  return { billingIntervalCount: null, billingIntervalUnit: null };
}

function detectPaymentMethod(text: string) {
  const paymentMatch = text.match(
    /(Visa|MasterCard|Mastercard|Amex|American Express|Credit Card|PayPal|Apple Pay|Google Pay)(?:[^\n]{0,24}?(\d{2,4}))?/i,
  );

  if (!paymentMatch) {
    return null;
  }

  const label = paymentMatch[1].replace(/Mastercard/i, "MasterCard");
  return paymentMatch[2] ? `${label} •••• ${paymentMatch[2]}` : label;
}

function detectAmount(text: string) {
  const strongPattern =
    /(?:total|amount|charged|billed|payment|price)[^\d$€£₺]{0,24}(USD|EUR|GBP|TRY|CAD|AUD|\$|€|£|₺)?\s?(\d{1,4}(?:[.,]\d{2})?)/i;
  const fallbackPattern = /(USD|EUR|GBP|TRY|CAD|AUD|\$|€|£|₺)\s?(\d{1,4}(?:[.,]\d{2})?)/i;

  const match = text.match(strongPattern) ?? text.match(fallbackPattern);
  if (!match) {
    return { amount: null, currency: null };
  }

  const [, rawCurrency, rawAmount] = match;
  const amount = Number(rawAmount.replace(",", "."));
  if (!Number.isFinite(amount)) {
    return { amount: null, currency: null };
  }

  const currencyMap: Record<string, string> = {
    $: "USD",
    "€": "EUR",
    "£": "GBP",
    "₺": "TRY",
  };

  return {
    amount,
    currency: currencyMap[rawCurrency] ?? rawCurrency ?? null,
  };
}

function detectClassification(text: string, latestText: string) {
  const recurring = hasRecurringLanguage(text);
  const transaction = hasTransactionLanguage(text);
  const lifecycle = hasSubscriptionLifecycleLanguage(text) || hasSubscriptionLifecycleLanguage(latestText);
  const marketing = isMarketingBody(text);
  const oneOff = isOneOffPurchase(text);

  if (marketing && !transaction && !lifecycle) {
    return {
      classification: "unrelated" as const,
      classificationReason: "Content looks like marketing, onboarding, or engagement email rather than subscription billing.",
    };
  }

  if (oneOff && !recurring && !lifecycle) {
    return {
      classification: "one_off_invoice" as const,
      classificationReason: "Invoice looks like a usage-based or one-time charge, not a recurring subscription.",
    };
  }

  if (recurring && (transaction || lifecycle)) {
    return {
      classification: "subscription" as const,
      classificationReason: "Evidence shows a recurring membership or subscription lifecycle event.",
    };
  }

  if (transaction && !recurring && !lifecycle) {
    return {
      classification: "one_off_invoice" as const,
      classificationReason: "A billing event exists but there is no recurring subscription evidence.",
    };
  }

  return {
    classification: "unrelated" as const,
    classificationReason: "The emails do not provide enough evidence for a real recurring subscription.",
  };
}

function buildHeuristicExtraction(provider: ProviderConfig, sources: NormalizedInvoiceSource[]): ExtractionResult {
  const newestFirst = [...sources].sort((left, right) =>
    (right.invoiceDate ?? "").localeCompare(left.invoiceDate ?? ""),
  );
  const combinedText = newestFirst.map((source) => source.text).join("\n\n");
  const latestText = newestFirst[0]?.text ?? "";
  const { amount, currency } = detectAmount(combinedText);
  const { billingIntervalCount, billingIntervalUnit } = detectBillingInterval(combinedText);
  const statusSignal = detectStatusSignal(latestText);
  const latestEmailSummary = latestText.slice(0, 240);
  const { classification, classificationReason } = detectClassification(combinedText, latestText);

  return {
    output: extractionOutputSchema.parse({
      classification,
      classificationReason,
      name: provider.name,
      type: detectType(combinedText),
      amount,
      currency,
      startDate: normalizeDate(newestFirst.at(-1)?.invoiceDate),
      lastBilledDate: normalizeDate(newestFirst[0]?.invoiceDate),
      billingIntervalCount,
      billingIntervalUnit,
      paymentMethod: detectPaymentMethod(combinedText),
      latestEmailSummary,
      statusSignal,
      notes: statusSignal !== "active" && statusSignal !== "unknown" ? `Latest email suggests status: ${statusSignal}.` : "",
    }),
    flags: ["heuristic_extraction"],
    debug: {
      mode: "heuristic",
      request: {
        provider,
        invoices: newestFirst.map((source) => ({
          messageId: source.messageId,
          invoiceDate: source.invoiceDate,
          sourceKind: source.sourceKind,
          subject: source.subject,
          sender: source.sender,
          textPreview: source.text.slice(0, 1800),
        })),
      },
      response: {
        amount,
        currency,
        classification,
        classificationReason,
        billingIntervalCount,
        billingIntervalUnit,
        type: detectType(combinedText),
        paymentMethod: detectPaymentMethod(combinedText),
        latestEmailSummary,
        statusSignal,
      },
      notes: ["Heuristic fallback used instead of LLM extraction."],
    },
  };
}

async function extractWithOpenAi(
  provider: ProviderConfig,
  sources: NormalizedInvoiceSource[],
): Promise<ExtractionResult> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const invoices = sources.map((source) => ({
    invoiceDate: source.invoiceDate,
    sourceKind: source.sourceKind,
    subject: source.subject,
    sender: source.sender,
    text: source.text.slice(0, 6000),
  }));

  const requestPayload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model: getOpenAiModel(),
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: [
          "You extract subscription invoice fields from Gmail receipts.",
          "First decide whether the evidence is a real recurring subscription, a one-off invoice, or unrelated non-billing email.",
          "If the provided emails refer to different products or subscriptions, classify as unrelated instead of merging them.",
          "The most recent email is always included and may describe cancellation, pause, refund, renewal, or other edge cases.",
          "Return only JSON.",
          "Use null when evidence is missing.",
          "Map quarterly billing to billingIntervalCount 3 and billingIntervalUnit month.",
          "Use the latest email to infer subscription status changes.",
          "Renewal promos, usage-cap notices, onboarding emails, marketing, and reactivation nudges are unrelated unless they explicitly confirm an active recurring subscription or cancellation.",
          "A one-time or usage-based invoice is one_off_invoice, not subscription.",
          "If the latest email suggests cancellation, pause, refund, or non-renewal, set statusSignal accordingly and explain briefly in notes.",
          "Use the actual service being billed as name, not the storefront or sender if they differ.",
          "Do not invent payment methods or start dates.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          provider,
          invoices,
          outputSchema: {
            classification: '"subscription" | "one_off_invoice" | "unrelated" | null',
            classificationReason: "string | null",
            name: "string | null",
            type: '"paid" | "trial" | null',
            amount: "number | null",
            currency: "string | null",
            startDate: "YYYY-MM-DD | null",
            lastBilledDate: "YYYY-MM-DD | null",
            billingIntervalCount: "number | null",
            billingIntervalUnit: '"day" | "week" | "month" | "year" | null',
            paymentMethod: "string | null",
            latestEmailSummary: "string | null",
            statusSignal: '"active" | "cancelled" | "paused" | "refunded" | "unknown" | null',
            notes: "string | null",
          },
        }),
      },
    ],
  };

  const completion = await client.chat.completions.create(requestPayload);

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty extraction payload.");
  }

  const parsed = extractionOutputSchema.parse(JSON.parse(content));
  return {
    output: {
      ...parsed,
      startDate: normalizeDate(parsed.startDate),
      lastBilledDate: normalizeDate(parsed.lastBilledDate),
    },
    flags: [] as string[],
    debug: {
      mode: "openai",
      request: requestPayload,
      response: {
        rawContent: content,
        parsed,
      },
    },
  };
}

export async function extractProviderData(
  provider: ProviderConfig,
  sources: NormalizedInvoiceSource[],
): Promise<ExtractionResult> {
  if (!process.env.OPENAI_API_KEY) {
    return buildHeuristicExtraction(provider, sources);
  }

  try {
    return await extractWithOpenAi(provider, sources);
  } catch (error) {
    console.error(`OpenAI extraction failed for ${provider.id}:`, error);
    const heuristic = buildHeuristicExtraction(provider, sources);
    const fallback: ExtractionResult = {
      ...heuristic,
      debug: {
        mode: heuristic.debug.mode,
        request: heuristic.debug.request,
        response: heuristic.debug.response,
        notes: [
          ...(heuristic.debug.notes ?? []),
          error instanceof Error ? `OpenAI failed: ${error.message}` : "OpenAI failed.",
        ],
      },
    };
    return fallback;
  }
}
