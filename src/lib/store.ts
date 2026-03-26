import { SubscriptionDraft } from "@/lib/schemas";

type StoredScan = {
  drafts: SubscriptionDraft[];
  createdAt: number;
};

const MAX_SCAN_AGE_MS = 1000 * 60 * 30;
const scanStore = new Map<string, StoredScan>();

function cleanupExpiredScans() {
  const now = Date.now();
  for (const [scanId, stored] of scanStore.entries()) {
    if (now - stored.createdAt > MAX_SCAN_AGE_MS) {
      scanStore.delete(scanId);
    }
  }
}

export function saveScanResult(drafts: SubscriptionDraft[]) {
  cleanupExpiredScans();
  const scanId = crypto.randomUUID();
  scanStore.set(scanId, { drafts, createdAt: Date.now() });
  return scanId;
}

export function getScanResult(scanId: string) {
  cleanupExpiredScans();
  return scanStore.get(scanId)?.drafts ?? null;
}
