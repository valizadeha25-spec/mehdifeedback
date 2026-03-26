import { getPdfParserUrl } from "@/lib/env";

export async function parsePdfWithDocling(pdfBytes: Buffer, fileName: string | null) {
  const parserUrl = getPdfParserUrl();

  if (!parserUrl) {
    return null;
  }

  const response = await fetch(`${parserUrl}/parse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: fileName ?? "invoice.pdf",
      contentBase64: pdfBytes.toString("base64"),
    }),
  });

  if (!response.ok) {
    throw new Error(`Docling parser failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { text?: string | null };
  return payload.text?.trim() || null;
}
