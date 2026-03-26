import { NextResponse } from "next/server";

import { getLatestDebugSample } from "@/lib/debug-store";

export async function GET() {
  const sample = getLatestDebugSample();

  if (!sample) {
    return NextResponse.json({ error: "No debug sample captured yet." }, { status: 404 });
  }

  return NextResponse.json({ sample });
}
