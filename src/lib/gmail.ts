import { google, gmail_v1 } from "googleapis";
import pLimit from "p-limit";

import { parsePdfWithDocling } from "@/lib/docling";
import {
  collectInlineBodies,
  collectPdfAttachments,
  decodeBase64UrlToBuffer,
  getHeader,
} from "@/lib/mime";
import { mailboxSignalKeywords, ProviderConfig, providerCatalog } from "@/lib/providers";
import { formatGmailAfterDate } from "@/lib/query-builder";
import { SourceKind } from "@/lib/schemas";
import {
  hasRecurringLanguage,
  hasStatusLanguage,
  inferServiceHint,
  scoreHeaderCandidate,
  shouldKeepTextCandidate,
} from "@/lib/subscription-signals";

const MAX_HEADER_MESSAGES = 600;
const MESSAGE_FETCH_CONCURRENCY = 8;

export type MessageHeaderSummary = {
  messageId: string;
  threadId: string | null;
  subject: string | null;
  sender: string | null;
  senderDomain: string;
  senderName: string | null;
  internalDate: string | null;
  invoiceDate: string | null;
  gmailUrl: string;
  provider: ProviderConfig | null;
};

export type GroupedSenderCandidate = {
  key: string;
  label: string;
  senderDomain: string;
  provider: ProviderConfig;
  headers: MessageHeaderSummary[];
};

export type NormalizedInvoiceSource = {
  text: string;
  invoiceDate: string | null;
  messageId: string;
  attachmentId: string | null;
  sourceKind: SourceKind;
  subject: string | null;
  sender: string | null;
  gmailUrl: string;
  senderDomain: string;
  senderGroup: string;
  senderGroupLabel: string;
};

export type ServiceSourceCluster = {
  key: string;
  label: string;
  provider: ProviderConfig;
  sources: NormalizedInvoiceSource[];
};

function toIsoDate(value: string | null | undefined, fallbackEpochMs?: string | null) {
  const parsed = value ? new Date(value) : fallbackEpochMs ? new Date(Number(fallbackEpochMs)) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeSender(sender: string | null) {
  if (!sender) {
    return { senderName: null, senderDomain: "unknown-sender" };
  }

  const emailMatch = sender.match(/<?([^<>\s]+@[^<>\s]+)>?/);
  const email = emailMatch?.[1]?.toLowerCase() ?? sender.toLowerCase();
  const senderDomain = email.includes("@") ? email.split("@").pop() ?? "unknown-sender" : email;
  const senderName = sender.replace(/<[^>]+>/g, "").replace(/"/g, "").trim() || null;

  return {
    senderName,
    senderDomain,
  };
}

function resolveProviderBySenderDomain(senderDomain: string) {
  return (
    providerCatalog.find((provider) =>
      provider.domains.some(
        (domain) => senderDomain === domain || senderDomain.endsWith(`.${domain}`),
      ),
    ) ?? null
  );
}

function createFallbackProvider(senderDomain: string, senderName: string | null): ProviderConfig {
  const shortLabel = senderName?.split("<")[0]?.trim() || senderDomain.split(".")[0] || "Unknown";
  const normalizedName = shortLabel
    .split(/[\s.-]+/)
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ");

  return {
    id: `sender-${senderDomain.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
    name: normalizedName,
    domains: [senderDomain],
    category: "Potential Subscription",
    website: senderDomain === "unknown-sender" ? "" : `https://${senderDomain}`,
    subjectKeywords: mailboxSignalKeywords,
  };
}

function hasMailboxSignal(subject: string | null) {
  if (!subject) {
    return false;
  }

  const normalized = subject.toLowerCase();
  return mailboxSignalKeywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function getHeaderScore(header: MessageHeaderSummary) {
  return scoreHeaderCandidate({
    subject: header.subject,
    sender: header.sender,
    providerKeywords: header.provider?.subjectKeywords ?? [],
  });
}

function buildGmailMessageUrl(messageId: string) {
  return `https://mail.google.com/mail/u/0/#all/${messageId}`;
}

export function createGmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  return google.gmail({
    version: "v1",
    auth,
  });
}

async function listRecentMessageIds(gmail: gmail_v1.Gmail, lookbackStart: Date) {
  const messageIds: string[] = [];
  let pageToken: string | undefined;

  while (messageIds.length < MAX_HEADER_MESSAGES) {
    const response = await gmail.users.messages.list({
      userId: "me",
      q: `after:${formatGmailAfterDate(lookbackStart)}`,
      maxResults: 100,
      pageToken,
    });

    const batchIds = (response.data.messages ?? [])
      .map((message) => message.id)
      .filter((messageId): messageId is string => Boolean(messageId));

    messageIds.push(...batchIds);

    pageToken = response.data.nextPageToken ?? undefined;
    if (!pageToken || !batchIds.length) {
      break;
    }
  }

  return messageIds.slice(0, MAX_HEADER_MESSAGES);
}

async function loadMessageMetadata(gmail: gmail_v1.Gmail, messageIds: string[]) {
  const limit = pLimit(MESSAGE_FETCH_CONCURRENCY);

  return Promise.all(
    messageIds.map((messageId) =>
      limit(async () => {
        const response = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });

        const message = response.data;
        const payload = message.payload;
        const sender = getHeader(payload?.headers, "from");
        const subject = getHeader(payload?.headers, "subject");
        const { senderDomain, senderName } = normalizeSender(sender);
        const provider = resolveProviderBySenderDomain(senderDomain);

        const summary: MessageHeaderSummary = {
          messageId,
          threadId: message.threadId ?? null,
          subject,
          sender,
          senderDomain,
          senderName,
          internalDate: message.internalDate ?? null,
          invoiceDate: toIsoDate(getHeader(payload?.headers, "date"), message.internalDate),
          gmailUrl: buildGmailMessageUrl(messageId),
          provider,
        };

        return summary;
      }),
    ),
  );
}

export async function fetchRecentMessageHeaders(gmail: gmail_v1.Gmail, lookbackStart: Date) {
  const messageIds = await listRecentMessageIds(gmail, lookbackStart);
  if (!messageIds.length) {
    return [];
  }

  const summaries = await loadMessageMetadata(gmail, messageIds);
  return summaries.sort((left, right) => {
    const leftValue = Number(left.internalDate ?? 0);
    const rightValue = Number(right.internalDate ?? 0);
    return rightValue - leftValue;
  });
}

export function filterCandidateHeaders(headers: MessageHeaderSummary[]) {
  return headers.filter((header) => {
    const assessment = getHeaderScore(header);
    if (assessment.passes) {
      return true;
    }

    if (!header.provider) {
      return false;
    }

    return hasMailboxSignal(header.subject) && assessment.score >= 1;
  });
}

export function groupCandidateHeaders(headers: MessageHeaderSummary[]) {
  const groups = new Map<string, GroupedSenderCandidate>();

  for (const header of headers) {
    const provider = header.provider ?? createFallbackProvider(header.senderDomain, header.senderName);
    const key = provider.id;
    const existing = groups.get(key);

    if (existing) {
      existing.headers.push(header);
      continue;
    }

    groups.set(key, {
      key,
      label: provider.name,
      senderDomain: header.senderDomain,
      provider,
      headers: [header],
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      headers: group.headers.sort((left, right) => {
        const leftValue = Number(left.internalDate ?? 0);
        const rightValue = Number(right.internalDate ?? 0);
        return rightValue - leftValue;
      }),
    }))
    .sort((left, right) => right.headers.length - left.headers.length);
}

export function selectGroupHeaders(group: GroupedSenderCandidate, limit = 3) {
  const scoredHeaders = group.headers
    .map((header) => ({
      header,
      assessment: getHeaderScore(header),
    }))
    .filter(({ header, assessment }) => assessment.score >= 0 || hasStatusLanguage(header.subject));
  const latestEligibleHeader =
    scoredHeaders.find(
      ({ header, assessment }) =>
        header === group.headers[0] &&
        (assessment.passes || hasStatusLanguage(header.subject) || hasRecurringLanguage(header.subject)),
    )?.header ?? null;
  const prioritized = scoredHeaders
    .filter(
      ({ header, assessment }) =>
        assessment.passes || hasStatusLanguage(header.subject) || hasRecurringLanguage(header.subject),
    )
    .sort((left, right) => {
      if (right.assessment.score !== left.assessment.score) {
        return right.assessment.score - left.assessment.score;
      }

      return Number(right.header.internalDate ?? 0) - Number(left.header.internalDate ?? 0);
    })
    .map(({ header }) => header);
  const selected = new Map<string, MessageHeaderSummary>();

  if (latestEligibleHeader) {
    selected.set(latestEligibleHeader.messageId, latestEligibleHeader);
  }

  for (const header of prioritized) {
    if (selected.size >= limit) {
      break;
    }
    selected.set(header.messageId, header);
  }

  if (selected.size < limit) {
    for (const { header } of scoredHeaders) {
      if (selected.size >= limit) {
        break;
      }
      selected.set(header.messageId, header);
    }
  }

  return Array.from(selected.values()).sort((left, right) => {
    const leftValue = Number(left.internalDate ?? 0);
    const rightValue = Number(right.internalDate ?? 0);
    return rightValue - leftValue;
  });
}

async function getFullMessages(gmail: gmail_v1.Gmail, messageIds: string[]) {
  const limit = pLimit(MESSAGE_FETCH_CONCURRENCY);

  return Promise.all(
    messageIds.map((messageId) =>
      limit(async () => {
        const response = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "full",
        });

        return response.data;
      }),
    ),
  );
}

async function getAttachmentBuffer(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachmentId: string,
  userId = "me",
) {
  const response = await gmail.users.messages.attachments.get({
    userId,
    messageId,
    id: attachmentId,
  });

  if (!response.data.data) {
    return null;
  }

  return decodeBase64UrlToBuffer(response.data.data);
}

async function normalizeMessage(
  gmail: gmail_v1.Gmail,
  group: GroupedSenderCandidate,
  message: gmail_v1.Schema$Message,
) {
  const messageId = message.id;
  const payload = message.payload;

  if (!messageId || !payload) {
    return [];
  }

  const invoiceDate = toIsoDate(getHeader(payload.headers, "date"), message.internalDate);
  const subject = getHeader(payload.headers, "subject");
  const sender = getHeader(payload.headers, "from");
  const { senderDomain } = normalizeSender(sender);

  const inlineBodies = collectInlineBodies(payload).map<NormalizedInvoiceSource>((candidate) => ({
    text: candidate.text,
    invoiceDate,
    messageId,
    attachmentId: null,
    sourceKind: candidate.sourceKind,
    subject,
    sender,
    gmailUrl: buildGmailMessageUrl(messageId),
    senderDomain,
    senderGroup: group.key,
    senderGroupLabel: group.label,
  }));

  const pdfAttachments = collectPdfAttachments(payload);
  const pdfLimit = pLimit(2);
  const parsedPdfBodies = await Promise.all(
    pdfAttachments.map((attachment) =>
      pdfLimit(async () => {
        const buffer = await getAttachmentBuffer(gmail, messageId, attachment.attachmentId);
        if (!buffer) {
          return null;
        }

        const text = await parsePdfWithDocling(buffer, attachment.filename);
        if (!text) {
          return null;
        }

        return {
          text,
          invoiceDate,
          messageId,
          attachmentId: attachment.attachmentId,
          sourceKind: "pdf" as const,
          subject,
          sender,
          gmailUrl: buildGmailMessageUrl(messageId),
          senderDomain,
          senderGroup: group.key,
          senderGroupLabel: group.label,
        };
      }),
    ),
  );

  const pdfBodies = parsedPdfBodies.filter(Boolean) as NormalizedInvoiceSource[];

  return [...inlineBodies, ...pdfBodies].filter(
    (candidate, index, candidates) =>
      candidate.text &&
      shouldKeepTextCandidate(candidate.text) &&
      candidates.findIndex(
        (other) =>
          other.messageId === candidate.messageId &&
          other.attachmentId === candidate.attachmentId &&
          other.sourceKind === candidate.sourceKind,
      ) === index,
  );
}

export async function hydrateGroupSources(gmail: gmail_v1.Gmail, group: GroupedSenderCandidate) {
  const selectedHeaders = selectGroupHeaders(group);
  if (!selectedHeaders.length) {
    return [];
  }

  const messages = await getFullMessages(
    gmail,
    selectedHeaders.map((header) => header.messageId),
  );
  const normalized = await Promise.all(
    messages.map((message) => normalizeMessage(gmail, group, message)),
  );

  return normalized
    .flat()
    .sort((left, right) => (right.invoiceDate ?? "").localeCompare(left.invoiceDate ?? ""))
    .slice(0, 9);
}

function normalizeClusterKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function splitSourcesByServiceHint(
  group: GroupedSenderCandidate,
  sources: NormalizedInvoiceSource[],
) {
  const clusters = new Map<string, ServiceSourceCluster>();

  for (const source of sources) {
    const inferredLabel =
      inferServiceHint({
        subject: source.subject,
        text: source.text,
      }) ?? group.label;
    const normalizedLabel = inferredLabel.trim() || group.label;
    const clusterKey = normalizeClusterKey(`${group.key}-${normalizedLabel}`) || group.key;
    const nextSource: NormalizedInvoiceSource = {
      ...source,
      senderGroup: clusterKey,
      senderGroupLabel: normalizedLabel,
    };
    const existing = clusters.get(clusterKey);

    if (existing) {
      existing.sources.push(nextSource);
      continue;
    }

    clusters.set(clusterKey, {
      key: clusterKey,
      label: normalizedLabel,
      provider: group.provider,
      sources: [nextSource],
    });
  }

  return Array.from(clusters.values())
    .map((cluster) => ({
      ...cluster,
      sources: cluster.sources.sort((left, right) => (right.invoiceDate ?? "").localeCompare(left.invoiceDate ?? "")),
    }))
    .sort((left, right) => right.sources.length - left.sources.length);
}
