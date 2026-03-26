import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { extractProviderData } from "@/lib/extractor";
import { providerById } from "@/lib/providers";
import { providerExtractionInputSchema } from "@/lib/schemas";
import { buildSubscriptionDraft } from "@/lib/subscription-drafts";

const requestSchema = z.object({
  providers: z.array(providerExtractionInputSchema),
});

export async function POST(request: NextRequest) {
  const body = requestSchema.parse(await request.json());

  const drafts = await Promise.all(
    body.providers.map(async (providerInput) => {
      const provider = providerById.get(providerInput.providerId);
      if (!provider) {
        throw new Error(`Unknown provider: ${providerInput.providerId}`);
      }

      const extraction = await extractProviderData(provider, providerInput.texts);
      if (extraction.output.classification !== "subscription") {
        return null;
      }

      return buildSubscriptionDraft({
        provider,
        sources: providerInput.texts,
        extraction,
      });
    }),
  );

  return NextResponse.json({ drafts: drafts.filter(Boolean) });
}
