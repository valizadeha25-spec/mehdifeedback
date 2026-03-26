import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { saveScanResult } from "@/lib/store";
import { scanMailbox } from "@/lib/scan";

export async function POST() {
  const session = await getServerSession(authOptions);
  const accessToken = session?.accessToken;

  if (!accessToken) {
    return Response.json({ error: "Google session is missing or expired." }, { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const drafts = await scanMailbox({
          accessToken,
          onProgress: send,
        });
        const scanId = saveScanResult(drafts);

        send({
          type: "result",
          scanId,
          drafts,
        });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Subscription scan failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
