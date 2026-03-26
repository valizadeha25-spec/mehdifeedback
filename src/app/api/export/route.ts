import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { toExportPayload } from "@/lib/export";
import { subscriptionDraftSchema } from "@/lib/schemas";
import { getScanResult } from "@/lib/store";

const postRequestSchema = z
  .object({
    scanId: z.string().optional(),
    drafts: z.array(subscriptionDraftSchema).optional(),
  })
  .refine((value) => value.scanId || value.drafts, {
    message: "Provide either scanId or drafts.",
  });

export async function GET(request: NextRequest) {
  const scanId = request.nextUrl.searchParams.get("scanId");
  if (!scanId) {
    return NextResponse.json({ error: "scanId is required." }, { status: 400 });
  }

  const drafts = getScanResult(scanId);
  if (!drafts) {
    return NextResponse.json({ error: "Scan result not found or expired." }, { status: 404 });
  }

  const payload = toExportPayload(drafts);

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="subscription-sync-export.json"',
    },
  });
}

export async function POST(request: NextRequest) {
  const body = postRequestSchema.parse(await request.json());
  const drafts = body.drafts ?? (body.scanId ? getScanResult(body.scanId) : null);

  if (!drafts) {
    return NextResponse.json({ error: "Export payload could not be prepared." }, { status: 404 });
  }

  return NextResponse.json({ payload: toExportPayload(drafts) });
}
