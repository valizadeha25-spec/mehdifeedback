import { describe, expect, it } from "vitest";

import { filterCandidateHeaders } from "@/lib/gmail";
import { providerCatalog } from "@/lib/providers";
import { assessRecurringSubscription, inferServiceHint } from "@/lib/subscription-signals";

describe("subscription signal filtering", () => {
  it("rejects LinkedIn network activity emails", () => {
    const headers = filterCandidateHeaders([
      {
        messageId: "linkedin-1",
        threadId: "thread-1",
        subject: "Raphael Dine - GTM Specialist reacted to this post: Most people build lists.",
        sender: "LinkedIn <updates-noreply@linkedin.com>",
        senderDomain: "linkedin.com",
        senderName: "LinkedIn",
        internalDate: `${Date.now()}`,
        invoiceDate: "2026-03-25",
        gmailUrl: "https://mail.google.com/mail/u/0/#all/linkedin-1",
        provider: providerCatalog.find((provider) => provider.id === "linkedin-premium") ?? null,
      },
    ]);

    expect(headers).toHaveLength(0);
  });

  it("rejects product education and promo emails", () => {
    const headers = filterCandidateHeaders([
      {
        messageId: "notion-1",
        threadId: "thread-2",
        subject: "Meet your new research sidekick",
        sender: "Notion Team <team@mail.notion.so>",
        senderDomain: "mail.notion.so",
        senderName: "Notion Team",
        internalDate: `${Date.now()}`,
        invoiceDate: "2026-03-17",
        gmailUrl: "https://mail.google.com/mail/u/0/#all/notion-1",
        provider: providerCatalog.find((provider) => provider.id === "notion") ?? null,
      },
      {
        messageId: "grammarly-1",
        threadId: "thread-3",
        subject: "A year of Grammarly Pro, now $72! That’s 50% off.",
        sender: "Grammarly <hello@mail.grammarly.com>",
        senderDomain: "mail.grammarly.com",
        senderName: "Grammarly",
        internalDate: `${Date.now()}`,
        invoiceDate: "2026-03-20",
        gmailUrl: "https://mail.google.com/mail/u/0/#all/grammarly-1",
        provider: providerCatalog.find((provider) => provider.id === "grammarly") ?? null,
      },
    ]);

    expect(headers).toHaveLength(0);
  });

  it("keeps real subscription billing headlines", () => {
    const headers = filterCandidateHeaders([
      {
        messageId: "apple-1",
        threadId: "thread-4",
        subject: "Your Subscription is Confirmed",
        sender: "Apple <no_reply@email.apple.com>",
        senderDomain: "email.apple.com",
        senderName: "Apple",
        internalDate: `${Date.now()}`,
        invoiceDate: "2026-03-22",
        gmailUrl: "https://mail.google.com/mail/u/0/#all/apple-1",
        provider: providerCatalog.find((provider) => provider.id === "apple-icloud") ?? null,
      },
    ]);

    expect(headers).toHaveLength(1);
  });
});

describe("recurring subscription assessment", () => {
  it("rejects one-off Vercel credit receipts", () => {
    const assessment = assessRecurringSubscription({
      texts: [
        "Receipt from Vercel Inc.\nPaid March 19, 2026\nPayment Processing Fee\nAI Gateway Credits (per Credits)\nQty 20\n$20.00",
      ],
      invoiceDates: ["2026-03-19"],
      amount: 20.88,
      billingIntervalCount: null,
      billingIntervalUnit: null,
      statusSignal: "active",
    });

    expect(assessment.keep).toBe(false);
    expect(assessment.reason).toBe("one_off_invoice");
  });

  it("keeps recurring Apple subscription evidence", () => {
    const assessment = assessRecurringSubscription({
      texts: [
        "Subscription Confirmed\nRyan Chapman Membership (1 month)\nRenewal Price ₺3,99/month",
        "Invoice\nYouTube Premium (Monthly)\nRenews 20 April 2026\n₺104,99\nVisa •••• 5544",
      ],
      invoiceDates: ["2026-03-20", "2026-03-22"],
      amount: 104.99,
      billingIntervalCount: 1,
      billingIntervalUnit: "month",
      statusSignal: "active",
    });

    expect(assessment.keep).toBe(true);
  });

  it("rejects renewal marketing without proof of active billing", () => {
    const assessment = assessRecurringSubscription({
      texts: [
        "Reminder: Renew your NordVPN subscription\nPersonal offer\nLast call: Renew with a 2-year plan and save\nGet the Deal",
      ],
      invoiceDates: ["2026-03-16"],
      amount: 69.36,
      billingIntervalCount: null,
      billingIntervalUnit: null,
      statusSignal: "unknown",
    });

    expect(assessment.keep).toBe(false);
  });

  it("keeps cancellation lifecycle emails for real memberships", () => {
    const assessment = assessRecurringSubscription({
      texts: [
        "Your Mobbin membership has been cancelled and will end on May 18, 2026. You can continue to enjoy unlimited access until then.",
      ],
      invoiceDates: ["2026-03-21"],
      amount: null,
      billingIntervalCount: null,
      billingIntervalUnit: null,
      statusSignal: "cancelled",
    });

    expect(assessment.keep).toBe(true);
  });
});

describe("service hint inference", () => {
  it("splits Apple receipts by the billed service name", () => {
    expect(
      inferServiceHint({
        subject: "Your Subscription is Confirmed",
        text: "App\nYouTube\nSubscription\nRyan Chapman Membership\nRenewal Price ₺3,99/month",
      }),
    ).toBe("Ryan Chapman Membership");

    expect(
      inferServiceHint({
        subject: "Your invoice from Apple.",
        text: "Apple Account:\nme@example.com\nYouTube\nYouTube Premium (Monthly)\nRenews 20 April 2026",
      }),
    ).toBe("YouTube Premium");

    expect(
      inferServiceHint({
        subject: "Samsung Checkout on TV - Subscription Payment Receipt",
        text: "Subscription Details\nWarnerMedia Global Digital Services | HBO Max\nStandard\n(Next Payment Date: 04/19/2026)",
      }),
    ).toBe("HBO Max");
  });
});
