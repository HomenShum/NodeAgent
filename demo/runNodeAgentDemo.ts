/**
 * runNodeAgentDemo.ts — run the REAL NodeAgent loop over the canonical scenario.
 *
 *   npm run demo            (via tsx)
 *
 * Exercises the actual ported modules (context collector, grounded search,
 * versioned spreadsheet, notebook) end-to-end and prints the result. This is
 * the same loop the prototype and the React app run; here it's a CLI.
 */

import { runNodeAgent } from "../src/features/node-agent/runtime/nodeAgentRuntime";
import { buildDemoScenario } from "../src/features/node-agent/demoScenario";
import { toMarkdown } from "../src/features/notebook/notebookEditor";

const BAR = "─".repeat(68);

function main(): void {
  const scenario = buildDemoScenario();
  const labels = labelMap(scenario);
  const result = runNodeAgent(scenario);

  console.log(`\n${BAR}\nNodeAgent — ${result.question}\n${BAR}`);

  console.log("\nTRACE");
  for (const s of result.steps) {
    const icon = s.status === "done" ? "✓" : s.status === "error" ? "✗" : "•";
    console.log(`  ${icon} ${pad(s.name, 8)} ${s.detail}`);
  }

  console.log("\nCONTEXT GATHERED");
  for (const it of result.context.items) {
    console.log(`  [${it.relevance.toFixed(2)}] ${it.kind.padEnd(8)} ${truncate(it.text, 60)}`);
  }
  console.log(`  active teammates: ${result.context.activeParticipants}`);

  console.log("\nSEARCH & SYNTHESIZE");
  console.log(`  confidence: ${result.synthesis.confidence} · grounded ${result.synthesis.groundedCount}/${result.synthesis.sources.length}`);
  for (const s of result.synthesis.sources) {
    const mark = s.winner ? "★" : " ";
    console.log(`  ${mark} [${s.citation}] ${s.kind.padEnd(4)} g=${s.grounding.toFixed(2)} rank=${s.rankScore.toFixed(2)}  ${truncate(s.title, 44)}`);
  }
  console.log(`  answer: ${truncate(result.synthesis.answer, 160)}`);

  console.log("\nMODEL DELTA");
  if (result.modelDelta) {
    console.log(`  v${result.modelDelta.fromVersion} → v${result.modelDelta.toVersion} by ${result.modelDelta.author}`);
    for (const c of result.modelDelta.changes) {
      console.log(`    ${(labels[c.address] ?? c.address).padEnd(22)} ${String(c.from)} → ${c.to}`);
    }
    console.log(`    reason: ${result.modelDelta.reason ?? "—"}`);
  } else {
    console.log("  (no model change)");
  }

  console.log("\nMEMO (markdown)");
  console.log(
    toMarkdown(result.memo)
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n"),
  );

  console.log(`${BAR}\noverall status: ${result.status.toUpperCase()}\n${BAR}\n`);

  if (result.status === "error") process.exitCode = 1;
}

function labelMap(scenario: ReturnType<typeof buildDemoScenario>): Record<string, string> {
  const out: Record<string, string> = {};
  if (scenario.model) {
    for (const cell of Object.values(scenario.model.cells)) {
      if (cell.label) out[cell.address] = cell.label;
    }
  }
  return out;
}

function pad(s: string, n: number): string {
  return s.padEnd(n);
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

main();
