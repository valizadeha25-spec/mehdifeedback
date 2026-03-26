"use client";

import { useDeferredValue, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

import type { ProviderDebugSample } from "@/lib/debug-store";
import type { ConfigurationState } from "@/lib/env";
import type { ProviderConfig } from "@/lib/providers";
import type { ScanMetrics, ScanPhase, ScanProgressEvent } from "@/lib/scan";
import type { SubscriptionDraft } from "@/lib/schemas";

type LandingShellProps = {
  configuration: ConfigurationState;
  providers: ProviderConfig[];
};

type ScanResultEvent = {
  type: "result";
  scanId: string;
  drafts: SubscriptionDraft[];
};

type ScanErrorEvent = {
  type: "error";
  message: string;
};

const phaseLabelMap: Record<ScanPhase, string> = {
  idle: "Idle",
  fetching: "Fetch",
  filtering: "Filter",
  grouping: "Group",
  parsing: "Parse",
  extracting: "LLM",
  ready: "Ready",
  error: "Error",
};

const initialMetrics: ScanMetrics = {
  headersFetched: 0,
  candidateEmails: 0,
  senderGroups: 0,
  messagesParsed: 0,
  subscriptionsFound: 0,
};

export function LandingShell({ configuration, providers }: LandingShellProps) {
  const { data: session, status } = useSession();
  const [drafts, setDrafts] = useState<SubscriptionDraft[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ScanMetrics>(initialMetrics);
  const [currentPhase, setCurrentPhase] = useState<ScanPhase>("idle");
  const [currentDetail, setCurrentDetail] = useState("");
  const [debugSample, setDebugSample] = useState<ProviderDebugSample | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const deferredDrafts = useDeferredValue(drafts);

  async function loadDebugSample() {
    const response = await fetch("/api/debug-sample", {
      cache: "no-store",
    });

    if (!response.ok) {
      setDebugSample(null);
      return;
    }

    const payload = (await response.json()) as { sample: ProviderDebugSample };
    setDebugSample(payload.sample);
  }

  async function handleScan() {
    setError(null);
    setDrafts([]);
    setMetrics(initialMetrics);
    setIsScanning(true);
    setCurrentPhase("fetching");
    setDebugSample(null);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Scan endpoint did not return a readable stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const event = JSON.parse(line) as ScanProgressEvent | ScanResultEvent | ScanErrorEvent;

          if (event.type === "progress") {
            setMetrics(event.metrics);
            setCurrentPhase(event.phase);
            setCurrentDetail(event.detail);
            if (event.draft) {
              setDrafts((prev) => [...prev, event.draft!]);
            }
            continue;
          }

          if (event.type === "error") {
            throw new Error(event.message);
          }

          if (event.type === "result") {
            setCurrentPhase("ready");
            await loadDebugSample();
          }
        }
      }
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Scan failed.");
      setCurrentPhase("error");
    } finally {
      setIsScanning(false);
    }
  }

  const signedIn = status === "authenticated" && Boolean(session?.user?.email);

  return (
    <main className="subioShell">
      {/* Simple Header */}
      <header className="subioSimpleHeader">
        <div className="subioBrand">
          <div className="subioLogo">S</div>
          <div>
            <h1>Subio</h1>
            <p className="subioSubtitle">Feedback for Subio — Your Intelligent Subscription Dashboard.</p>
          </div>
        </div>
      </header>

      {/* Hero / Explanation Section */}
      {!signedIn && (
        <section className="subioIntro">
          <ul className="subioBullets">
            <li>
              <strong>Connect Gmail</strong> — Read-only access to find what you pay for.
            </li>
            <li>
              <strong>Deep Scan</strong> — We analyze a year of headlines for memberships and invoices.
            </li>
            <li>
              <strong>AI Extraction</strong> — Our LLM extracts dates, cycles, and amounts automatically across {providers.length} seeded provider hints.
            </li>
          </ul>
          <div className="subioHeroActions">
            <button
              className="subioPrimaryButton large"
              disabled={!configuration.googleOAuthReady || status === "loading"}
              onClick={() => signIn("google")}
              type="button"
            >
              Connect Email
            </button>
          </div>
        </section>
      )}

      {/* Main Action Section */}
      {signedIn && (
        <section className="subioActionPanel">
          <div className="subioActionHeader">
            <div className="subioUserContext">
              <div className="subioUserBadge">
                <span className="subioUserDot" />
                <span>Connected as <strong>{session.user?.email}</strong></span>
              </div>
              <button className="subioTextButton" onClick={() => signOut()}>Disconnect</button>
            </div>
            {!isScanning && (
              <button 
                className={`subioPrimaryButton ${drafts.length ? 'ghost' : ''}`} 
                onClick={handleScan}
              >
                {drafts.length ? 'Scan Again' : 'Start Subscription Scan'}
              </button>
            )}
          </div>

          {(isScanning || drafts.length > 0 || error) && (
            <div className="subioWorkflow">
              <div className="subioWorkflowDots">
                {(["fetching", "filtering", "grouping", "parsing", "extracting", "ready"] as ScanPhase[]).map((phase) => (
                  <div key={phase} className={`subioWorkflowStep ${currentPhase === phase ? 'active' : ''} ${(['fetching', 'filtering', 'grouping', 'parsing', 'extracting', 'ready'].indexOf(currentPhase) > ['fetching', 'filtering', 'grouping', 'parsing', 'extracting', 'ready'].indexOf(phase)) ? 'completed' : ''}`}>
                    <div className="subioWorkflowDot" title={phaseLabelMap[phase]} />
                    <span className="subioWorkflowLabel">{phaseLabelMap[phase]}</span>
                  </div>
                ))}
              </div>

              <div className="subioWorkflowStatus">
                <div className="subioRealTimeStatus">
                  {isScanning ? (
                    <>
                      <p className="subioCurrentDetail">{currentDetail}</p>
                      <div className="subioMetrics">
                        <div className="subioMetricItem">
                          <strong>{metrics.headersFetched}</strong>
                          <span>Emails Found</span>
                        </div>
                        <div className="subioDivider" />
                        <div className="subioMetricItem">
                          <strong>{metrics.candidateEmails}</strong>
                          <span>Candidates</span>
                        </div>
                        <div className="subioDivider" />
                        <div className="subioMetricItem">
                          <strong>{metrics.subscriptionsFound}</strong>
                          <span>Subscriptions Found</span>
                        </div>
                      </div>
                    </>
                  ) : error ? (
                    <div className="subioAlert error">{error}</div>
                  ) : (
                    <p className="subioSuccessMessage">Scan complete. We found {drafts.length} subscriptions in your mailbox.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Results Section */}
      {deferredDrafts.length > 0 && (
        <section className="subioResultsLayout">
          <div className="subioResultGrid">
            {deferredDrafts.map((draft, index) => (
              <article key={`${draft.providerId}-${index}`} className="subioPremiumCard">
                <div className="subioCardFront">
                  <div className="subioCardHeader">
                    <div>
                      <span className="subioCategory">{draft.providerId}</span>
                      <h3>{draft.name || draft.providerId}</h3>
                    </div>
                    {draft.confidence === "high" && <span className="subioVerifiedBadge">Verified</span>}
                  </div>
                  
                  <div className="subioCardBody">
                    <div className="subioMainFact">
                      <span className="subioLabel">Invoice Amount</span>
                      <strong className="subioAmount">
                        {draft.amount !== null ? `${draft.currency || "$"} ${draft.amount.toFixed(2)}` : "—"}
                      </strong>
                    </div>
                    
                    <div className="subioCardMeta">
                      <div className="subioMetaItem">
                        <span className="subioLabel">Recurring</span>
                        <strong>{draft.billingIntervalUnit || "Monthly"}</strong>
                      </div>
                      <div className="subioMetaItem">
                        <span className="subioLabel">Last Paid</span>
                        <strong>{draft.lastBilledDate || "N/A"}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="subioEvidenceLinks">
                    <span className="subioLabel">Found in {draft.evidence.messages.length} emails:</span>
                    <div className="subioLinkList">
                      {draft.evidence.messages.map((m) => (
                        <a key={m.messageId} href={m.gmailUrl} target="_blank" rel="noreferrer" className="subioEmailLink">
                          {m.subject?.slice(0, 30)}...
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="subioDebugSection">
        <div className="subioActionHeader">
          <div className="subioUserContext">
            <span>Developer debug trace</span>
            <div className="subioInlineActions">
              <button
                className="subioTextButton"
                onClick={() => setShowDebug((current) => !current)}
                type="button"
              >
                {showDebug ? "Hide" : "Show"}
              </button>
              {showDebug ? (
                <button className="subioTextButton" onClick={loadDebugSample} type="button">
                  Refresh
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {!showDebug ? (
          <div className="subioMutedHint">
            Hidden by default. Use this only to inspect one sampled provider end to end.
          </div>
        ) : debugSample ? (
          <div className="subioDebugGrid">
            <article className="subioDebugCard">
              <h3>Matched emails</h3>
              <pre>{JSON.stringify(debugSample.foundEmails, null, 2)}</pre>
            </article>
            <article className="subioDebugCard">
              <h3>Chosen for extractor</h3>
              <pre>{JSON.stringify(debugSample.selectedForExtraction, null, 2)}</pre>
            </article>
            <article className="subioDebugCard">
              <h3>Parsed versions</h3>
              <pre>{JSON.stringify(debugSample.parsedSources, null, 2)}</pre>
            </article>
            <article className="subioDebugCard">
              <h3>LLM / extractor request</h3>
              <pre>{JSON.stringify(debugSample.extraction.request, null, 2)}</pre>
            </article>
            <article className="subioDebugCard">
              <h3>LLM / extractor output</h3>
              <pre>{JSON.stringify(debugSample.extraction.response, null, 2)}</pre>
            </article>
            <article className="subioDebugCard">
              <h3>Final draft</h3>
              <pre>{JSON.stringify(debugSample.finalDraft, null, 2)}</pre>
            </article>
          </div>
        ) : (
          <div className="subioAlert">
            Run a scan first. One sampled provider trace will appear here and also be written to
            <code> .tmp/latest-provider-debug.json</code>.
          </div>
        )}
      </section>
    </main>
  );
}
