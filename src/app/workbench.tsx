"use client";

import {
  ArrowRight, BarChart3, Check, ChevronRight, Cloud, Cpu, FileLock2,
  Gauge, LoaderCircle, LockKeyhole, Play, RotateCcw, ShieldCheck, Sparkles, Wifi, WifiOff, Zap,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  approveCloudEnvelope,
  createCloudEnvelopeDraft,
  type CloudEnvelope,
  type CloudEnvelopeDraft,
} from "@/lib/cloud-envelope";
import { getLocalEngineStatus, prepareLocalModel, runLocalModel, type LocalEngineStatus } from "@/lib/local-engine";
import { clearLedger, emptyLedgerSnapshot, readLedger, subscribeLedger, summarizeLedger, writeLedger, type LedgerEntry } from "@/lib/ledger";
import {
  enqueueCloudEnvelope,
  emptyCloudQueueSnapshot,
  markCloudQueueReadyForReview,
  markCloudQueueReviewing,
  markCloudQueueReady,
  readCloudQueue,
  removeCloudQueueItem,
  subscribeCloudQueue,
  writeCloudQueue,
  type QueuedCloudEnvelope,
} from "@/lib/offline-queue";
import { redactTexts } from "@/lib/redaction";
import { detectSensitivity, estimateTokens, routeRequest, type RouteDecision, type Sensitivity } from "@/lib/router";
import styles from "./page.module.css";

type RunState = "idle" | "routing" | "ready" | "running-cloud" | "done";
type Connectivity = "checking" | "online" | "offline";

export default function Workbench() {
  const [prompt, setPrompt] = useState("");
  const [context, setContext] = useState("");
  const [sensitivity, setSensitivity] = useState<Sensitivity>("public");
  const [protectedTerms, setProtectedTerms] = useState("");
  const [reviewedInstruction, setReviewedInstruction] = useState("");
  const [reviewedEvidence, setReviewedEvidence] = useState("");
  const [engineStatus, setEngineStatus] = useState<LocalEngineStatus>("checking");
  const [connectivity, setConnectivity] = useState<Connectivity>("checking");
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const [runState, setRunState] = useState<RunState>("idle");
  const [decision, setDecision] = useState<RouteDecision | null>(null);
  const [answer, setAnswer] = useState("");
  const [answerEngine, setAnswerEngine] = useState("");
  const [latency, setLatency] = useState(0);
  const ledger = useSyncExternalStore(subscribeLedger, readLedger, emptyLedgerSnapshot);
  const cloudQueue = useSyncExternalStore(subscribeCloudQueue, readCloudQueue, emptyCloudQueueSnapshot);
  const [queuedReviewId, setQueuedReviewId] = useState<string | null>(null);
  const [queuedReviewInstruction, setQueuedReviewInstruction] = useState("");
  const [queuedReviewEvidence, setQueuedReviewEvidence] = useState("");
  const cloudSubmissionRef = useRef(false);
  const stats = summarizeLedger(ledger);

  useEffect(() => {
    getLocalEngineStatus().then(setEngineStatus);

    let active = true;
    const checkConnectivity = async () => {
      if (!navigator.onLine) {
        if (active) setConnectivity("offline");
        return;
      }
      try {
        const response = await fetch("/api/connectivity", { cache: "no-store", signal: AbortSignal.timeout(4500) });
        const result = (await response.json()) as { online?: boolean; configured?: boolean };
        if (active) setCloudConfigured(result.configured === true);
        if (active) setConnectivity(response.ok && result.online ? "online" : "offline");
      } catch {
        if (active) setConnectivity("offline");
      }
    };
    const markOffline = () => setConnectivity("offline");
    const recheckOnline = () => void checkConnectivity();

    void checkConnectivity();
    const interval = window.setInterval(checkConnectivity, 4000);
    window.addEventListener("online", recheckOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", recheckOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  useEffect(() => {
    if (connectivity !== "online") return;
    const current = readCloudQueue();
    const next = markCloudQueueReady(current);
    if (next.some((item, index) => item.status !== current[index]?.status)) writeCloudQueue(next);
  }, [connectivity]);

  function protectedTermList(): string[] {
    return protectedTerms.split(",").map((term) => term.trim()).filter(Boolean);
  }

  function invalidateResult() {
    setDecision(null);
    setAnswer("");
    setAnswerEngine("");
    setLatency(0);
    setRunState("idle");
    setReviewedInstruction("");
    setReviewedEvidence("");
  }

  function updateContext(value: string) {
    setContext(value);
    invalidateResult();
  }

  function updatePrompt(value: string) {
    setPrompt(value);
    invalidateResult();
  }

  function updateSensitivity(value: Sensitivity) {
    setSensitivity(value);
    invalidateResult();
  }

  function updateProtectedTerms(value: string) {
    setProtectedTerms(value);
    invalidateResult();
  }

  function appendLedger(entry: LedgerEntry) {
    const next = [entry, ...readLedger()].slice(0, 25);
    try { writeLedger(next); } catch { /* Rendering the completed result must not fail on storage errors. */ }
  }

  async function prepareDeviceModel() {
    setEngineStatus("checking");
    const status = await prepareLocalModel();
    setEngineStatus(status);
  }

  function draftForDecision(routeDecision: RouteDecision): CloudEnvelopeDraft {
    const reviewedRedaction = redactTexts([reviewedInstruction, reviewedEvidence], protectedTermList());
    const categories = [...new Set([
      ...routeDecision.redactionCategories,
      ...reviewedRedaction.categories,
    ])];
    return createCloudEnvelopeDraft({
      taskClass: routeDecision.taskClass,
      instruction: reviewedRedaction.texts[0],
      evidence: reviewedRedaction.texts[1],
      sourceTokensEstimate: routeDecision.estimatedInputTokens,
      evidenceTokensEstimate: estimateTokens(reviewedRedaction.texts[1]),
      categories,
      matchCount: routeDecision.redactionMatchCount + reviewedRedaction.matchCount,
    });
  }

  async function runRequest() {
    if (!prompt.trim() || !context.trim()) return;
    setRunState("routing"); setAnswer("");
    const started = performance.now();
    await new Promise((resolve) => window.setTimeout(resolve, 420));
    const nextDecision = routeRequest(prompt, context, sensitivity, {
      localModelReady: engineStatus === "ready",
      protectedTerms: protectedTermList(),
    });
    setDecision(nextDecision);
    setReviewedInstruction(nextDecision.cloudInstruction);
    setReviewedEvidence(nextDecision.evidencePack);

    if (nextDecision.route === "cloud-review") {
      setLatency(Math.round(performance.now() - started)); setRunState("ready"); return;
    }

    try {
      const result = await runLocalModel(nextDecision.taskClass, prompt, context, {
        onStatus: setEngineStatus,
        onText: setAnswer,
      });
      const elapsed = Math.round(performance.now() - started);
      setAnswer(result.answer); setAnswerEngine(result.model); setLatency(elapsed); setRunState("done");
      appendLedger({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), taskClass: nextDecision.taskClass, route: "local", engine: result.model, localSuitability: nextDecision.localSuitability, inputTokens: nextDecision.estimatedInputTokens, sentTokens: 0, latencyMs: elapsed, sensitiveOverride: false });
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : "The on-device model failed.");
      setAnswerEngine("local error");
      setRunState("done");
      setEngineStatus("error");
    }
  }

  async function submitCloud(
    envelope: CloudEnvelope,
    metadata: { localSuitability: number; sensitiveOverride: boolean },
    queueId?: string,
  ): Promise<boolean> {
    setRunState("running-cloud");
    const started = performance.now();
    try {
      const response = await fetch("/api/cloud", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope) });
      const data = (await response.json()) as {
        answer?: string;
        mode?: string;
        model?: string;
        usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
        error?: string;
        errorKind?: string;
      };
      if (response.status === 503) setConnectivity("offline");
      if (!response.ok) throw new Error(data.error ?? "Cloud specialist failed");
      const elapsed = Math.round(performance.now() - started);
      setAnswer(data.answer ?? "No answer returned."); setAnswerEngine(data.model ?? data.mode ?? "cloud"); setLatency(elapsed); setRunState("done");
      appendLedger({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), taskClass: envelope.taskClass, route: "cloud", engine: data.mode ?? "cloud", localSuitability: metadata.localSuitability, inputTokens: envelope.sourceTokensEstimate, sentTokens: data.usage?.inputTokens ?? 0, latencyMs: elapsed, sensitiveOverride: metadata.sensitiveOverride });
      if (queueId) {
        const next = removeCloudQueueItem(readCloudQueue(), queueId);
        try { writeCloudQueue(next); } catch { /* The provider result remains successful if persistence fails. */ }
      }
      return true;
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : "Cloud specialist failed."); setAnswerEngine("error"); setRunState("done");
      return false;
    } finally {
      cloudSubmissionRef.current = false;
    }
  }

  async function runCloud() {
    if (!decision || cloudSubmissionRef.current) return;
    cloudSubmissionRef.current = true;
    const envelope = await approveCloudEnvelope(draftForDecision(decision), new Date().toISOString());
    await submitCloud(envelope, {
      localSuitability: decision.localSuitability,
      sensitiveOverride: decision.requiresSensitiveOverride,
    });
  }

  function queueCloud() {
    if (!decision) return;
    const draft = draftForDecision(decision);
    const next = enqueueCloudEnvelope(readCloudQueue(), draft, crypto.randomUUID(), new Date().toISOString(), decision.localSuitability, decision.requiresSensitiveOverride);
    try { writeCloudQueue(next); } catch { /* The UI still reports the in-memory queue state. */ }
    setAnswer("Sanitized evidence queued locally. Reconnect, review it again, then approve sending.");
    setAnswerEngine("queued locally");
    setRunState("done");
  }

  function beginQueuedReview(item: QueuedCloudEnvelope) {
    const next = markCloudQueueReviewing(readCloudQueue(), item.id);
    try { writeCloudQueue(next); } catch { /* Keep review available in memory. */ }
    setQueuedReviewId(item.id);
    setQueuedReviewInstruction(item.envelope.instruction);
    setQueuedReviewEvidence(item.envelope.evidence);
  }

  async function sendQueued(item: QueuedCloudEnvelope) {
    if (queuedReviewId !== item.id || cloudSubmissionRef.current) return;
    cloudSubmissionRef.current = true;
    const reviewedRedaction = redactTexts([queuedReviewInstruction, queuedReviewEvidence], protectedTermList());
    const envelope = await approveCloudEnvelope({
      ...item.envelope,
      instruction: reviewedRedaction.texts[0],
      evidence: reviewedRedaction.texts[1],
      evidenceTokensEstimate: estimateTokens(reviewedRedaction.texts[1]),
      redaction: {
        categories: [...new Set([...item.envelope.redaction.categories, ...reviewedRedaction.categories])],
        matchCount: item.envelope.redaction.matchCount + reviewedRedaction.matchCount,
      },
    }, new Date().toISOString());
    const sent = await submitCloud(envelope, {
      localSuitability: item.localSuitability,
      sensitiveOverride: item.sensitiveOverride,
    }, item.id);
    if (sent) {
      setQueuedReviewId(null);
      setQueuedReviewInstruction("");
      setQueuedReviewEvidence("");
    } else {
      const next = markCloudQueueReadyForReview(readCloudQueue(), item.id);
      try { writeCloudQueue(next); } catch { /* Keep retry available in memory. */ }
      setQueuedReviewId(null);
    }
  }

  function resetLedger() { clearLedger(); }

  const online = connectivity === "online";
  const effectiveSensitivity = detectSensitivity(`${prompt}\n${context}`, sensitivity);
  const isBusy = runState === "routing" || runState === "running-cloud";
  const routeStages = decision ? decision.route === "local" ? ["Classify", "Policy", "Local model", "Account"] : ["Classify", "Policy", "Compress", "Review", "Cloud", "Account"] : ["Classify", "Policy", "Execute", "Account"];

  return (
    <main className={styles.app}>
      <header className={styles.topbar}>
        <div className={styles.brand}><span className={styles.brandMark}>12</span><span>TWELFTHMAN</span></div>
        <div className={styles.statusCluster}>
          <span className={`${styles.statusPill} ${online && cloudConfigured ? styles.online : styles.offline}`}>{connectivity === "checking" ? <LoaderCircle className={styles.spin} size={14} /> : online ? <Wifi size={14} /> : <WifiOff size={14} />}{connectivity === "checking" ? "Checking cloud" : !online ? cloudConfigured ? "Offline mode · Azure configured" : "Offline mode" : cloudConfigured ? "Azure configured" : "Azure setup needed"}</span>
          {engineStatus === "unavailable" || engineStatus === "error" ? <button className={styles.modelButton} onClick={() => void prepareDeviceModel()}><Cpu size={14} />Retry local runtime</button> : <span className={styles.statusPill}><Cpu size={14} />{engineStatus === "ready" ? "Foundry Local ready" : engineStatus === "running" ? "Foundry Local running" : "Checking local runtime"}</span>}
        </div>
      </header>

      <section className={styles.titleBand}>
        <div><p className={styles.eyebrow}>LOCAL-FIRST AI ROUTER</p><h1>TwelfthMan</h1><p className={styles.subtitle}>Local first. Cloud on demand.</p></div>
        <div className={styles.routeRail} aria-label="Request route">
          {routeStages.map((stage, index) => <div className={styles.routeStage} key={stage}><span className={decision ? styles.stageComplete : ""}>{decision ? <Check size={13} /> : index + 1}</span><strong>{stage}</strong>{index < routeStages.length - 1 && <ChevronRight size={16} />}</div>)}
        </div>
      </section>

      <section className={styles.scoreStrip} aria-label="Local AI scorecard">
        <Metric icon={<Gauge />} label="Local share" value={`${stats.localShare}%`} accent />
        <Metric icon={<Zap />} label="Est. tokens avoided" value={stats.estimatedAvoidedTokens.toLocaleString()} />
        <Metric icon={<Cloud />} label="Actual cloud input" value={stats.actualCloudInputTokens.toLocaleString()} />
        <Metric icon={<BarChart3 />} label="Requests scored" value={stats.total.toString()} />
      </section>

      <section className={styles.workspace}>
        <div className={styles.inputPane}>
          <div className={styles.sectionHeading}><div><span className={styles.stepNumber}>01</span><h2>Try any task</h2></div><span className={`${styles.labelBadge} ${effectiveSensitivity !== "public" ? styles.sensitive : ""}`}>{effectiveSensitivity !== "public" && <LockKeyhole size={13} />}{effectiveSensitivity}</span></div>
          <label className={styles.fieldLabel} htmlFor="context">Your content</label>
          <textarea id="context" className={styles.contextInput} placeholder="Paste or type the content to process locally." value={context} onChange={(event) => updateContext(event.target.value)} disabled={isBusy} />
          <div className={styles.fieldRow}><label className={styles.fieldLabel} htmlFor="prompt">What do you need?</label><label className={styles.sensitivityControl}><span>Sensitivity</span><select value={sensitivity} onChange={(event) => updateSensitivity(event.target.value as Sensitivity)} disabled={isBusy}><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option></select></label></div>
          <textarea id="prompt" className={styles.promptInput} placeholder="For example: Summarize this into key updates and next actions." value={prompt} onChange={(event) => updatePrompt(event.target.value)} disabled={isBusy} />
          <label className={styles.fieldLabel} htmlFor="protected-terms">Protected terms</label>
          <input id="protected-terms" className={styles.protectedInput} placeholder="Comma-separated names, projects, or organizations" value={protectedTerms} onChange={(event) => updateProtectedTerms(event.target.value)} disabled={isBusy} />
          <button className={styles.runButton} onClick={runRequest} disabled={isBusy || !prompt.trim() || !context.trim()}>{isBusy ? <LoaderCircle className={styles.spin} size={18} /> : <Play size={17} fill="currentColor" />}{runState === "routing" ? "Evaluating request" : "Route and run"}{!isBusy && <ArrowRight size={17} />}</button>
        </div>

        <div className={styles.outputPane}>
          <div className={styles.sectionHeading}><div><span className={styles.stepNumber}>02</span><h2>Routing decision</h2></div>{decision && <span className={`${styles.routeBadge} ${decision.route === "local" ? styles.localBadge : styles.cloudBadge}`}>{decision.route === "local" ? <Cpu size={14} /> : <Cloud size={14} />}{decision.route === "local" ? "LOCAL" : "CLOUD REVIEW"}</span>}</div>
          {!decision && runState === "idle" && <div className={styles.emptyState}><div className={styles.pitchGraphic} aria-hidden="true"><span /></div><h3>Ready to route</h3><p>Your route, policy decision, token delta, and answer will appear here.</p></div>}
          {runState === "routing" && <div className={styles.analysisState}><LoaderCircle className={styles.spin} /><strong>Evaluating request</strong><span>Classifying task and applying policy</span></div>}
          {decision && runState !== "routing" && (
            <div className={styles.result}>
              <div className={styles.decisionSummary}><div className={styles.suitabilityRing} style={{ "--suitability": `${Math.round(decision.localSuitability * 100) * 3.6}deg` } as React.CSSProperties}><span>{Math.round(decision.localSuitability * 100)}%</span></div><div><span className={styles.microLabel}>LOCAL SUITABILITY</span><h3>{decision.reason}</h3><p>{decision.taskClass} · {decision.estimatedInputTokens} estimated tokens</p></div></div>
              {decision.requiresSensitiveOverride && <div className={styles.policyNotice}><ShieldCheck size={19} /><div><strong>Sensitive override required</strong><span>Only reviewed, redacted evidence may cross the device boundary.</span></div></div>}
              {decision.route === "cloud-review" && !online && <div className={styles.offlineNotice}><WifiOff size={19} /><div><strong>Cloud lane unavailable</strong><span>The sanitized request can be reviewed now and queued in the next implementation slice.</span></div></div>}
              {decision.route === "cloud-review" && runState === "ready" && <div className={styles.evidencePanel}><div className={styles.evidenceHeading}><div><FileLock2 size={17} /><strong>Outbound evidence preview</strong></div><span>{decision.estimatedInputTokens} → {estimateTokens(reviewedEvidence)} estimated tokens</span></div>{decision.redactionCategories.length > 0 && <div className={styles.redactionChips}>{decision.redactionCategories.map((category) => <span key={category}>{category}</span>)}</div>}<label className={styles.fieldLabel} htmlFor="reviewed-instruction">Sanitized request</label><textarea id="reviewed-instruction" aria-label="Reviewed outbound instruction" className={styles.instructionEditor} value={reviewedInstruction} onChange={(event) => setReviewedInstruction(event.target.value)} /><label className={styles.fieldLabel} htmlFor="reviewed-evidence">Sanitized evidence</label><textarea id="reviewed-evidence" aria-label="Reviewed outbound evidence" className={styles.evidenceEditor} value={reviewedEvidence} onChange={(event) => setReviewedEvidence(event.target.value)} /><div className={styles.compressionBar}><span style={{ width: `${Math.max(5, (estimateTokens(reviewedEvidence) / decision.estimatedInputTokens) * 100)}%` }} /></div><button className={styles.cloudButton} onClick={online ? runCloud : queueCloud} disabled={!reviewedInstruction.trim() || !reviewedEvidence.trim()}>{online ? <Cloud size={17} /> : <WifiOff size={17} />}{online ? "Review complete — send evidence" : "Queue sanitized evidence locally"}<ArrowRight size={16} /></button></div>}
              {answer && <AnswerPanel answer={answer} engine={answerEngine} latency={latency} />}
            </div>
          )}
          {!decision && answer && <AnswerPanel answer={answer} engine={answerEngine} latency={latency} />}
        </div>
      </section>

      <section className={styles.ledgerSection}>
        <div className={styles.ledgerTitle}><div><span className={styles.stepNumber}>03</span><h2>Local ledger</h2></div><button onClick={resetLedger} title="Clear ledger"><RotateCcw size={16} /> Clear</button></div>
        {cloudQueue.length > 0 && <div className={styles.queuePanel}><div><WifiOff size={17} /><strong>Sanitized cloud queue</strong><span>{cloudQueue.length} awaiting review</span></div>{cloudQueue.map((item) => <div className={styles.queueItem} key={item.id}><p>{item.envelope.evidence}</p><span>{item.status.replaceAll("-", " ")}</span>{online && item.status === "ready-for-review" && <button onClick={() => beginQueuedReview(item)} disabled={isBusy}><FileLock2 size={15} /> Review full request</button>}{online && item.status === "reviewing" && queuedReviewId === item.id && <div className={styles.queueReview}><textarea aria-label="Queued outbound instruction" value={queuedReviewInstruction} onChange={(event) => setQueuedReviewInstruction(event.target.value)} /><textarea aria-label="Queued outbound evidence" value={queuedReviewEvidence} onChange={(event) => setQueuedReviewEvidence(event.target.value)} /><button onClick={() => void sendQueued(item)} disabled={isBusy || !queuedReviewInstruction.trim() || !queuedReviewEvidence.trim()}><Cloud size={15} /> I reviewed both — send</button></div>}</div>)}</div>}
        <div className={styles.ledgerTable}><div className={styles.tableHeader}><span>Task</span><span>Route</span><span>Local suitability</span><span>Cloud input</span><span>Latency</span></div>{ledger.slice(0, 5).map((entry) => <div className={styles.tableRow} key={entry.id}><span>{entry.taskClass}</span><span className={entry.route === "local" ? styles.localText : styles.cloudText}>{entry.route === "local" ? <Cpu size={14} /> : <Cloud size={14} />}{entry.route}</span><span>{Math.round(entry.localSuitability * 100)}%</span><span>{entry.sentTokens.toLocaleString()}</span><span>{entry.latencyMs.toLocaleString()} ms</span></div>)}{!ledger.length && <div className={styles.emptyLedger}>Run a request to begin the ledger.</div>}</div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value, accent = false }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return <div className={`${styles.metric} ${accent ? styles.metricAccent : ""}`}><span className={styles.metricIcon}>{icon}</span><div><span>{label}</span><strong>{value}</strong></div></div>;
}

function AnswerPanel({ answer, engine, latency }: { answer: string; engine: string; latency: number }) {
  return (
    <div className={styles.answerPanel}>
      <div className={styles.answerHeading}><div><Sparkles size={17} /><strong>Answer</strong></div><span>{engine.replaceAll("-", " ")} · {latency} ms</span></div>
      <div className={styles.markdownAnswer}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: () => null }}>{answer}</ReactMarkdown>
      </div>
    </div>
  );
}