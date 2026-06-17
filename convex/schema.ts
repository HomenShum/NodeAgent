/**
 * NodeAgent Convex schema — the live backend contract.
 *
 * The self-contained prototype runs on deterministic demo data, but the real
 * cross-collaborative room is backed by these tables. Distilled from NodeBench
 * AI's `liveEvent*` tables (rooms, presence, messages, answers) plus the
 * documents / spreadsheets / notebook stores.
 *
 * New fields on shared tables are declared `v.optional(...)` so the schema can
 * evolve without a destructive migration (expand-contract).
 *
 * To run live: `npx convex dev` with VITE_CONVEX_URL set (see .env.example).
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  /* ── live cross-collaborative room ── */
  rooms: defineTable({
    roomCode: v.string(),
    title: v.string(),
    status: v.union(v.literal("live"), v.literal("ended"), v.literal("draft")),
    publicDiscoverable: v.boolean(),
    /** Hashed host ownership key — never store the raw key. */
    hostKeyHash: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_code", ["roomCode"])
    .index("by_status", ["status", "createdAt"]),

  /** Presence — pruned by a 5-minute lastSeenAt TTL window. */
  roomMembers: defineTable({
    roomCode: v.string(),
    sessionId: v.string(),
    name: v.string(),
    role: v.union(v.literal("human"), v.literal("agent")),
    lastSeenAt: v.number(),
  })
    .index("by_room", ["roomCode"])
    .index("by_room_lastSeen", ["roomCode", "lastSeenAt"]),

  roomMessages: defineTable({
    roomCode: v.string(),
    authorId: v.string(),
    authorName: v.string(),
    role: v.union(v.literal("human"), v.literal("agent")),
    text: v.string(),
    attachmentRef: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_room_time", ["roomCode", "createdAt"]),

  /** Synthesized /ask answers with their grounding + citation chain. */
  roomAnswers: defineTable({
    roomCode: v.string(),
    query: v.string(),
    answer: v.string(),
    confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
    groundedCount: v.number(),
    citations: v.array(
      v.object({
        index: v.number(),
        sourceId: v.string(),
        title: v.string(),
        url: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
  }).index("by_room_time", ["roomCode", "createdAt"]),

  /* ── documents (search corpus) ── */
  documents: defineTable({
    title: v.string(),
    kind: v.union(
      v.literal("doc"),
      v.literal("rag"),
      v.literal("web"),
      v.literal("sec"),
      v.literal("news"),
    ),
    content: v.string(),
    url: v.optional(v.string()),
    createdBy: v.string(),
    isPublic: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_creator", ["createdBy"])
    .index("by_kind", ["kind"]),

  /* ── spreadsheets (versioned model + operation log) ── */
  spreadsheets: defineTable({
    name: v.string(),
    version: v.number(),
    ownerId: v.string(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  spreadsheetCells: defineTable({
    spreadsheetId: v.id("spreadsheets"),
    address: v.string(),
    value: v.number(),
    formula: v.optional(v.string()),
    label: v.optional(v.string()),
  }).index("by_sheet", ["spreadsheetId"]),

  /** Append-only delta log — every cell change is defensible. */
  spreadsheetDeltas: defineTable({
    spreadsheetId: v.id("spreadsheets"),
    fromVersion: v.number(),
    toVersion: v.number(),
    author: v.string(),
    reason: v.optional(v.string()),
    changes: v.array(
      v.object({
        address: v.string(),
        from: v.union(v.number(), v.null()),
        to: v.number(),
      }),
    ),
    appliedAt: v.number(),
  }).index("by_sheet_version", ["spreadsheetId", "toVersion"]),

  /* durable NodeAgent runtime ports */
  nodeagentJobs: defineTable({
    jobId: v.string(),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("completed"), v.literal("failed"), v.literal("cancelled")),
    priority: v.number(),
    attempts: v.number(),
    maxAttempts: v.number(),
    cursor: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job", ["jobId"])
    .index("by_status_priority", ["status", "priority", "createdAt"]),

  nodeagentFrames: defineTable({
    frameId: v.string(),
    jobId: v.string(),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed")),
    contextPack: v.string(),
    resultRef: v.optional(v.string()),
    evidenceRef: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_frame", ["frameId"])
    .index("by_job", ["jobId"]),

  nodeagentLeases: defineTable({
    resourceId: v.string(),
    workerId: v.string(),
    leaseId: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_resource", ["resourceId"])
    .index("by_expiry", ["expiresAt"]),

  nodeagentJournal: defineTable({
    journalKey: v.string(),
    jobId: v.string(),
    frameId: v.string(),
    stepName: v.string(),
    inputHash: v.string(),
    outputHash: v.string(),
    receiptRef: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_key", ["journalKey"])
    .index("by_job", ["jobId"]),

  nodeagentReceipts: defineTable({
    receiptId: v.string(),
    jobId: v.string(),
    frameId: v.string(),
    status: v.string(),
    json: v.string(),
    createdAt: v.number(),
  })
    .index("by_receipt", ["receiptId"])
    .index("by_job", ["jobId"]),

  /* ── notebooks ── */
  notebooks: defineTable({
    title: v.string(),
    ownerId: v.string(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  notebookBlocks: defineTable({
    notebookId: v.id("notebooks"),
    blockId: v.string(),
    type: v.union(
      v.literal("heading"),
      v.literal("paragraph"),
      v.literal("claim"),
      v.literal("citation"),
      v.literal("entity"),
    ),
    text: v.string(),
    order: v.number(),
    groundedRatio: v.optional(v.string()),
    entity: v.optional(v.string()),
    evidence: v.optional(
      v.array(
        v.object({
          index: v.number(),
          sourceId: v.string(),
          title: v.string(),
          url: v.optional(v.string()),
        }),
      ),
    ),
  }).index("by_notebook", ["notebookId", "order"]),
});
