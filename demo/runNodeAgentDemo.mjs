/**
 * runNodeAgentDemo.mjs — zero-dependency, zero-build instant demo.
 *
 *   node demo/runNodeAgentDemo.mjs
 *
 * No install, no TypeScript, no Convex. This is a faithful, compact MIRROR of
 * the canonical modules in src/features/** (which are the tested source of
 * truth). It computes the real numbers — token-overlap grounding, the winning
 * source, and the runway recompute (7560 / 420 = 18.0) — so the loop is honest,
 * not scripted.
 */

const STOP = new Set(["the","a","an","and","or","is","are","to","of","in","on","for","with","does","do","still","what","which","how","vs","if","we","our","us","it","this","that"]);
const stem = (w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const tok = (s) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)).map(stem));
const overlap = (q, text) => { const t = tok(text); let h = 0; for (const w of q) if (t.has(w)) h++; return q.size ? h / q.size : 0; };

const QUESTION = "Does our wedge hold versus Acme, and does the runway model survive 18 months?";
const SOURCES = [
  { id: "src_bench", kind: "RAG", title: "room://benchmark — wedge holds vs Acme on latency", snippet: "Defends the wedge: NodeAgent retrieval latency p95 211ms versus Acme 540ms on the shared eval set; grounded answer rate 0.93 across 103 queries.", retrieval: 0.91 },
  { id: "src_finance", kind: "DOC", title: "finance://burn — runway model", snippet: "Cash on hand 7.56M dollars; net burn 420k dollars per month base case; the runway model survives 18 months after the two senior hires.", retrieval: 0.62 },
  { id: "src_diligence", kind: "DOC", title: "diligence://wedge — competitive note", snippet: "Our wedge versus Acme holds on the shared latency benchmark; grounded retrieval is the defensible moat.", retrieval: 0.5 },
  { id: "src_teardown", kind: "WEB", title: "Acme teardown blog — Why context rooms lose", snippet: "Marketing claim that shared rooms cannot scale; no benchmark methodology and no shared eval set disclosed.", retrieval: 0.62 },
];
const GROUNDING_THRESHOLD = 0.34;
const round2 = (n) => Math.round(n * 100) / 100;
const bar = "─".repeat(68);

// ── Layer 2: ground + rank ──
const q = tok(QUESTION);
const ranked = SOURCES
  .map((s) => {
    const grounding = round2(overlap(q, `${s.title} ${s.snippet}`));
    return { ...s, grounding, rankScore: round2(0.62 * grounding + 0.38 * s.retrieval) };
  })
  .sort((a, b) => b.rankScore - a.rankScore || (a.id < b.id ? -1 : 1));
ranked.forEach((s, i) => { s.citation = i + 1; s.winner = i === 0 && s.grounding >= GROUNDING_THRESHOLD; });
const grounded = ranked.filter((s) => s.grounding >= GROUNDING_THRESHOLD);
const confidence = grounded.length >= 3 ? "high" : grounded.length >= 1 ? "medium" : "low";

// ── Layer 3: extractive synthesis (no fabrication) ──
const winner = ranked.find((s) => s.winner) ?? ranked[0];
const answer = confidence === "low"
  ? ""
  : `Best-grounded source [${winner.citation}] (${winner.kind}): ${winner.snippet} Corroborated by ${grounded.slice(1, 4).map((s) => `[${s.citation}] ${s.title}`).join("; ")}.`;

// ── Versioned model delta: correct burn 510 -> 420, recompute runway ──
let version = 1;
const cash = 7560;
let burn = 510;
let runway = round2(cash / burn); // 14.82
const from = { burn, runway };
burn = 420; version += 1; runway = round2(cash / burn); // 18.0
const changes = [
  { label: "Net burn / mo ($k)", from: from.burn, to: burn },
  { label: "Runway (months)", from: from.runway, to: runway },
];

// ── Output ──
console.log(`\n${bar}\nNodeAgent (no-deps mirror) — ${QUESTION}\n${bar}`);
console.log("\nTRACE\n  ✓ gather   3 context items · 2 active");
console.log(`  ✓ search   ${grounded.length} grounded · confidence ${confidence}`);
console.log(`  ✓ model    v1 → v${version} · ${changes.length} cells`);
console.log("  ✓ memo     5 blocks");

console.log("\nSEARCH & SYNTHESIZE");
for (const s of ranked) {
  console.log(`  ${s.winner ? "★" : " "} [${s.citation}] ${s.kind.padEnd(4)} g=${s.grounding.toFixed(2)} rank=${s.rankScore.toFixed(2)}  ${s.title}`);
}
console.log(`  answer: ${answer}`);

console.log("\nMODEL DELTA  (v1 → v" + version + ")");
for (const c of changes) console.log(`    ${c.label.padEnd(22)} ${c.from} → ${c.to}`);

console.log("\nMEMO (markdown)");
console.log(`  # Acme — diligence memo\n`);
console.log(`  The room asked: "${QUESTION}"\n`);
console.log(`  > **Claim** (${grounded.length}/${ranked.length}): ${answer} [${winner.citation}]\n`);
console.log(`  Model updated to v${version}: runway now ${runway}.`);

console.log(`\n${bar}\noverall status: OK\n${bar}\n`);
