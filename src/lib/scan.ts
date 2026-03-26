import pLimit from "p-limit";

import { saveLatestDebugSample } from "@/lib/debug-store";
import { extractProviderData } from "@/lib/extractor";
import type { SubscriptionDraft } from "@/lib/schemas";
import {
  createGmailClient,
  fetchRecentMessageHeaders,
  filterCandidateHeaders,
  groupCandidateHeaders,
  hydrateGroupSources,
  selectGroupHeaders,
  splitSourcesByServiceHint,
} from "@/lib/gmail";
import { assessRecurringSubscription } from "@/lib/subscription-signals";
import { buildSubscriptionDraft } from "@/lib/subscription-drafts";

export type ScanPhase =
  | "idle"
  | "fetching"
  | "filtering"
  | "grouping"
  | "parsing"
  | "extracting"
  | "ready"
  | "error";

export type ScanMetrics = {
  headersFetched: number;
  candidateEmails: number;
  senderGroups: number;
  messagesParsed: number;
  subscriptionsFound: number;
};

export type ScanProgressEvent = {
  type: "progress";
  phase: ScanPhase;
  detail: string;
  metrics: ScanMetrics;
  groupLabel?: string | null;
  draft?: SubscriptionDraft | null;
};

export function createLookbackStart(referenceDate = new Date()) {
  const lookback = new Date(referenceDate);
  lookback.setUTCMonth(lookback.getUTCMonth() - 12);
  return lookback;
}

function createInitialMetrics(): ScanMetrics {
  return {
    headersFetched: 0,
    candidateEmails: 0,
    senderGroups: 0,
    messagesParsed: 0,
    subscriptionsFound: 0,
  };
}

function getConfidenceScore(confidence: SubscriptionDraft["confidence"]) {
  if (confidence === "high") {
    return 3;
  }

  if (confidence === "medium") {
    return 2;
  }

  return 1;
}

function normalizeDraftName(name: string | null | undefined) {
  return (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function dedupeDrafts(drafts: SubscriptionDraft[]) {
  const kept: SubscriptionDraft[] = [];

  const ordered = [...drafts].sort((left, right) => {
    const confidenceDelta = getConfidenceScore(right.confidence) - getConfidenceScore(left.confidence);
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }

    return right.evidence.messageIds.length - left.evidence.messageIds.length;
  });

  for (const draft of ordered) {
    const duplicate = kept.find((existing) => {
      const sameName = normalizeDraftName(existing.name) === normalizeDraftName(draft.name);
      const sameAmount = existing.amount === draft.amount;
      const sameCurrency = existing.currency === draft.currency;
      const sameLastBilledDate = existing.lastBilledDate === draft.lastBilledDate;
      const overlappingMessages = draft.evidence.messageIds.some((messageId) =>
        existing.evidence.messageIds.includes(messageId),
      );

      return (sameName && sameAmount && sameCurrency && sameLastBilledDate) || (sameName && overlappingMessages);
    });

    if (!duplicate) {
      kept.push(draft);
    }
  }

  return kept.sort((left, right) => (left.name ?? "").localeCompare(right.name ?? ""));
}

export async function scanMailbox({
  accessToken,
  onProgress,
}: {
  accessToken: string;
  onProgress: (event: ScanProgressEvent) => void;
}) {
  const gmail = createGmailClient(accessToken);
  const lookbackStart = createLookbackStart();
  const extractionLimit = pLimit(4);
  const metrics = createInitialMetrics();
  const debugCapture = {
    saved: false,
  };

  const send = (phase: ScanPhase, detail: string, groupLabel?: string | null, draft?: SubscriptionDraft | null) => {
    onProgress({
      type: "progress",
      phase,
      detail,
      metrics: { ...metrics },
      groupLabel,
      draft,
    });
  };

  send("fetching", "Connecting to Gmail and collecting last-year message headers.");
  const headers = await fetchRecentMessageHeaders(gmail, lookbackStart);
  metrics.headersFetched = headers.length;
  send("fetching", `Fetched ${headers.length} message headers from the last 12 months.`);

  const candidateHeaders = filterCandidateHeaders(headers);
  metrics.candidateEmails = candidateHeaders.length;
  send(
    "filtering",
    `Filtered down to ${candidateHeaders.length} email headlines with subscription signals.`,
  );

  const groupedCandidates = groupCandidateHeaders(candidateHeaders);
  metrics.senderGroups = groupedCandidates.length;
  send(
    "grouping",
    `Grouped candidates into ${groupedCandidates.length} sender buckets for analysis.`,
  );

  const drafts = await Promise.all(
    groupedCandidates.map((group) =>
      extractionLimit(async () => {
        send("parsing", `Loading recent invoice-like emails from ${group.label}.`, group.label);
        const selectedHeaders = selectGroupHeaders(group);
        if (!selectedHeaders.length) {
          send("filtering", `Skipped ${group.label}: no billing-like headlines survived filtering.`, group.label);
          return null;
        }

        const sources = await hydrateGroupSources(gmail, group);
        metrics.messagesParsed += sources.length;
        send(
          "parsing",
          sources.length
            ? `Normalized ${sources.length} messages from ${group.label}.`
            : `No readable invoice content found for ${group.label}.`,
          group.label,
        );

        if (!sources.length) {
          return null;
        }

        const serviceClusters = splitSourcesByServiceHint(group, sources);
        const builtDrafts: SubscriptionDraft[] = [];

        for (const cluster of serviceClusters) {
          const clusterProvider = {
            ...group.provider,
            id: cluster.key,
            name: cluster.label,
          };

          send("extracting", `Sending ${cluster.label} evidence to extraction.`, cluster.label);
          const extraction = await extractProviderData(clusterProvider, cluster.sources);
          const classification = extraction.output.classification;

          if (classification !== "subscription") {
            send(
              "filtering",
              `Skipped ${cluster.label}: ${
                extraction.output.classificationReason ??
                classification.replace(/_/g, " ")
              }.`,
              cluster.label,
            );
            continue;
          }

          const recurringAssessment = assessRecurringSubscription({
            texts: cluster.sources.map((source) => `${source.subject ?? ""}\n${source.text}`),
            invoiceDates: Array.from(
              new Set(
                cluster.sources
                  .map((source) => source.invoiceDate)
                  .filter((invoiceDate): invoiceDate is string => Boolean(invoiceDate)),
              ),
            ).sort(),
            amount: extraction.output.amount,
            billingIntervalCount: extraction.output.billingIntervalCount,
            billingIntervalUnit: extraction.output.billingIntervalUnit,
            statusSignal: extraction.output.statusSignal ?? null,
          });

          if (extraction.flags.includes("heuristic_extraction") && !recurringAssessment.keep) {
            send(
              "filtering",
              `Skipped ${cluster.label}: ${recurringAssessment.reason.replace(/_/g, " ")}.`,
              cluster.label,
            );
            continue;
          }

          const draft = buildSubscriptionDraft({
            provider: clusterProvider,
            sources: cluster.sources,
            extraction,
          });

          if (!debugCapture.saved) {
            debugCapture.saved = true;
            await saveLatestDebugSample({
              providerId: cluster.key,
              providerName: cluster.label,
              foundEmails: group.headers,
              selectedForExtraction: selectedHeaders.filter((header) =>
                cluster.sources.some((source) => source.messageId === header.messageId),
              ),
              parsedSources: cluster.sources,
              extraction: extraction.debug,
              finalDraft: draft,
            });
          }

          metrics.subscriptionsFound += 1;
          send(
            "ready",
            `Built a draft for ${cluster.label}.`,
            cluster.label,
            draft,
          );
          builtDrafts.push(draft);
        }

        return builtDrafts;
      }),
    ),
  );

  const readyDrafts = drafts
    .flat()
    .filter((draft): draft is NonNullable<typeof draft> => Boolean(draft));
  const dedupedDrafts = dedupeDrafts(readyDrafts);

  send("ready", `Finished scanning. ${dedupedDrafts.length} subscription drafts are ready.`);
  return dedupedDrafts;
}
