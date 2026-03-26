import { gmail_v1 } from "googleapis";
import { convert } from "html-to-text";

type InlineCandidate = {
  sourceKind: "html" | "text";
  text: string;
};

type PdfCandidate = {
  sourceKind: "pdf";
  attachmentId: string;
  filename: string | null;
};

function walkParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  visit: (node: gmail_v1.Schema$MessagePart) => void,
) {
  if (!part) {
    return;
  }

  visit(part);

  for (const child of part.parts ?? []) {
    walkParts(child, visit);
  }
}

export function decodeBase64UrlToBuffer(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function decodeBase64UrlToText(value: string) {
  return decodeBase64UrlToBuffer(value).toString("utf8");
}

export function htmlToInvoiceText(html: string) {
  return convert(html, {
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
    wordwrap: false,
  })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function collectInlineBodies(payload: gmail_v1.Schema$MessagePart | undefined) {
  const candidates: InlineCandidate[] = [];

  walkParts(payload, (node) => {
    if (!node.mimeType || !node.body?.data) {
      return;
    }

    if (node.mimeType === "text/html") {
      const html = decodeBase64UrlToText(node.body.data);
      const text = htmlToInvoiceText(html);
      if (text) {
        candidates.push({ sourceKind: "html", text });
      }
    }

    if (node.mimeType === "text/plain") {
      const text = decodeBase64UrlToText(node.body.data).trim();
      if (text) {
        candidates.push({ sourceKind: "text", text });
      }
    }
  });

  return candidates;
}

export function collectPdfAttachments(payload: gmail_v1.Schema$MessagePart | undefined) {
  const attachments: PdfCandidate[] = [];

  walkParts(payload, (node) => {
    if (node.mimeType !== "application/pdf" || !node.body?.attachmentId) {
      return;
    }

    attachments.push({
      sourceKind: "pdf",
      attachmentId: node.body.attachmentId,
      filename: node.filename ?? null,
    });
  });

  return attachments;
}

export function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string) {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
}
