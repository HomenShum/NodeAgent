/**
 * MCP tool registry — discovery metadata for NodeAgent's tools.
 *
 * Mirrors NodeBench AI's progressive-discovery registry: each entry carries a
 * category and `nextTools` (what commonly runs next), and `discoverTools`
 * does a lightweight hybrid keyword search so an agent can find the right tool
 * without loading every schema up front.
 *
 * Prior art: NodeBench `packages/mcp-local/src/tools/toolRegistry.ts`.
 */

import type { ToolRegistryEntry } from "../features/node-agent/types/nodeAgentTypes";

export const TOOL_REGISTRY: ToolRegistryEntry[] = [
  {
    name: "collect_context",
    category: "chat",
    description:
      "Gather and rank relevant room messages and documents for a focus question.",
    nextTools: ["search_synthesize", "run_agent"],
  },
  {
    name: "search_synthesize",
    category: "search",
    description:
      "Ground, rank, and synthesize a cited answer from sources; declines when grounding is weak.",
    nextTools: ["write_claim", "apply_spreadsheet_delta"],
  },
  {
    name: "apply_spreadsheet_delta",
    category: "spreadsheet",
    description:
      "Apply a versioned delta to a model with optimistic concurrency and dependent recompute.",
    nextTools: ["write_claim"],
  },
  {
    name: "write_claim",
    category: "notebook",
    description: "Insert a grounded claim block (statement + citations) into a memo.",
    nextTools: [],
  },
  {
    name: "run_agent",
    category: "runtime",
    description:
      "Run the full gather → search → model → memo loop and return a structured result.",
    nextTools: [],
  },
];

export interface DiscoverResult extends ToolRegistryEntry {
  score: number;
}

/**
 * Hybrid keyword search over the registry. Scores name (highest), category, and
 * description matches. Returns ranked, bounded results.
 */
export function discoverTools(query: string, limit = 5): DiscoverResult[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
  if (terms.length === 0) {
    return TOOL_REGISTRY.slice(0, limit).map((e) => ({ ...e, score: 0 }));
  }

  const scored = TOOL_REGISTRY.map((entry) => {
    const name = entry.name.toLowerCase();
    const cat = entry.category.toLowerCase();
    const desc = entry.description.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (name.includes(t)) score += 3;
      if (cat.includes(t)) score += 2;
      if (desc.includes(t)) score += 1;
    }
    return { ...entry, score };
  })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || cmp(a.name, b.name));

  return scored.slice(0, Math.max(1, Math.min(limit, TOOL_REGISTRY.length)));
}

/** Follow `nextTools` one hop to suggest a workflow chain. */
export function workflowChain(start: string): string[] {
  const seen = new Set<string>();
  const chain: string[] = [];
  let cursor: string | undefined = start;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    chain.push(cursor);
    const entry = TOOL_REGISTRY.find((e) => e.name === cursor);
    cursor = entry?.nextTools[0];
  }
  return chain;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
