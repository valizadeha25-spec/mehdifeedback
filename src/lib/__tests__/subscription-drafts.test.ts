import { describe, expect, it } from "vitest";

import { providerCatalog } from "@/lib/providers";
import { buildSubscriptionDraft } from "@/lib/subscription-drafts";

describe("subscription draft inference", () => {
  it("fills defaults and infers a monthly cycle from invoice history", () => {
    const provider = providerCatalog.find((candidate) => candidate.id === "spotify");
    const draft = buildSubscriptionDraft({
      provider: provider!,
      sources: [
        {
          text: "Spotify Premium receipt. Amount charged: $10.99",
          invoiceDate: "2026-01-15",
          messageId: "m1",
          attachmentId: null,
          sourceKind: "html",
          subject: "Spotify receipt",
          sender: "receipts@spotify.com",
          gmailUrl: "https://mail.google.com/mail/u/0/#all/m1",
          senderDomain: "spotify.com",
          senderGroup: "spotify",
          senderGroupLabel: "Spotify",
        },
        {
          text: "Spotify Premium receipt. Amount charged: $10.99",
          invoiceDate: "2026-02-15",
          messageId: "m2",
          attachmentId: null,
          sourceKind: "html",
          subject: "Spotify receipt",
          sender: "receipts@spotify.com",
          gmailUrl: "https://mail.google.com/mail/u/0/#all/m2",
          senderDomain: "spotify.com",
          senderGroup: "spotify",
          senderGroupLabel: "Spotify",
        },
      ],
      extraction: {
        output: {
          classification: "subscription",
          name: "Spotify Premium",
          type: "paid",
          amount: 10.99,
          currency: "USD",
          startDate: null,
          lastBilledDate: null,
          billingIntervalCount: null,
          billingIntervalUnit: null,
          paymentMethod: null,
          notes: "",
        },
        flags: [],
        debug: {
          mode: "heuristic",
          request: {},
          response: {},
        },
      },
    });

    expect(draft.billingIntervalCount).toBe(1);
    expect(draft.billingIntervalUnit).toBe("month");
    expect(draft.profile).toBe("Personal");
    expect(draft.reminderDays).toBe(3);
    expect(draft.flags).toContain("payment_method_missing");
    expect(draft.flags).toContain("first_seen_in_lookback");
  });

  it("drops confidence when amount and cycle remain ambiguous", () => {
    const provider = providerCatalog.find((candidate) => candidate.id === "figma");
    const draft = buildSubscriptionDraft({
      provider: provider!,
      sources: [
        {
          text: "Thanks for your Figma plan update.",
          invoiceDate: "2026-03-20",
          messageId: "m3",
          attachmentId: null,
          sourceKind: "text",
          subject: "Plan update",
          sender: "team@figma.com",
          gmailUrl: "https://mail.google.com/mail/u/0/#all/m3",
          senderDomain: "figma.com",
          senderGroup: "figma",
          senderGroupLabel: "Figma",
        },
      ],
      extraction: {
        output: {
          classification: "subscription",
          name: "Figma",
          type: "paid",
          amount: null,
          currency: null,
          startDate: null,
          lastBilledDate: null,
          billingIntervalCount: null,
          billingIntervalUnit: null,
          paymentMethod: null,
          notes: "",
        },
        flags: ["heuristic_extraction"],
        debug: {
          mode: "heuristic",
          request: {},
          response: {},
        },
      },
    });

    expect(draft.confidence).toBe("low");
    expect(draft.flags).toContain("amount_missing");
    expect(draft.flags).toContain("billing_cycle_needs_review");
  });
});
