import { describe, expect, it } from "vitest";

import { providerCatalog } from "@/lib/providers";
import { buildProviderQuery, formatGmailAfterDate } from "@/lib/query-builder";

describe("query builder", () => {
  it("formats Gmail after dates using the Gmail search format", () => {
    expect(formatGmailAfterDate(new Date("2026-03-26T12:30:00.000Z"))).toBe("2026/03/26");
  });

  it("builds a provider-specific Gmail query with lookback and subject terms", () => {
    const provider = providerCatalog.find((candidate) => candidate.id === "netflix");
    const query = buildProviderQuery(provider!, new Date("2025-03-26T00:00:00.000Z"));

    expect(query).toContain("after:2025/03/26");
    expect(query).toContain("from:(netflix.com)");
    expect(query).toContain("subject:(receipt OR invoice OR billing OR subscription OR renewal OR payment)");
  });
});
