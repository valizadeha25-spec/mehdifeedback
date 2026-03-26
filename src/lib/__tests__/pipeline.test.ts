import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { extractProviderData } from "@/lib/extractor";
import { providerCatalog } from "@/lib/providers";
import { buildSubscriptionDraft } from "@/lib/subscription-drafts";

const originalOpenAiKey = process.env.OPENAI_API_KEY;

describe("scan pipeline fixtures", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  });

  it("handles html-only monthly receipts", async () => {
    const provider = providerCatalog.find((candidate) => candidate.id === "spotify")!;
    const sources = [
      {
        text: "Spotify Premium receipt\nAmount charged: $10.99\nPaid with Visa 4242\nMonthly plan",
        invoiceDate: "2026-02-01",
        messageId: "html-1",
        attachmentId: null,
        sourceKind: "html" as const,
        subject: "Spotify receipt",
        sender: "no-reply@spotify.com",
        gmailUrl: "https://mail.google.com/mail/u/0/#all/html-1",
        senderDomain: "spotify.com",
        senderGroup: "spotify",
        senderGroupLabel: "Spotify",
      },
      {
        text: "Spotify Premium receipt\nAmount charged: $10.99\nPaid with Visa 4242\nMonthly plan",
        invoiceDate: "2026-03-01",
        messageId: "html-2",
        attachmentId: null,
        sourceKind: "html" as const,
        subject: "Spotify receipt",
        sender: "no-reply@spotify.com",
        gmailUrl: "https://mail.google.com/mail/u/0/#all/html-2",
        senderDomain: "spotify.com",
        senderGroup: "spotify",
        senderGroupLabel: "Spotify",
      },
    ];

    const extraction = await extractProviderData(provider, sources);
    const draft = buildSubscriptionDraft({ provider, sources, extraction });

    expect(draft.amount).toBe(10.99);
    expect(draft.billingIntervalUnit).toBe("month");
    expect(draft.paymentMethod).toContain("Visa");
  });

  it("handles pdf-only annual receipts", async () => {
    const provider = providerCatalog.find((candidate) => candidate.id === "nordvpn")!;
    const sources = [
      {
        text: "NordVPN receipt\nTotal: USD 79.99\n1-year plan\nPayment method: Credit Card 1111",
        invoiceDate: "2025-03-15",
        messageId: "pdf-1",
        attachmentId: "attachment-1",
        sourceKind: "pdf" as const,
        subject: "NordVPN invoice",
        sender: "billing@nordvpn.com",
        gmailUrl: "https://mail.google.com/mail/u/0/#all/pdf-1",
        senderDomain: "nordvpn.com",
        senderGroup: "nordvpn",
        senderGroupLabel: "NordVPN",
      },
      {
        text: "NordVPN receipt\nTotal: USD 79.99\n1-year plan\nPayment method: Credit Card 1111",
        invoiceDate: "2026-03-15",
        messageId: "pdf-2",
        attachmentId: "attachment-2",
        sourceKind: "pdf" as const,
        subject: "NordVPN invoice",
        sender: "billing@nordvpn.com",
        gmailUrl: "https://mail.google.com/mail/u/0/#all/pdf-2",
        senderDomain: "nordvpn.com",
        senderGroup: "nordvpn",
        senderGroupLabel: "NordVPN",
      },
    ];

    const extraction = await extractProviderData(provider, sources);
    const draft = buildSubscriptionDraft({ provider, sources, extraction });

    expect(draft.billingIntervalUnit).toBe("year");
    expect(draft.amount).toBe(79.99);
    expect(draft.paymentMethod).toContain("Credit Card");
  });

  it("tracks multiple invoices with price changes", async () => {
    const provider = providerCatalog.find((candidate) => candidate.id === "notion")!;
    const sources = [
      {
        text: "Notion invoice\nAmount charged: $8.00\nMonthly plan",
        invoiceDate: "2026-01-10",
        messageId: "n1",
        attachmentId: null,
        sourceKind: "text" as const,
        subject: "Notion receipt",
        sender: "team@notion.so",
        gmailUrl: "https://mail.google.com/mail/u/0/#all/n1",
        senderDomain: "notion.so",
        senderGroup: "notion",
        senderGroupLabel: "Notion",
      },
      {
        text: "Notion invoice\nAmount charged: $10.00\nMonthly plan",
        invoiceDate: "2026-03-10",
        messageId: "n2",
        attachmentId: null,
        sourceKind: "text" as const,
        subject: "Notion receipt",
        sender: "team@notion.so",
        gmailUrl: "https://mail.google.com/mail/u/0/#all/n2",
        senderDomain: "notion.so",
        senderGroup: "notion",
        senderGroupLabel: "Notion",
      },
    ];

    const extraction = await extractProviderData(provider, sources);
    const draft = buildSubscriptionDraft({ provider, sources, extraction });

    expect(draft.amount).toBe(10);
    expect(draft.startDate).toBe("2026-01-10");
    expect(draft.lastBilledDate).toBe("2026-03-10");
  });

  it("flags missing payment methods", async () => {
    const provider = providerCatalog.find((candidate) => candidate.id === "dropbox")!;
    const sources = [
      {
        text: "Dropbox invoice\nTotal: $19.99\nMonthly plan",
        invoiceDate: "2026-03-05",
        messageId: "d1",
        attachmentId: null,
        sourceKind: "html" as const,
        subject: "Dropbox invoice",
        sender: "billing@dropbox.com",
        gmailUrl: "https://mail.google.com/mail/u/0/#all/d1",
        senderDomain: "dropbox.com",
        senderGroup: "dropbox",
        senderGroupLabel: "Dropbox",
      },
    ];

    const extraction = await extractProviderData(provider, sources);
    const draft = buildSubscriptionDraft({ provider, sources, extraction });

    expect(draft.flags).toContain("payment_method_missing");
  });

  it("preserves trial detection from invoice wording", async () => {
    const provider = providerCatalog.find((candidate) => candidate.id === "duolingo")!;
    const sources = [
      {
        text: "Your free trial starts today.\nSuper Duolingo\nAmount charged: $0.00",
        invoiceDate: "2026-03-12",
        messageId: "t1",
        attachmentId: null,
        sourceKind: "text" as const,
        subject: "Trial started",
        sender: "support@duolingo.com",
        gmailUrl: "https://mail.google.com/mail/u/0/#all/t1",
        senderDomain: "duolingo.com",
        senderGroup: "duolingo",
        senderGroupLabel: "Duolingo",
      },
    ];

    const extraction = await extractProviderData(provider, sources);
    const draft = buildSubscriptionDraft({ provider, sources, extraction });

    expect(draft.type).toBe("trial");
  });
});
