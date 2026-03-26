import { ProviderConfig } from "@/lib/providers";

const fallbackSubjectKeywords = ["receipt", "invoice", "billing", "subscription", "renewal"];

function quoteIfNeeded(value: string) {
  return /\s/.test(value) ? `"${value}"` : value;
}

export function formatGmailAfterDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}/${month}/${day}`;
}

export function buildProviderQuery(provider: ProviderConfig, lookbackStart: Date) {
  const domains = provider.domains.join(" OR ");
  const subjectKeywords = Array.from(
    new Set([...fallbackSubjectKeywords, ...provider.subjectKeywords]),
  )
    .map(quoteIfNeeded)
    .join(" OR ");

  return [
    `after:${formatGmailAfterDate(lookbackStart)}`,
    `from:(${domains})`,
    `subject:(${subjectKeywords})`,
  ].join(" ");
}
