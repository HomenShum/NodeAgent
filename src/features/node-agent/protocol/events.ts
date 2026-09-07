/**
 * Canonical append-only NodeAgent event envelope.
 *
 * This mirrors nodeagent.event/v1 in NodeKit. Product-specific trace rows are
 * projections of these events; they are not alternate event protocols.
 */

export const NODEAGENT_EVENT_SCHEMA_VERSION = "nodeagent.event/v1" as const;

export type NodeAgentActorType = "user" | "agent" | "tool" | "policy" | "system";

export interface NodeAgentEventActor {
  type: NodeAgentActorType;
  id?: string;
}

export interface NodeAgentEventRef {
  kind: string;
  id: string;
  uri?: string;
  hash?: string;
}

export interface NodeAgentEvent<TPayload = unknown> {
  schemaVersion: typeof NODEAGENT_EVENT_SCHEMA_VERSION;
  eventId: string;
  runId: string;
  sequence: number;
  type: string;
  occurredAt: string;
  actor?: NodeAgentEventActor;
  refs?: NodeAgentEventRef[];
  payload: TPayload;
}

const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_.-]*$/;

export function createNodeAgentEvent<TPayload>(
  event: Omit<NodeAgentEvent<TPayload>, "schemaVersion">,
): NodeAgentEvent<TPayload> {
  const candidate: NodeAgentEvent<TPayload> = {
    schemaVersion: NODEAGENT_EVENT_SCHEMA_VERSION,
    ...event,
  };
  const issues = validateNodeAgentEvent(candidate);
  if (issues.length > 0) {
    throw new Error(`Invalid nodeagent.event/v1: ${issues.join("; ")}`);
  }
  return candidate;
}

export function validateNodeAgentEvent(event: NodeAgentEvent): string[] {
  const issues: string[] = [];
  if (event.schemaVersion !== NODEAGENT_EVENT_SCHEMA_VERSION) issues.push("unsupported schemaVersion");
  if (!event.eventId.trim()) issues.push("eventId must be non-empty");
  if (!event.runId.trim()) issues.push("runId must be non-empty");
  if (!Number.isInteger(event.sequence) || event.sequence < 0) issues.push("sequence must be an integer >= 0");
  if (!EVENT_TYPE_PATTERN.test(event.type)) issues.push("type must be a namespaced lowercase slug");
  if (!isIsoDateTime(event.occurredAt)) issues.push("occurredAt must be an ISO date-time");
  if (event.actor?.id !== undefined && !event.actor.id.trim()) issues.push("actor.id must be non-empty when present");
  for (const [index, ref] of (event.refs ?? []).entries()) {
    if (!ref.kind.trim()) issues.push(`refs[${index}].kind must be non-empty`);
    if (!ref.id.trim()) issues.push(`refs[${index}].id must be non-empty`);
    if (ref.uri !== undefined && !ref.uri.trim()) issues.push(`refs[${index}].uri must be non-empty when present`);
    if (ref.hash !== undefined && !ref.hash.trim()) issues.push(`refs[${index}].hash must be non-empty when present`);
  }
  return issues;
}

function isIsoDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}
