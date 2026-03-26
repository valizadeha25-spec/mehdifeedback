import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MessageHeaderSummary, NormalizedInvoiceSource } from "@/lib/gmail";
import type { SubscriptionDraft } from "@/lib/schemas";

export type DebugMessageHeader = {
  messageId: string;
  subject: string | null;
  sender: string | null;
  invoiceDate: string | null;
  gmailUrl: string;
  senderDomain: string;
};

export type DebugParsedSource = {
  messageId: string;
  sourceKind: "html" | "text" | "pdf";
  invoiceDate: string | null;
  subject: string | null;
  sender: string | null;
  gmailUrl: string;
  textLength: number;
  textPreview: string;
};

export type ExtractionDebugTrace = {
  mode: "openai" | "heuristic";
  request: unknown;
  response: unknown;
  notes?: string[];
};

export type ProviderDebugSample = {
  capturedAt: string;
  providerId: string;
  providerName: string;
  foundEmails: DebugMessageHeader[];
  selectedForExtraction: DebugMessageHeader[];
  parsedSources: DebugParsedSource[];
  extraction: ExtractionDebugTrace;
  finalDraft: SubscriptionDraft;
};

let latestDebugSample: ProviderDebugSample | null = null;

function toDebugHeader(header: MessageHeaderSummary): DebugMessageHeader {
  return {
    messageId: header.messageId,
    subject: header.subject,
    sender: header.sender,
    invoiceDate: header.invoiceDate,
    gmailUrl: header.gmailUrl,
    senderDomain: header.senderDomain,
  };
}

function toDebugSource(source: NormalizedInvoiceSource): DebugParsedSource {
  return {
    messageId: source.messageId,
    sourceKind: source.sourceKind,
    invoiceDate: source.invoiceDate,
    subject: source.subject,
    sender: source.sender,
    gmailUrl: source.gmailUrl,
    textLength: source.text.length,
    textPreview: source.text.slice(0, 4000),
  };
}

export async function saveLatestDebugSample(sample: {
  providerId: string;
  providerName: string;
  foundEmails: MessageHeaderSummary[];
  selectedForExtraction: MessageHeaderSummary[];
  parsedSources: NormalizedInvoiceSource[];
  extraction: ExtractionDebugTrace;
  finalDraft: SubscriptionDraft;
}) {
  const normalized: ProviderDebugSample = {
    capturedAt: new Date().toISOString(),
    providerId: sample.providerId,
    providerName: sample.providerName,
    foundEmails: sample.foundEmails.map(toDebugHeader),
    selectedForExtraction: sample.selectedForExtraction.map(toDebugHeader),
    parsedSources: sample.parsedSources.map(toDebugSource),
    extraction: sample.extraction,
    finalDraft: sample.finalDraft,
  };

  latestDebugSample = normalized;

  const tmpDir = path.join(process.cwd(), ".tmp");
  await mkdir(tmpDir, { recursive: true });
  await writeFile(
    path.join(tmpDir, "latest-provider-debug.json"),
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8",
  );
}

export function getLatestDebugSample() {
  return latestDebugSample;
}
