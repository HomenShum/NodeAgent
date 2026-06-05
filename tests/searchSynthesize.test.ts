/**
 * Search & synthesize — scenario-based tests for the grounding pipeline.
 *
 * The point of these tests is the REFUSAL: when sources are weak, the pipeline
 * must decline rather than fabricate. Plus ranking, the winner ("right doc"),
 * the citation chain, and the SSRF guard on the live-fetch path.
 */

import { describe, it, expect } from "vitest";
import {
  groundingOf,
  isSafeFetchUrl,
  rankSources,
  retrievalConfidence,
  searchAndSynthesize,
} from "../src/features/search/searchAndSynthesize";
import type { SearchSource } from "../src/features/node-agent/types/nodeAgentTypes";

const QUERY = "wedge latency benchmark versus Acme";

const STRONG: SearchSource[] = [
  { id: "a", kind: "RAG", title: "benchmark — retrieval latency", snippet: "wedge holds: latency benchmark versus Acme is strong", retrievalScore: 0.9 },
  { id: "b", kind: "DOC", title: "wedge vs Acme analysis", snippet: "Acme wedge latency versus our benchmark on retrieval", retrievalScore: 0.6 },
  { id: "c", kind: "DOC", title: "wedge latency memo", snippet: "our wedge retrieval latency versus Acme benchmark", retrievalScore: 0.7 },
];

const WEAK: SearchSource[] = [
  { id: "x", kind: "WEB", title: "unrelated cooking blog", snippet: "how to bake sourdough bread at home", retrievalScore: 0.95 },
  { id: "y", kind: "WEB", title: "travel guide to Lisbon", snippet: "best pastel de nata in the city", retrievalScore: 0.9 },
];

describe("grounding (HONEST_SCORES — computed, not hardcoded)", () => {
  it("scores a topical source above an off-topic one regardless of retrieval score", () => {
    const onTopic = groundingOf(QUERY, STRONG[0]);
    const offTopic = groundingOf(QUERY, WEAK[0]);
    expect(onTopic).toBeGreaterThan(offTopic);
    expect(offTopic).toBe(0);
  });
});

describe("ranking + winner ('right document for right answer')", () => {
  it("marks exactly one winner: the best-grounded source, with citation 1", () => {
    const ranked = rankSources(QUERY, STRONG);
    const winners = ranked.filter((s) => s.winner);
    expect(winners).toHaveLength(1);
    expect(winners[0].citation).toBe(1);
    expect(winners[0].grounding).toBeGreaterThan(0.34);
  });

  it("high retrieval score cannot rescue an off-topic source into the winner slot", () => {
    const mixed = [...WEAK, STRONG[0]];
    const ranked = rankSources(QUERY, mixed);
    expect(ranked.find((s) => s.winner)?.id).toBe("a");
  });
});

describe("confidence gate (Layer 1)", () => {
  it("rates a corroborated set as high", () => {
    expect(retrievalConfidence(rankSources(QUERY, STRONG))).toBe("high");
  });
  it("rates an off-topic set as low", () => {
    expect(retrievalConfidence(rankSources(QUERY, WEAK))).toBe("low");
  });
});

describe("the refusal (anti-hallucination)", () => {
  it("declines to synthesize on weak grounding and says so honestly", () => {
    const res = searchAndSynthesize(QUERY, WEAK);
    expect(res.confidence).toBe("low");
    expect(res.answer).toBe("");
    expect(res.groundedCount).toBe(0);
    expect(res.note).toMatch(/declin/i);
  });

  it("synthesizes a cited answer on strong grounding", () => {
    const res = searchAndSynthesize(QUERY, STRONG);
    expect(res.answer.length).toBeGreaterThan(0);
    expect(res.citations.length).toBeGreaterThan(0);
    // Every citation index points at a real ranked source.
    for (const c of res.citations) {
      expect(res.sources.some((s) => s.id === c.sourceId && s.citation === c.index)).toBe(true);
    }
    // The answer references the winner's citation marker.
    expect(res.answer).toContain("[1]");
  });

  it("uses an injected synthesizer when provided (pluggable LLM seam)", () => {
    const res = searchAndSynthesize(QUERY, STRONG, {
      synthesizer: ({ grounded }) => `LLM says: ${grounded.length} grounded`,
    });
    expect(res.answer).toMatch(/^LLM says:/);
  });
});

describe("SSRF guard (live fetch path)", () => {
  it("allows public https URLs", () => {
    expect(isSafeFetchUrl("https://example.com/doc")).toBe(true);
  });
  it("blocks private, loopback, link-local, and metadata hosts", () => {
    for (const bad of [
      "http://localhost/x",
      "http://127.0.0.1/x",
      "http://10.0.0.5/x",
      "http://192.168.1.1/x",
      "http://172.16.0.1/x",
      "http://169.254.169.254/latest/meta-data",
      "http://metadata.google.internal/",
      "file:///etc/passwd",
      "not a url",
    ]) {
      expect(isSafeFetchUrl(bad), bad).toBe(false);
    }
  });
});
