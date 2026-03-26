import { describe, expect, it } from "vitest";

import { collectInlineBodies, collectPdfAttachments, htmlToInvoiceText } from "@/lib/mime";

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

describe("mime parsing", () => {
  it("extracts HTML and plain text bodies from nested Gmail payloads", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        {
          mimeType: "text/plain",
          body: { data: encode("Thanks for subscribing.\nAmount charged: $9.99") },
        },
        {
          mimeType: "text/html",
          body: {
            data: encode("<html><body><p>Invoice total: $9.99</p><a href='x'>view</a></body></html>"),
          },
        },
      ],
    };

    const bodies = collectInlineBodies(payload);

    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.text).toContain("Thanks for subscribing");
    expect(bodies[1]?.text).toContain("Invoice total: $9.99");
  });

  it("finds pdf attachments from Gmail parts", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "application/pdf",
          filename: "invoice.pdf",
          body: {
            attachmentId: "attachment-1",
          },
        },
      ],
    };

    const attachments = collectPdfAttachments(payload);

    expect(attachments).toEqual([
      {
        sourceKind: "pdf",
        attachmentId: "attachment-1",
        filename: "invoice.pdf",
      },
    ]);
  });

  it("strips noisy HTML while preserving readable text", () => {
    expect(htmlToInvoiceText("<div><strong>Total</strong><br/>$16.99</div>")).toContain("Total");
  });
});
