/**
 * Provider-neutral durable runtime ports for NodeAgent.
 *
 * The core frame runner stays database-agnostic. Apps bring adapters for their
 * job store, frame store, leases, journal, scheduler, artifact storage, tools,
 * and policy context. This file includes an in-memory adapter so every contract
 * can be tested without Convex, AWS, Postgres, SQLite, or another provider.
 */

import type { NodeAgentTool } from "../types/nodeAgentTypes";
import { type RunInput } from "./nodeAgentRuntime";
import {
  runReasoningFrame,
  type ReasoningFrame,
  type ReasoningFrameRunInput,
  type ReasoningFrameRunReceipt,
  type ReasoningFrameStatus,
} from "./reasoningFrameRunner";

export type DurableJobStatus = "queued" | "running" | "completed" | "blocked" | "failed" | "canceled";
export type DurableFrameRunStatus = "completed" | "blocked" | "failed" | "leased" | "replayed";
export type DurableJournalStatus = "completed" | "blocked" | "failed";

export interface DurableJob {
  jobId: string;
  frameId: string;
  status: DurableJobStatus;
  attempts: number;
  priority: number;
  runAfter: number;
  createdAt: number;
  updatedAt: number;
  cursor?: string;
  receiptRef?: string;
  completedAt?: number;
  blockedAt?: number;
  failedAt?: number;
  error?: string;
}

export interface DurableFrameRecord {
  frameId: string;
  frame: ReasoningFrame;
  status: ReasoningFrameStatus;
  createdAt: number;
  updatedAt: number;
  receiptRef?: string;
  evidence?: ReasoningFrameRunReceipt["verification"]["evidenceState"];
}

export interface DurableLease {
  leaseId: string;
  resourceId: string;
  holderId: string;
  acquiredAt: number;
  expiresAt: number;
  fencingToken: number;
}

export interface DurableJournalEntry {
  key: string;
  jobId: string;
  frameId: string;
  step: "runReasoningFrame";
  attempt: number;
  status: DurableJournalStatus;
  createdAt: number;
  receiptRef?: string;
  error?: string;
}

export interface DurableArtifact<T = unknown> {
  artifactId: string;
  kind: string;
  value: T;
  createdAt: number;
}

export interface PolicyContext {
  principalId: string;
  tenantId?: string;
  scopes: string[];
  egressAllowed?: boolean;
  spendLimitCents?: number;
}

export interface DurableJobStore {
  create(input: {
    jobId: string;
    frameId: string;
    now: number;
    priority?: number;
    runAfter?: number;
    cursor?: string;
  }): Promise<DurableJob>;
  get(jobId: string): Promise<DurableJob | undefined>;
  update(jobId: string, patch: Partial<DurableJob>): Promise<DurableJob>;
  listRunnable(now: number, limit?: number): Promise<DurableJob[]>;
}

export interface DurableFrameStore {
  put(frame: ReasoningFrame, now: number): Promise<DurableFrameRecord>;
  get(frameId: string): Promise<DurableFrameRecord | undefined>;
  update(frameId: string, patch: Partial<DurableFrameRecord>): Promise<DurableFrameRecord>;
}

export interface LeaseStore {
  claim(input: {
    resourceId: string;
    holderId: string;
    ttlMs: number;
    now: number;
  }): Promise<DurableLease | null>;
  release(leaseId: string, holderId: string): Promise<boolean>;
  get(resourceId: string): Promise<DurableLease | undefined>;
}

export interface StepJournal {
  get(key: string): Promise<DurableJournalEntry | undefined>;
  writeOnce(entry: DurableJournalEntry): Promise<boolean>;
  listByJob(jobId: string): Promise<DurableJournalEntry[]>;
}

export interface DurableScheduler {
  enqueueFrame(input: {
    frame: ReasoningFrame;
    now: number;
    jobId?: string;
    priority?: number;
    runAfter?: number;
  }): Promise<DurableJob>;
  nextRunnable(now: number): Promise<DurableJob | undefined>;
}

export interface ArtifactStore {
  putJson<T>(input: {
    artifactId: string;
    kind: string;
    value: T;
    now: number;
  }): Promise<DurableArtifact<T>>;
  getJson<T>(artifactId: string): Promise<T | undefined>;
}

export interface ToolRuntime {
  runTool<I, O>(tool: NodeAgentTool<I, O>, input: I, policy?: PolicyContext): Promise<O>;
}

export interface DurableRuntimePorts {
  jobStore: DurableJobStore;
  frameStore: DurableFrameStore;
  leaseStore: LeaseStore;
  journal: StepJournal;
  scheduler: DurableScheduler;
  artifactStore: ArtifactStore;
  toolRuntime: ToolRuntime;
}

export interface DurableFrameRunInput {
  jobId: string;
  workerId: string;
  input?: RunInput;
  now?: number;
  leaseTtlMs?: number;
  executor?: (input: ReasoningFrameRunInput) => ReasoningFrameRunReceipt;
}

export interface DurableFrameRunOutcome {
  status: DurableFrameRunStatus;
  replayed: boolean;
  reason: string;
  journalKey?: string;
  job?: DurableJob;
  frame?: DurableFrameRecord;
  lease?: DurableLease;
  receipt?: ReasoningFrameRunReceipt;
}

function isTerminalJobStatus(status: DurableJobStatus): boolean {
  return status === "completed" || status === "blocked" || status === "failed" || status === "canceled";
}

export function frameJournalKey(job: Pick<DurableJob, "jobId" | "frameId">): string {
  return `${job.jobId}:${job.frameId}:runReasoningFrame`;
}

export async function enqueueDurableReasoningFrame(
  runtime: DurableRuntimePorts,
  input: {
    frame: ReasoningFrame;
    now: number;
    jobId?: string;
    priority?: number;
    runAfter?: number;
  },
): Promise<DurableJob> {
  return runtime.scheduler.enqueueFrame(input);
}

export async function runDurableReasoningFrame(
  runtime: DurableRuntimePorts,
  input: DurableFrameRunInput,
): Promise<DurableFrameRunOutcome> {
  const now = input.now ?? Date.now();
  const leaseTtlMs = input.leaseTtlMs ?? 30_000;
  const job = await runtime.jobStore.get(input.jobId);
  if (!job) {
    return { status: "failed", replayed: false, reason: `Missing durable job: ${input.jobId}` };
  }

  const frame = await runtime.frameStore.get(job.frameId);
  if (!frame) {
    return {
      status: "failed",
      replayed: false,
      reason: `Missing durable frame: ${job.frameId}`,
      job,
    };
  }

  const journalKey = frameJournalKey(job);
  const journalEntry = await runtime.journal.get(journalKey);
  if (journalEntry?.receiptRef) {
    return replayFromReceiptRef(runtime, {
      job,
      frame,
      journalKey,
      receiptRef: journalEntry.receiptRef,
      reason: "Journal entry already exists; replaying stored receipt.",
    });
  }

  if (isTerminalJobStatus(job.status) && job.receiptRef) {
    return replayFromReceiptRef(runtime, {
      job,
      frame,
      journalKey,
      receiptRef: job.receiptRef,
      reason: "Job already reached a terminal state; replaying stored receipt.",
    });
  }

  const lease = await runtime.leaseStore.claim({
    resourceId: `job:${job.jobId}`,
    holderId: input.workerId,
    ttlMs: leaseTtlMs,
    now,
  });
  if (!lease) {
    return {
      status: "leased",
      replayed: false,
      reason: "Job is leased by another worker.",
      job,
      frame,
      journalKey,
    };
  }

  try {
    const runningJob = await runtime.jobStore.update(job.jobId, {
      status: "running",
      attempts: job.attempts + 1,
      updatedAt: now,
    });
    const runningFrame: ReasoningFrame = { ...frame.frame, status: "running" };
    await runtime.frameStore.update(frame.frameId, {
      frame: runningFrame,
      status: "running",
      updatedAt: now,
    });

    const execute = input.executor ?? runReasoningFrame;
    const receipt = execute({ frame: runningFrame, input: input.input });
    const terminalStatus = jobStatusFromReceipt(receipt.status);
    const artifact = await runtime.artifactStore.putJson({
      artifactId: `receipt:${job.jobId}:${receipt.frameId}`,
      kind: "reasoning-frame-receipt",
      value: receipt,
      now,
    });

    const wroteJournal = await runtime.journal.writeOnce({
      key: journalKey,
      jobId: job.jobId,
      frameId: job.frameId,
      step: "runReasoningFrame",
      attempt: runningJob.attempts,
      status: terminalStatus,
      receiptRef: artifact.artifactId,
      createdAt: now,
    });
    if (!wroteJournal) {
      return replayFromReceiptRef(runtime, {
        job: runningJob,
        frame: await runtime.frameStore.get(frame.frameId) ?? frame,
        journalKey,
        receiptRef: artifact.artifactId,
        reason: "Journal write lost an idempotency race; replaying receipt.",
      });
    }

    const finishedFrame = await runtime.frameStore.update(frame.frameId, {
      frame: { ...runningFrame, status: receipt.status },
      status: receipt.status,
      evidence: receipt.verification.evidenceState,
      receiptRef: artifact.artifactId,
      updatedAt: now,
    });
    const finishedJob = await runtime.jobStore.update(job.jobId, {
      status: terminalStatus,
      receiptRef: artifact.artifactId,
      updatedAt: now,
      ...terminalTimestamp(terminalStatus, now),
    });

    return {
      status: terminalStatus,
      replayed: false,
      reason: receipt.verification.reason,
      journalKey,
      job: finishedJob,
      frame: finishedFrame,
      lease,
      receipt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Durable frame run failed.";
    const failedFrame = await runtime.frameStore.update(frame.frameId, {
      frame: { ...frame.frame, status: "failed" },
      status: "failed",
      updatedAt: now,
    });
    const failedJob = await runtime.jobStore.update(job.jobId, {
      status: "failed",
      error: message,
      updatedAt: now,
      failedAt: now,
    });
    await runtime.journal.writeOnce({
      key: journalKey,
      jobId: job.jobId,
      frameId: job.frameId,
      step: "runReasoningFrame",
      attempt: failedJob.attempts,
      status: "failed",
      error: message,
      createdAt: now,
    });
    return {
      status: "failed",
      replayed: false,
      reason: message,
      journalKey,
      job: failedJob,
      frame: failedFrame,
      lease,
    };
  } finally {
    await runtime.leaseStore.release(lease.leaseId, input.workerId);
  }
}

export function createInMemoryDurableRuntime(): DurableRuntimePorts {
  const jobs = new Map<string, DurableJob>();
  const frames = new Map<string, DurableFrameRecord>();
  const leases = new Map<string, DurableLease>();
  const fencingTokens = new Map<string, number>();
  const journal = new Map<string, DurableJournalEntry>();
  const artifacts = new Map<string, DurableArtifact>();

  const jobStore: DurableJobStore = {
    async create(input) {
      if (jobs.has(input.jobId)) throw new Error(`Durable job already exists: ${input.jobId}`);
      const job: DurableJob = {
        jobId: input.jobId,
        frameId: input.frameId,
        status: "queued",
        attempts: 0,
        priority: input.priority ?? 0,
        runAfter: input.runAfter ?? input.now,
        cursor: input.cursor,
        createdAt: input.now,
        updatedAt: input.now,
      };
      jobs.set(job.jobId, clone(job));
      return clone(job);
    },
    async get(jobId) {
      const job = jobs.get(jobId);
      return job ? clone(job) : undefined;
    },
    async update(jobId, patch) {
      const current = jobs.get(jobId);
      if (!current) throw new Error(`Durable job not found: ${jobId}`);
      const next: DurableJob = { ...current, ...patch, jobId: current.jobId, frameId: current.frameId };
      jobs.set(jobId, clone(next));
      return clone(next);
    },
    async listRunnable(now, limit = 1) {
      return [...jobs.values()]
        .filter((job) => job.status === "queued" && job.runAfter <= now)
        .sort((a, b) => b.priority - a.priority || a.runAfter - b.runAfter || a.createdAt - b.createdAt || a.jobId.localeCompare(b.jobId))
        .slice(0, Math.max(1, limit))
        .map(clone);
    },
  };

  const frameStore: DurableFrameStore = {
    async put(frame, now) {
      const record: DurableFrameRecord = {
        frameId: frame.frameId,
        frame: clone(frame),
        status: frame.status,
        createdAt: now,
        updatedAt: now,
      };
      frames.set(record.frameId, clone(record));
      return clone(record);
    },
    async get(frameId) {
      const frame = frames.get(frameId);
      return frame ? clone(frame) : undefined;
    },
    async update(frameId, patch) {
      const current = frames.get(frameId);
      if (!current) throw new Error(`Durable frame not found: ${frameId}`);
      const next: DurableFrameRecord = {
        ...current,
        ...patch,
        frameId: current.frameId,
        createdAt: current.createdAt,
      };
      frames.set(frameId, clone(next));
      return clone(next);
    },
  };

  const leaseStore: LeaseStore = {
    async claim(input) {
      const current = leases.get(input.resourceId);
      if (current && current.expiresAt > input.now) return null;
      const fencingToken = (fencingTokens.get(input.resourceId) ?? 0) + 1;
      fencingTokens.set(input.resourceId, fencingToken);
      const lease: DurableLease = {
        leaseId: `${input.resourceId}:lease:${fencingToken}`,
        resourceId: input.resourceId,
        holderId: input.holderId,
        acquiredAt: input.now,
        expiresAt: input.now + input.ttlMs,
        fencingToken,
      };
      leases.set(input.resourceId, clone(lease));
      return clone(lease);
    },
    async release(leaseId, holderId) {
      const match = [...leases.entries()].find(([, lease]) => lease.leaseId === leaseId && lease.holderId === holderId);
      if (!match) return false;
      leases.delete(match[0]);
      return true;
    },
    async get(resourceId) {
      const lease = leases.get(resourceId);
      return lease ? clone(lease) : undefined;
    },
  };

  const stepJournal: StepJournal = {
    async get(key) {
      const entry = journal.get(key);
      return entry ? clone(entry) : undefined;
    },
    async writeOnce(entry) {
      if (journal.has(entry.key)) return false;
      journal.set(entry.key, clone(entry));
      return true;
    },
    async listByJob(jobId) {
      return [...journal.values()]
        .filter((entry) => entry.jobId === jobId)
        .sort((a, b) => a.createdAt - b.createdAt || a.key.localeCompare(b.key))
        .map(clone);
    },
  };

  const artifactStore: ArtifactStore = {
    async putJson(input) {
      const artifact: DurableArtifact<typeof input.value> = {
        artifactId: input.artifactId,
        kind: input.kind,
        value: clone(input.value),
        createdAt: input.now,
      };
      artifacts.set(input.artifactId, clone(artifact));
      return clone(artifact);
    },
    async getJson<T>(artifactId: string) {
      const artifact = artifacts.get(artifactId);
      return artifact ? clone(artifact.value) as T : undefined;
    },
  };

  const scheduler: DurableScheduler = {
    async enqueueFrame(input) {
      await frameStore.put(input.frame, input.now);
      return jobStore.create({
        jobId: input.jobId ?? `job_${input.frame.frameId}`,
        frameId: input.frame.frameId,
        now: input.now,
        priority: input.priority,
        runAfter: input.runAfter,
      });
    },
    async nextRunnable(now) {
      const [job] = await jobStore.listRunnable(now, 1);
      return job;
    },
  };

  const toolRuntime: ToolRuntime = {
    async runTool(tool, input, _policy) {
      return tool.handler(input);
    },
  };

  return {
    jobStore,
    frameStore,
    leaseStore,
    journal: stepJournal,
    scheduler,
    artifactStore,
    toolRuntime,
  };
}

function jobStatusFromReceipt(status: ReasoningFrameStatus): DurableJournalStatus {
  if (status === "completed" || status === "blocked" || status === "failed") return status;
  return "failed";
}

function terminalTimestamp(status: DurableJournalStatus, now: number): Pick<DurableJob, "completedAt" | "blockedAt" | "failedAt"> {
  if (status === "completed") return { completedAt: now };
  if (status === "blocked") return { blockedAt: now };
  return { failedAt: now };
}

async function replayFromReceiptRef(
  runtime: DurableRuntimePorts,
  input: {
    job: DurableJob;
    frame: DurableFrameRecord;
    journalKey: string;
    receiptRef: string;
    reason: string;
  },
): Promise<DurableFrameRunOutcome> {
  const receipt = await runtime.artifactStore.getJson<ReasoningFrameRunReceipt>(input.receiptRef);
  if (!receipt) {
    return {
      status: "failed",
      replayed: false,
      reason: `Missing receipt artifact: ${input.receiptRef}`,
      journalKey: input.journalKey,
      job: input.job,
      frame: input.frame,
    };
  }
  return {
    status: "replayed",
    replayed: true,
    reason: input.reason,
    journalKey: input.journalKey,
    job: input.job,
    frame: input.frame,
    receipt,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
