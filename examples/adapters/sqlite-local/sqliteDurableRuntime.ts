import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import type {
  ArtifactStore,
  DurableArtifact,
  DurableFrameRecord,
  DurableFrameStore,
  DurableJob,
  DurableJobStore,
  DurableJournalEntry,
  DurableLease,
  DurableRuntimePorts,
  DurableScheduler,
  LeaseStore,
  StepJournal,
  ToolRuntime,
} from "../../../src/features/node-agent/runtime/durableRuntime";
import type { ReasoningFrame, ReasoningFrameRunReceipt } from "../../../src/features/node-agent/runtime/reasoningFrameRunner";

export interface SqliteDurableRuntimeOptions {
  databasePath: string;
  schemaPath?: string;
}

export type SqliteDurableRuntime = DurableRuntimePorts & {
  close(): void;
};

interface JobRow {
  job_id: string;
  frame_id: string;
  status: DurableJob["status"];
  attempts: number;
  priority: number;
  run_after: number;
  cursor: string | null;
  receipt_ref: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  blocked_at: number | null;
  failed_at: number | null;
}

interface FrameRow {
  frame_id: string;
  frame_json: string;
  status: DurableFrameRecord["status"];
  evidence_json: string | null;
  receipt_ref: string | null;
  created_at: number;
  updated_at: number;
}

interface LeaseRow {
  resource_id: string;
  lease_id: string;
  holder_id: string;
  acquired_at: number;
  expires_at: number;
  fencing_token: number;
}

interface JournalRow {
  key: string;
  job_id: string;
  frame_id: string;
  step: DurableJournalEntry["step"];
  attempt: number;
  status: DurableJournalEntry["status"];
  receipt_ref: string | null;
  error: string | null;
  created_at: number;
}

interface ArtifactRow {
  artifact_id: string;
  kind: string;
  value_json: string;
  created_at: number;
}

export function createSqliteDurableRuntime(options: SqliteDurableRuntimeOptions): SqliteDurableRuntime {
  const databasePath = options.databasePath === ":memory:" ? options.databasePath : resolve(options.databasePath);
  if (databasePath !== ":memory:") {
    const parent = dirname(databasePath);
    if (parent && parent !== "." && !existsSync(parent)) mkdirSync(parent, { recursive: true });
  }

  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schemaPath = options.schemaPath ?? resolve("examples/adapters/sqlite-local/schema.sql");
  db.exec(readFileSync(schemaPath, "utf8"));

  const jobStore: DurableJobStore = {
    async create(input) {
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
      db.prepare(`
        insert into nodeagent_jobs (
          job_id, frame_id, status, attempts, priority, run_after, cursor,
          receipt_ref, error, created_at, updated_at, completed_at, blocked_at, failed_at
        ) values (
          @jobId, @frameId, @status, @attempts, @priority, @runAfter, @cursor,
          @receiptRef, @error, @createdAt, @updatedAt, @completedAt, @blockedAt, @failedAt
        )
      `).run(jobParams(job));
      return clone(job);
    },
    async get(jobId) {
      const row = db.prepare("select * from nodeagent_jobs where job_id = ?").get(jobId) as JobRow | undefined;
      return row ? jobFromRow(row) : undefined;
    },
    async update(jobId, patch) {
      const current = await this.get(jobId);
      if (!current) throw new Error(`SQLite durable job not found: ${jobId}`);
      const next = { ...current, ...patch, jobId: current.jobId, frameId: current.frameId };
      db.prepare(`
        update nodeagent_jobs set
          status = @status,
          attempts = @attempts,
          priority = @priority,
          run_after = @runAfter,
          cursor = @cursor,
          receipt_ref = @receiptRef,
          error = @error,
          updated_at = @updatedAt,
          completed_at = @completedAt,
          blocked_at = @blockedAt,
          failed_at = @failedAt
        where job_id = @jobId
      `).run(jobParams(next));
      return clone(next);
    },
    async listRunnable(now, limit = 1) {
      const rows = db.prepare(`
        select * from nodeagent_jobs
        where status = 'queued' and run_after <= ?
        order by priority desc, run_after asc, created_at asc, job_id asc
        limit ?
      `).all(now, Math.max(1, limit)) as JobRow[];
      return rows.map(jobFromRow);
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
      db.prepare(`
        insert or replace into nodeagent_frames (
          frame_id, frame_json, status, evidence_json, receipt_ref, created_at, updated_at
        ) values (
          @frameId, @frameJson, @status, @evidenceJson, @receiptRef, @createdAt, @updatedAt
        )
      `).run(frameParams(record));
      return clone(record);
    },
    async get(frameId) {
      const row = db.prepare("select * from nodeagent_frames where frame_id = ?").get(frameId) as FrameRow | undefined;
      return row ? frameFromRow(row) : undefined;
    },
    async update(frameId, patch) {
      const current = await this.get(frameId);
      if (!current) throw new Error(`SQLite durable frame not found: ${frameId}`);
      const next = {
        ...current,
        ...patch,
        frameId: current.frameId,
        createdAt: current.createdAt,
      };
      db.prepare(`
        update nodeagent_frames set
          frame_json = @frameJson,
          status = @status,
          evidence_json = @evidenceJson,
          receipt_ref = @receiptRef,
          updated_at = @updatedAt
        where frame_id = @frameId
      `).run(frameParams(next));
      return clone(next);
    },
  };

  const leaseStore: LeaseStore = {
    async claim(input) {
      const claimLease = db.transaction((): DurableLease | null => {
        const current = db.prepare("select * from nodeagent_leases where resource_id = ?").get(input.resourceId) as LeaseRow | undefined;
        if (current && current.expires_at > input.now) return null;
        const fencingToken = (current?.fencing_token ?? 0) + 1;
        const lease: DurableLease = {
          leaseId: `${input.resourceId}:lease:${fencingToken}`,
          resourceId: input.resourceId,
          holderId: input.holderId,
          acquiredAt: input.now,
          expiresAt: input.now + input.ttlMs,
          fencingToken,
        };
        db.prepare(`
          insert into nodeagent_leases (
            resource_id, lease_id, holder_id, acquired_at, expires_at, fencing_token
          ) values (
            @resourceId, @leaseId, @holderId, @acquiredAt, @expiresAt, @fencingToken
          )
          on conflict(resource_id) do update set
            lease_id = excluded.lease_id,
            holder_id = excluded.holder_id,
            acquired_at = excluded.acquired_at,
            expires_at = excluded.expires_at,
            fencing_token = excluded.fencing_token
        `).run(leaseParams(lease));
        return lease;
      });
      const lease = claimLease();
      return lease ? clone(lease) : null;
    },
    async release(leaseId, holderId) {
      const result = db.prepare("delete from nodeagent_leases where lease_id = ? and holder_id = ?").run(leaseId, holderId);
      return result.changes > 0;
    },
    async get(resourceId) {
      const row = db.prepare("select * from nodeagent_leases where resource_id = ?").get(resourceId) as LeaseRow | undefined;
      return row ? leaseFromRow(row) : undefined;
    },
  };

  const journal: StepJournal = {
    async get(key) {
      const row = db.prepare("select * from nodeagent_journal where key = ?").get(key) as JournalRow | undefined;
      return row ? journalFromRow(row) : undefined;
    },
    async writeOnce(entry) {
      const result = db.prepare(`
        insert or ignore into nodeagent_journal (
          key, job_id, frame_id, step, attempt, status, receipt_ref, error, created_at
        ) values (
          @key, @jobId, @frameId, @step, @attempt, @status, @receiptRef, @error, @createdAt
        )
      `).run(journalParams(entry));
      return result.changes === 1;
    },
    async listByJob(jobId) {
      const rows = db.prepare(`
        select * from nodeagent_journal
        where job_id = ?
        order by created_at asc, key asc
      `).all(jobId) as JournalRow[];
      return rows.map(journalFromRow);
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
      db.prepare(`
        insert or replace into nodeagent_artifacts (
          artifact_id, kind, value_json, created_at
        ) values (
          @artifactId, @kind, @valueJson, @createdAt
        )
      `).run(artifactParams(artifact));
      return clone(artifact);
    },
    async getJson<T>(artifactId: string) {
      const row = db.prepare("select * from nodeagent_artifacts where artifact_id = ?").get(artifactId) as ArtifactRow | undefined;
      return row ? JSON.parse(row.value_json) as T : undefined;
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
    journal,
    scheduler,
    artifactStore,
    toolRuntime,
    close: () => db.close(),
  };
}

function jobFromRow(row: JobRow): DurableJob {
  return stripUndefined({
    jobId: row.job_id,
    frameId: row.frame_id,
    status: row.status,
    attempts: row.attempts,
    priority: row.priority,
    runAfter: row.run_after,
    cursor: row.cursor ?? undefined,
    receiptRef: row.receipt_ref ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    blockedAt: row.blocked_at ?? undefined,
    failedAt: row.failed_at ?? undefined,
  });
}

function frameFromRow(row: FrameRow): DurableFrameRecord {
  return stripUndefined({
    frameId: row.frame_id,
    frame: JSON.parse(row.frame_json) as ReasoningFrame,
    status: row.status,
    evidence: row.evidence_json ? JSON.parse(row.evidence_json) as ReasoningFrameRunReceipt["verification"]["evidenceState"] : undefined,
    receiptRef: row.receipt_ref ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function leaseFromRow(row: LeaseRow): DurableLease {
  return {
    leaseId: row.lease_id,
    resourceId: row.resource_id,
    holderId: row.holder_id,
    acquiredAt: row.acquired_at,
    expiresAt: row.expires_at,
    fencingToken: row.fencing_token,
  };
}

function journalFromRow(row: JournalRow): DurableJournalEntry {
  return stripUndefined({
    key: row.key,
    jobId: row.job_id,
    frameId: row.frame_id,
    step: row.step,
    attempt: row.attempt,
    status: row.status,
    receiptRef: row.receipt_ref ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
  });
}

function jobParams(job: DurableJob) {
  return {
    jobId: job.jobId,
    frameId: job.frameId,
    status: job.status,
    attempts: job.attempts,
    priority: job.priority,
    runAfter: job.runAfter,
    cursor: job.cursor ?? null,
    receiptRef: job.receiptRef ?? null,
    error: job.error ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt ?? null,
    blockedAt: job.blockedAt ?? null,
    failedAt: job.failedAt ?? null,
  };
}

function frameParams(frame: DurableFrameRecord) {
  return {
    frameId: frame.frameId,
    frameJson: JSON.stringify(frame.frame),
    status: frame.status,
    evidenceJson: frame.evidence ? JSON.stringify(frame.evidence) : null,
    receiptRef: frame.receiptRef ?? null,
    createdAt: frame.createdAt,
    updatedAt: frame.updatedAt,
  };
}

function leaseParams(lease: DurableLease) {
  return {
    leaseId: lease.leaseId,
    resourceId: lease.resourceId,
    holderId: lease.holderId,
    acquiredAt: lease.acquiredAt,
    expiresAt: lease.expiresAt,
    fencingToken: lease.fencingToken,
  };
}

function journalParams(entry: DurableJournalEntry) {
  return {
    key: entry.key,
    jobId: entry.jobId,
    frameId: entry.frameId,
    step: entry.step,
    attempt: entry.attempt,
    status: entry.status,
    receiptRef: entry.receiptRef ?? null,
    error: entry.error ?? null,
    createdAt: entry.createdAt,
  };
}

function artifactParams<T>(artifact: DurableArtifact<T>) {
  return {
    artifactId: artifact.artifactId,
    kind: artifact.kind,
    valueJson: JSON.stringify(artifact.value),
    createdAt: artifact.createdAt,
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
