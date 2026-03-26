const strongBillingSubjectPatterns = [
  /\binvoice\b/i,
  /\breceipt\b/i,
  /\bbilling\b/i,
  /\bpayment received\b/i,
  /\bsubscription confirmed\b/i,
  /\bmembership\b/i,
  /\brenewal\b/i,
  /\brenews?\b/i,
  /\btrial (?:started|ends?)\b/i,
  /\bpaid\b/i,
];

const recurringPatterns = [
  /\bsubscription\b/i,
  /\bmember(?:ship)?\b/i,
  /\brenews?\b/i,
  /\brenewal\b/i,
  /\bauto[- ]?renew\b/i,
  /\bmonthly\b/i,
  /\bannually\b/i,
  /\bannual\b/i,
  /\byearly\b/i,
  /\bquarterly\b/i,
  /\bper month\b/i,
  /\bper year\b/i,
  /\b1 month\b/i,
  /\b1-year\b/i,
  /\btrial\b/i,
];

const statusPatterns = [
  /\bcancelled\b/i,
  /\bcanceled\b/i,
  /\bwill end on\b/i,
  /\bwon['’]t renew\b/i,
  /\bwill not renew\b/i,
  /\bpaused\b/i,
  /\bpause your subscription\b/i,
  /\brefunded\b/i,
  /\brefund issued\b/i,
  /\brefund processed\b/i,
];

const marketingSubjectPatterns = [
  /\breacted to this post\b/i,
  /\bjust posted\b/i,
  /\bcommented on this\b/i,
  /\bnext steps\b/i,
  /\bweekly writing update\b/i,
  /\bresearch sidekick\b/i,
  /\bcontext switching\b/i,
  /\bupgrade\b/i,
  /\boffer\b/i,
  /\bdiscount\b/i,
  /\binvitation\b/i,
  /\binvitations\b/i,
  /\bmessaged you\b/i,
  /\bview .* post\b/i,
  /\bsuggested for you\b/i,
  /\byour posts got\b/i,
  /\bad credit\b/i,
  /\bverify your new device\b/i,
  /\bhiring\b/i,
  /\bget pro\b/i,
  /\btry it now\b/i,
  /\bjump back in\b/i,
  /\bwe['’]ve missed having you around\b/i,
  /\bpersonal offer\b/i,
  /\blast call\b/i,
  /\bwelcome to\b/i,
];

const marketingBodyPatterns = [
  /network conversations/i,
  /suggested for you/i,
  /promotional messages/i,
  /product education and how-to/i,
  /weekly writing update/i,
  /\bupgrade now\b/i,
  /\bget started\b/i,
  /\bview in browser\b/i,
  /\bfollow\b/i,
  /\blike praise empathy\b/i,
  /\bcomments?\b/i,
  /\brecruiter messages\b/i,
  /\byou are receiving this email because members like you/i,
  /\bget the deal\b/i,
  /\bsave \d+%/i,
];

const oneOffPurchasePatterns = [
  /\bcredits\b/i,
  /\btop up\b/i,
  /\busage tier\b/i,
  /\bspend caps?\b/i,
  /\bbilling caps?\b/i,
  /\bapi usage\b/i,
  /\bpayment processing fee\b/i,
  /\border placed\b/i,
  /\bdownload receipt\b/i,
  /\bdownload invoice\b/i,
];

const positiveSenderFragments = [
  "billing",
  "receipt",
  "receipts",
  "invoice",
  "invoices",
  "statement",
  "statements",
  "payment",
  "payments",
];

const negativeSenderFragments = [
  "updates",
  "messages",
  "notifications",
  "newsletter",
  "newsletters",
  "digest",
  "hello",
  "security",
  "jobs",
  "community",
  "invitations",
];

function everyPatternMisses(patterns: RegExp[], text: string | null | undefined) {
  const normalized = text ?? "";
  return patterns.every((pattern) => !pattern.test(normalized));
}

function anyPatternMatches(patterns: RegExp[], text: string | null | undefined) {
  const normalized = text ?? "";
  return patterns.some((pattern) => pattern.test(normalized));
}

export function hasStrongBillingSubject(subject: string | null | undefined) {
  return anyPatternMatches(strongBillingSubjectPatterns, subject);
}

export function hasRecurringLanguage(text: string | null | undefined) {
  return anyPatternMatches(recurringPatterns, text);
}

export function hasStatusLanguage(text: string | null | undefined) {
  return anyPatternMatches(statusPatterns, text);
}

export function isMarketingSubject(subject: string | null | undefined) {
  return anyPatternMatches(marketingSubjectPatterns, subject);
}

export function isMarketingBody(text: string | null | undefined) {
  return anyPatternMatches(marketingBodyPatterns, text);
}

export function isOneOffPurchase(text: string | null | undefined) {
  return anyPatternMatches(oneOffPurchasePatterns, text);
}

export function hasTransactionLanguage(text: string | null | undefined) {
  return anyPatternMatches(
    [
      /\binvoice\b/i,
      /\breceipt\b/i,
      /\bamount paid\b/i,
      /\bpayment amount\b/i,
      /\bpaid\b/i,
      /\bcharged\b/i,
      /\border placed\b/i,
      /\border id\b/i,
      /\bpayment method\b/i,
      /\bbilled\b/i,
      /\brenewal price\b/i,
    ],
    text,
  );
}

export function hasSubscriptionLifecycleLanguage(text: string | null | undefined) {
  return anyPatternMatches(
    [
      /\bcontinues .* until cancelled\b/i,
      /\bwill end on\b/i,
      /\brenews? \d/i,
      /\bnext payment date\b/i,
      /\bsubscription (?:has been )?cancelled\b/i,
      /\bmembership has been cancelled\b/i,
      /\bwill be billed each plan period\b/i,
      /\bvalid until the end of the current cycle\b/i,
      /\bdeactivated on\b/i,
    ],
    text,
  );
}

export function getSenderLocalPart(sender: string | null | undefined) {
  const match = sender?.match(/<?([^<>\s]+@[^<>\s]+)>?/);
  const email = match?.[1]?.toLowerCase();
  if (!email || !email.includes("@")) {
    return "";
  }

  return email.split("@")[0] ?? "";
}

export function scoreHeaderCandidate({
  subject,
  sender,
  providerKeywords = [],
}: {
  subject: string | null | undefined;
  sender: string | null | undefined;
  providerKeywords?: string[];
}) {
  const reasons: string[] = [];
  let score = 0;

  if (isMarketingSubject(subject)) {
    return {
      score: -10,
      passes: false,
      reasons: ["marketing_subject"],
    };
  }

  if (hasStrongBillingSubject(subject)) {
    score += 4;
    reasons.push("strong_billing_subject");
  }

  if (hasRecurringLanguage(subject)) {
    score += 3;
    reasons.push("recurring_subject");
  }

  if (hasStatusLanguage(subject)) {
    score += 2;
    reasons.push("status_subject");
  }

  const normalizedSubject = subject?.toLowerCase() ?? "";
  const providerKeywordHit = providerKeywords.some((keyword) =>
    normalizedSubject.includes(keyword.toLowerCase()),
  );

  if (providerKeywordHit) {
    score += 2;
    reasons.push("provider_keyword_subject");
  }

  const senderLocalPart = getSenderLocalPart(sender);
  if (positiveSenderFragments.some((fragment) => senderLocalPart.includes(fragment))) {
    score += 1;
    reasons.push("billing_sender");
  }

  if (negativeSenderFragments.some((fragment) => senderLocalPart.includes(fragment))) {
    score -= 2;
    reasons.push("marketing_sender");
  }

  return {
    score,
    passes: score >= 3,
    reasons,
  };
}

export function assessRecurringSubscription({
  texts,
  invoiceDates,
  amount,
  billingIntervalCount,
  billingIntervalUnit,
  statusSignal,
}: {
  texts: Array<string | null | undefined>;
  invoiceDates: string[];
  amount: number | null | undefined;
  billingIntervalCount: number | null | undefined;
  billingIntervalUnit: string | null | undefined;
  statusSignal: string | null | undefined;
}) {
  const combinedText = texts.filter(Boolean).join("\n\n");
  const recurringSignal = texts.some((text) => hasRecurringLanguage(text));
  const statusSignalPresent = Boolean(statusSignal && statusSignal !== "unknown");
  const intervalSignal = Boolean(billingIntervalCount && billingIntervalUnit);
  const repeatedInvoices = invoiceDates.length >= 2;
  const transactionSignal = texts.some((text) => hasTransactionLanguage(text));
  const lifecycleSignal = texts.some((text) => hasSubscriptionLifecycleLanguage(text));
  const marketingHeavy =
    texts.length > 0 &&
    texts.filter((text) => isMarketingBody(text)).length === texts.filter(Boolean).length;
  const oneOffSignal = isOneOffPurchase(combinedText);

  if (marketingHeavy && !repeatedInvoices && !intervalSignal && !statusSignalPresent) {
    return {
      keep: false,
      reason: "marketing_content_only",
    };
  }

  if (repeatedInvoices && (amount !== null || recurringSignal || intervalSignal || statusSignalPresent)) {
    return {
      keep: true,
      reason: "repeated_invoice_history",
    };
  }

  if (intervalSignal) {
    return {
      keep: true,
      reason: "explicit_billing_interval",
    };
  }

  if (recurringSignal && (transactionSignal || lifecycleSignal || statusSignalPresent)) {
    return {
      keep: true,
      reason: "recurring_language_and_billing_signal",
    };
  }

  if (statusSignalPresent && (recurringSignal || lifecycleSignal)) {
    return {
      keep: true,
      reason: "status_change_for_subscription",
    };
  }

  if (oneOffSignal && !recurringSignal && !repeatedInvoices && !intervalSignal) {
    return {
      keep: false,
      reason: "one_off_invoice",
    };
  }

  if (amount !== null && !recurringSignal && !repeatedInvoices && !intervalSignal) {
    return {
      keep: false,
      reason: "single_charge_without_subscription_evidence",
    };
  }

  return {
    keep: false,
    reason: "insufficient_recurring_evidence",
  };
}

export function shouldKeepTextCandidate(text: string | null | undefined) {
  return everyPatternMisses(marketingBodyPatterns, text) || hasRecurringLanguage(text);
}

function normalizeServiceHintLine(line: string) {
  return line
    .replace(/\s+/g, " ")
    .replace(/\((monthly|yearly|annual|quarterly|1 month|1 year)\)/gi, "")
    .replace(/^your membership to /i, "")
    .replace(/^your receipt from /i, "")
    .replace(/\brenews?.*$/i, "")
    .trim();
}

function isGenericServiceLine(line: string) {
  return [
    /^invoice$/i,
    /^billing and payment$/i,
    /^subscription details$/i,
    /^service provider$/i,
    /^details$/i,
    /^apple account:?$/i,
    /^document:?$/i,
    /^sequence:?$/i,
    /^order id:?$/i,
    /^subtotal$/i,
    /^vat/i,
    /^manage subscriptions/i,
    /^purchase history/i,
    /^all rights reserved/i,
    /^privacy/i,
    /^terms of sale/i,
    /^app$/i,
    /^subscription$/i,
    /^ordered from$/i,
    /^items$/i,
  ].some((pattern) => pattern.test(line));
}

export function inferServiceHint({
  subject,
  text,
}: {
  subject: string | null | undefined;
  text: string | null | undefined;
}) {
  const lines = (text ?? "")
    .split("\n")
    .map((line) => normalizeServiceHintLine(line))
    .filter(Boolean);

  const pairedKeywordIndices = [
    "subscription",
    "app",
    "service provider",
    "subscription details",
  ];

  for (const keyword of pairedKeywordIndices) {
    const index = lines.findIndex((line) => line.toLowerCase() === keyword);
    if (index >= 0) {
      const candidate = lines[index + 1];
      if (candidate && !isGenericServiceLine(candidate)) {
        return candidate.includes("|") ? candidate.split("|").pop()?.trim() ?? candidate : candidate;
      }
    }
  }

  const planLine = lines.find((line) =>
    /\b(membership|premium|pro|plus|basic|standard|plan)\b/i.test(line),
  );
  if (planLine && !isGenericServiceLine(planLine)) {
    return planLine;
  }

  const renewIndex = lines.findIndex((line) => /^renews? /i.test(line));
  if (renewIndex > 0) {
    const candidate = lines[renewIndex - 1];
    if (candidate && !isGenericServiceLine(candidate)) {
      return candidate;
    }
  }

  const normalizedSubject = normalizeServiceHintLine(subject ?? "");
  if (
    normalizedSubject &&
    !isGenericServiceLine(normalizedSubject) &&
    !isMarketingSubject(normalizedSubject)
  ) {
    const subjectHint = normalizedSubject
      .replace(/^your invoice from [^.]+\.*$/i, "")
      .replace(/^your subscription is confirmed$/i, "")
      .trim();
    if (subjectHint) {
      return subjectHint;
    }
  }

  return null;
}
